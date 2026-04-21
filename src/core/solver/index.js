/**
 * src/core/solver/index.js — Public API for the modular MNA solver.
 *
 * Usage:
 *   import { createSession } from './core/solver/index.js'
 *
 *   const session = createSession(components, wires, { integrator: 'trapezoidal' })
 *   session.solveDC()
 *   // in RAF loop:
 *   const results = session.step(dt)
 *   // on cleanup:
 *   session.dispose()
 */

import { registry } from '../ComponentRegistry.js';
import { buildTopology } from './TopologyBuilder.js';
import { LUDecomposition } from './LUDecomposition.js';
import { runNewton } from './Newton.js';
import { resolveIntegrator, setSessionIntegrator } from './Integrator.js';
import { solveDCOperatingPoint } from './DCOperatingPoint.js';

/**
 * Create a reusable solver session for a fixed circuit topology.
 *
 * @param {object[]} components — array of component state objects (frozen topology)
 * @param {object[]} wires      — array of wire objects
 * @param {object}  [opts]
 * @param {'trapezoidal'|'backward-euler'} [opts.integrator='trapezoidal']
 * @returns {{ step, solveDC, dispose, getState }}
 */
export function createSession(components, wires, opts = {}) {
  const integrator = resolveIntegrator(opts.integrator ?? 'trapezoidal');

  // Publish integrator globally so models (Capacitor) can read it without circular imports.
  setSessionIntegrator(integrator);

  // ── 1. Build topology ─────────────────────────────────────────────────────
  const topology = buildTopology(components, wires);
  const { resolvedNodeMap, numNodes, extraVarMap, mnaSize } = topology;

  if (mnaSize === 0) {
    return {
      step: () => ({ nodeVoltages: {}, branchCurrents: {}, updatedComponentProperties: {} }),
      solveDC: () => {},
      dispose: () => {},
      getState: () => ({ X: new Float64Array(0), mnaSize: 0 }),
    };
  }

  // ── 2. Allocate persistent working matrices (no per-step allocation) ──────
  // Dense array-of-Float64Array: compatible with A[r][c] += v used by all models.
  const A = Array.from({ length: mnaSize }, () => new Float64Array(mnaSize));
  const Z = new Float64Array(mnaSize);
  const lu = new LUDecomposition(mnaSize);
  const xOut = new Float64Array(mnaSize);

  // Solution vector — warm-started across steps.
  const X = new Float64Array(mnaSize);

  const G_wire = 1e3; // 1 mΩ wire resistance

  // ── 3. Determine circuit linearity ───────────────────────────────────────
  // When all components are linear, Newton converges in exactly 1 iteration.
  const allLinear = components.every(c => {
    const model = registry.get(c.type);
    if (!model) return true;
    return typeof model.isLinear === 'function' ? model.isLinear() : true;
  });

  // ── 4. Helper: tempNodeVoltages from X ───────────────────────────────────
  const getTempNodeVoltages = (Xcurr) => {
    const nv = {};
    resolvedNodeMap.forEach((mnaIdx, pinId) => {
      nv[pinId] = mnaIdx === 0 ? 0 : (Xcurr[mnaIdx - 1] || 0);
    });
    return nv;
  };

  // ── 5. Zero A (array-of-Float64Array) ────────────────────────────────────
  const zeroA = () => { for (const row of A) row.fill(0); };

  // ── 6. Stamp function — fills A and Z for current X guess ────────────────
  const stamp = (Xcurr, dt, currentComponents) => {
    zeroA();
    Z.fill(0);

    const tempNV = getTempNodeVoltages(Xcurr);

    currentComponents.forEach(c => {
      const model = registry.get(c.type);
      if (!model) return;
      const extraVarIndices = extraVarMap.get(c.id) || [];
      model.applyMNA(A, Z, c, resolvedNodeMap, extraVarIndices, tempNV, dt);
    });

    // Wires: stamp as low-resistance conductances using dense array indexing
    wires.forEach(w => {
      const n1 = resolvedNodeMap.get(w.startPinId) || 0;
      const n2 = resolvedNodeMap.get(w.endPinId) || 0;
      if (n1 > 0) A[n1 - 1][n1 - 1] += G_wire;
      if (n2 > 0) A[n2 - 1][n2 - 1] += G_wire;
      if (n1 > 0 && n2 > 0) {
        A[n1 - 1][n2 - 1] -= G_wire;
        A[n2 - 1][n1 - 1] -= G_wire;
      }
    });
  };

  // ── 7. Solve function — factors A, solves into xOut ──────────────────────
  const solve = (xDest) => {
    lu.factor(A);
    lu.solve(Z, xDest);
  };

  // ── 8. Extract results from X ─────────────────────────────────────────────
  const extractResults = (Xcurr, currentComponents, dt) => {
    const nodeVoltages = {};
    resolvedNodeMap.forEach((mnaIdx, pinId) => {
      nodeVoltages[pinId] = mnaIdx === 0 ? 0 : (Xcurr[mnaIdx - 1] || 0);
    });

    const branchCurrents = {};
    const updatedComponentProperties = {};

    currentComponents.forEach(c => {
      const model = registry.get(c.type);
      if (!model) return;
      const extraVarValues = (extraVarMap.get(c.id) || []).map(idx => Xcurr[idx]);
      branchCurrents[c.id] = model.extractCurrent(c, nodeVoltages, extraVarValues, dt);
      const updates = model.getUpdatedProperties(c, nodeVoltages, extraVarValues, dt);
      if (updates) updatedComponentProperties[c.id] = updates;
    });

    wires.forEach(w => {
      const vStart = nodeVoltages[w.startPinId] || 0;
      const vEnd = nodeVoltages[w.endPinId] || 0;
      branchCurrents[w.id] = (vStart - vEnd) * G_wire;
    });

    return { nodeVoltages, branchCurrents, updatedComponentProperties };
  };

  // ── 9. Transient state: live component props across steps ─────────────────
  // Mirrors what App.jsx used to do with transientPropsMap, now owned by session.
  const liveProps = new Map(); // compId → partial props override

  const getLiveComponents = () =>
    components.map(c => {
      const override = liveProps.get(c.id);
      return override ? { ...c, properties: { ...c.properties, ...override } } : c;
    });

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Solve DC operating point. Primes X for transient start.
   * Falls back to X=0 if DC solve fails (logs warning).
   */
  const solveDC = () => {
    const dcX = new Float64Array(mnaSize);
    try {
      const ok = solveDCOperatingPoint(components, wires, topology, dcX);
      if (!ok) {
        console.warn('[Solver] DC operating point: partial convergence; using best estimate.');
      }
      for (let i = 0; i < mnaSize; i++) X[i] = dcX[i];

      // Prime capacitor vCap from DC node voltages
      const nodeVoltages = {};
      resolvedNodeMap.forEach((mnaIdx, pinId) => {
        nodeVoltages[pinId] = mnaIdx === 0 ? 0 : (X[mnaIdx - 1] || 0);
      });

      components.forEach(c => {
        const model = registry.get(c.type);
        if (model && typeof model.initDC === 'function') {
          model.initDC(c, nodeVoltages);
        }
        if (c.type === 'CAPACITOR') {
          const vA = nodeVoltages[c.pins[0].id] || 0;
          const vB = nodeVoltages[c.pins[1].id] || 0;
          liveProps.set(c.id, { ...(liveProps.get(c.id) || {}), vCap: vA - vB, iCap: 0 });
        }
      });
    } catch (err) {
      console.error('[Solver] DC operating point failed, starting from X=0:', err);
      X.fill(0);
    }
  };

  /**
   * Advance the simulation by one timestep dt.
   * @param {number} dt — timestep in seconds
   * @returns {{ nodeVoltages, branchCurrents, updatedComponentProperties }}
   */
  const step = (dt) => {
    const currentComponents = getLiveComponents();

    const stampFn = (Xcurr) => stamp(Xcurr, dt, currentComponents);
    const solveFn = (xDest) => solve(xDest);

    runNewton(stampFn, solveFn, X, allLinear, {
      maxIter: 50, absTol: 1e-9, relTol: 1e-4, vAbs: 1e-3, minIter: 1,
    });

    const results = extractResults(X, currentComponents, dt);

    // Persist component state updates (vCap, etc.) for next step
    for (const [id, props] of Object.entries(results.updatedComponentProperties)) {
      liveProps.set(id, { ...(liveProps.get(id) || {}), ...props });
    }

    return results;
  };

  const dispose = () => { liveProps.clear(); };

  const getState = () => ({
    X: X.slice(),
    mnaSize,
    integrator: integrator.name,
    allLinear,
  });

  return { step, solveDC, dispose, getState };
}
