/**
 * DCOperatingPoint.js — DC solve with source stepping.
 *
 * Algorithm:
 *   1. Scale all independent sources by α ∈ [0, 1] in steps.
 *   2. Treat capacitors as open circuit (tiny parallel conductance 1e-12 S → 1 TΩ).
 *   3. Run Newton at each α, using previous solution as warm start.
 *   4. Return true if converged at α = 1.
 */

import { registry } from '../ComponentRegistry.js';
import { runNewton } from './Newton.js';
import { LUDecomposition } from './LUDecomposition.js';

const DC_SOURCE_STEPS = [0.1, 0.25, 0.5, 0.75, 1.0];

/**
 * Solve for the DC operating point.
 *
 * @param {object[]} components
 * @param {object[]} wires
 * @param {{ resolvedNodeMap: Map, numNodes: number, extraVarMap: Map, mnaSize: number }} topology
 * @param {Float64Array} X — initial guess (mutated in-place with DC solution)
 * @returns {boolean} true if converged at α=1
 */
export function solveDCOperatingPoint(components, wires, topology, X) {
  const { resolvedNodeMap, extraVarMap, mnaSize } = topology;

  if (mnaSize === 0) return true;

  // Dense working matrix (array-of-Float64Array) — same format models expect.
  const A = Array.from({ length: mnaSize }, () => new Float64Array(mnaSize));
  const Z = new Float64Array(mnaSize);
  const lu = new LUDecomposition(mnaSize);
  const xOut = new Float64Array(mnaSize);

  const G_wire = 1e3;
  const G_cap_open = 1e-12; // 1 TΩ → effective open circuit for DC

  let converged = false;

  for (const alpha of DC_SOURCE_STEPS) {
    const stampDC = (Xcurr) => {
      // Zero dense matrix
      for (const row of A) row.fill(0);
      Z.fill(0);

      // Build tempNodeVoltages from Xcurr
      const tempNV = {};
      resolvedNodeMap.forEach((mnaIdx, pinId) => {
        tempNV[pinId] = mnaIdx === 0 ? 0 : (Xcurr[mnaIdx - 1] || 0);
      });

      components.forEach(c => {
        const model = registry.get(c.type);
        if (!model) return;

        const extraVarIndices = extraVarMap.get(c.id) || [];

        // Capacitors: open circuit (huge parallel resistance)
        if (c.type === 'CAPACITOR') {
          const n1 = resolvedNodeMap.get(c.pins[0].id) || 0;
          const n2 = resolvedNodeMap.get(c.pins[1].id) || 0;
          if (n1 > 0) A[n1 - 1][n1 - 1] += G_cap_open;
          if (n2 > 0) A[n2 - 1][n2 - 1] += G_cap_open;
          if (n1 > 0 && n2 > 0) {
            A[n1 - 1][n2 - 1] -= G_cap_open;
            A[n2 - 1][n1 - 1] -= G_cap_open;
          }
          return;
        }

        // Other components: stamp normally, with alpha scaling for sources.
        // applyMNA receives alpha as 8th argument — sources can scale accordingly.
        model.applyMNA(A, Z, c, resolvedNodeMap, extraVarIndices, tempNV, 1e-3, alpha);
      });

      // Wires
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

    const solveDC = (xDest) => {
      lu.factor(A);
      lu.solve(Z, xDest);
    };

    const allLinear = components.every(c => {
      const model = registry.get(c.type);
      return model && typeof model.isLinear === 'function' ? model.isLinear() : true;
    });

    const result = runNewton(
      stampDC,
      solveDC,
      X,
      allLinear,
      { maxIter: 50, absTol: 1e-9, relTol: 1e-4, minIter: 1 }
    );

    converged = result.converged;
    if (!converged) {
      console.warn(`[DC] Did not converge at alpha=${alpha}. Continuing with best estimate.`);
    }
  }

  return converged;
}
