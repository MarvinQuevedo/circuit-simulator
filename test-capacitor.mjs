/**
 * test-capacitor.mjs
 * Self-contained MNA simulation test — no JSX needed.
 * Tests:
 *   1. Simple RC circuit: 9V → R(1kΩ) → C(100µF) → GND
 *   2. Blinker circuit: Astable multivibrator
 *
 * Run: node test-capacitor.mjs 2>&1 | head -200
 */

// ── MNA Solver ──────────────────────────────────────────────────────────────
function solveLinearSystem(A, B) {
  const n = A.length;
  const M = A.map((row, i) => [...row, B[i]]);
  for (let i = 0; i < n; i++) {
    let maxEl = Math.abs(M[i][i]), maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > maxEl) { maxEl = Math.abs(M[k][i]); maxRow = k; }
    }
    [M[maxRow], M[i]] = [M[i], M[maxRow]];
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[i][i]) < 1e-12) continue;
      const c = -M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) M[k][j] = 0;
        else M[k][j] += c * M[i][j];
      }
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(M[i][i]) < 1e-12) { x[i] = 0; continue; }
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) M[k][n] -= M[k][i] * x[i];
  }
  return x;
}

// ── Minimal MNA Engine ───────────────────────────────────────────────────────
// Builds and solves the circuit for one timestep.
// components: array of { id, type, nodes: [n0, n1, ...], props: {...} }
// All node indices: 0 = ground, 1..N = non-ground nodes
// Returns { V: voltages[0..N], extraVars: [...] }

function mnaStep(components, numNodes, extraVarCount, prevX, dt) {
  const size = numNodes + extraVarCount;
  if (size === 0) return { V: [], extra: [] };

  const A = Array.from({ length: size }, () => new Array(size).fill(0));
  const Z = new Array(size).fill(0);

  // X from previous step: X[0..numNodes-1] = voltages, X[numNodes..] = extra vars
  // Stamp each component
  for (const c of components) {
    stampComponent(A, Z, c, prevX, numNodes, dt);
  }

  const X = solveLinearSystem(A, Z);
  return {
    V: [0, ...X.slice(0, numNodes)], // V[0]=GND, V[1..] = node voltages
    extra: X.slice(numNodes),
  };
}

function stampComponent(A, Z, comp, prevX, numNodes, dt) {
  const n = comp.nodes; // node indices (0=ground)
  const r = (ni) => ni > 0 ? ni - 1 : -1; // row/col in A (0-based, -1 = GND)

  const add = (ni, nj, g) => {
    const ri = r(ni), rj = r(nj);
    if (ri >= 0) A[ri][ri] += g;
    if (rj >= 0) A[rj][rj] += g;
    if (ri >= 0 && rj >= 0) { A[ri][rj] -= g; A[rj][ri] -= g; }
  };
  const inj = (ni, i) => { if (r(ni) >= 0) Z[r(ni)] += i; };
  const vAt = (ni) => ni > 0 ? (prevX[ni - 1] || 0) : 0;

  switch (comp.type) {
    case 'GND': break; // nothing to stamp

    case 'VSRC': {
      // Ideal voltage source: V(n[0]) - V(n[1]) = Vs
      // Extra variable index: n[2] (current branch variable, in extra vars)
      const k = comp.extraIdx; // index in full X (numNodes + k_offset)
      const ri = r(n[0]), rj = r(n[1]);
      if (ri >= 0) { A[ri][k] += 1; A[k][ri] += 1; }
      if (rj >= 0) { A[rj][k] -= 1; A[k][rj] -= 1; }
      Z[k] += comp.props.voltage;
      break;
    }

    case 'R': {
      const G = 1 / Math.max(comp.props.resistance, 1e-9);
      add(n[0], n[1], G);
      break;
    }

    case 'CAP': {
      const C = comp.props.capacitance;
      const vCap = comp.props.vCap ?? 0;
      const G_eq = C / Math.max(dt, 1e-9);
      const I_eq = G_eq * vCap;
      add(n[0], n[1], G_eq);
      inj(n[0], +I_eq);
      inj(n[1], -I_eq);
      break;
    }

    case 'NPN': {
      const { beta = 100, Vbe_on = 0.65, Ron = 10 } = comp.props;
      const vB = vAt(n[0]), vC = vAt(n[1]), vE = vAt(n[2]);
      const Vbe = vB - vE;
      const Vce = vC - vE;
      // B-E junction
      let G_be = 1e-9, Ieq = 0;
      if (Vbe > Vbe_on) { G_be = 1 / Ron; Ieq = Vbe_on * G_be; }
      add(n[0], n[2], G_be);
      inj(n[0], +Ieq); inj(n[2], -Ieq);
      // Collector: VCCS (active) or G_sat (saturation)
      if (Vbe > Vbe_on) {
        if (Vce >= 0.2) {
          // Active: VCCS — Ic = Gm*(Vb-Ve-Vbe_on)
          const Gm = beta / Ron;
          const rC = r(n[1]), rB = r(n[0]), rE = r(n[2]);
          if (rC >= 0 && rB >= 0) A[rC][rB] += Gm;
          if (rC >= 0 && rE >= 0) A[rC][rE] -= Gm;
          if (rE >= 0 && rB >= 0) A[rE][rB] -= Gm;
          if (rE >= 0)            A[rE][rE] += Gm;
          if (rC >= 0) Z[rC] += Gm * Vbe_on;
          if (rE >= 0) Z[rE] -= Gm * Vbe_on;
        } else {
          // Saturation: clamp Vce ≈ 0.2V
          const G_sat = 100, I_sat = G_sat * 0.2;
          add(n[1], n[2], G_sat);
          inj(n[1], +I_sat); inj(n[2], -I_sat);
        }
      }
      break;
    }
  }
}

// ── Test 1: Simple RC Circuit ─────────────────────────────────────────────────
// Nodes: 1=+rail, 2=mid(R-C junction), GND=0
// Components: VSRC(1→0), R(1→2), CAP(2→0)
function testRC() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('TEST 1: RC Circuit — 9V, R=1kΩ, C=100µF');
  console.log('Expected: vCap charges from 0V → 9V, τ = RC = 0.1s');
  console.log('         V_cap(t) = 9 * (1 - e^(-t/0.1))');
  console.log('═══════════════════════════════════════════════\n');

  const numNodes = 2; // nodes 1, 2
  const extraVarCount = 1; // one for vsrc current
  const vsrcExtraIdx = numNodes; // X[2]

  const components = [
    { id: 'vsrc', type: 'VSRC', nodes: [1, 0], extraIdx: vsrcExtraIdx, props: { voltage: 9 } },
    { id: 'res',  type: 'R',    nodes: [1, 2], props: { resistance: 1000 } },
    { id: 'cap',  type: 'CAP',  nodes: [2, 0], props: { capacitance: 100e-6, vCap: 0 } },
  ];

  const dt = 0.005; // 5ms per step
  let prevX = new Array(numNodes + extraVarCount).fill(0);
  let vCap = 0;
  let t = 0;

  console.log('Step |  t(ms)  | V_node1 | V_node2 | vCap   | I_cap(mA) | Expected_vCap | Error');
  console.log('-----|---------|---------|---------|--------|-----------|---------------|------');

  for (let step = 0; step <= 60; step++) {
    const cap = components.find(c => c.id === 'cap');
    cap.props.vCap = vCap;

    const size = numNodes + extraVarCount;
    const A = Array.from({ length: size }, () => new Array(size).fill(0));
    const Z = new Array(size).fill(0);

    for (const c of components) stampComponent(A, Z, c, prevX, numNodes, dt);

    const X = solveLinearSystem(A, Z);
    const V1 = X[0]; // node 1 voltage
    const V2 = X[1]; // node 2 voltage (cap+)
    const I_vsrc = X[2]; // vsrc branch current

    const G_eq = 100e-6 / dt;
    const I_cap = G_eq * (V2 - vCap); // current into cap

    const expectedVcap = 9 * (1 - Math.exp(-t / 0.1));
    const error = Math.abs(V2 - expectedVcap);

    if (step % 4 === 0 || step < 5) {
      console.log(
        `${String(step).padStart(4)} | ${(t * 1000).toFixed(0).padStart(6)}ms | ` +
        `${V1.toFixed(4).padStart(7)} | ${V2.toFixed(4).padStart(7)} | ` +
        `${vCap.toFixed(4).padStart(6)} | ${(I_cap * 1000).toFixed(3).padStart(9)} | ` +
        `${expectedVcap.toFixed(4).padStart(13)} | ${error.toFixed(4)}`
      );
    }

    // Update state for next step
    vCap = V2; // new vCap = current voltage across cap
    prevX = X;
    t += dt;
  }
  console.log(`\nFinal vCap = ${vCap.toFixed(4)}V (expected ~${(9*(1-Math.exp(-60*0.005/0.1))).toFixed(4)}V)`);
}

// ── Test 2: Blinker (Astable Multivibrator) ───────────────────────────────────
// Simplified: R_pull(22kΩ), R_collector(470Ω), NPN transistors, capacitors
// Nodes: 1=+rail, 2=Q1_col, 3=Q1_base, 4=Q2_col, 5=Q2_base
// GND=0, Q1_emitter=0, Q2_emitter=0
function testBlinker(initialC1vCap = 0, initialC2vCap = 0, label = '') {
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`TEST 2: Blinker — ${label}`);
  console.log(`Initial: C1.vCap=${initialC1vCap}V, C2.vCap=${initialC2vCap}V`);
  console.log(`═══════════════════════════════════════════════\n`);

  // Node map:
  // 0 = GND
  // 1 = +rail (9V)
  // 2 = Q1_col (= L1_pin1 = C1_pin0)
  // 3 = Q2_base (= C1_pin1 = R3_bottom)
  // 4 = Q2_col (= L2_pin1 = C2_pin1)
  // 5 = Q1_base (= C2_pin0 = R2_bottom)
  // Extra var: 6 = vsrc current

  const numNodes = 5;
  const extraVarCount = 1;
  const vsrcExtraIdx = numNodes; // X[5]

  // Component properties
  const Vcc = 9, R_coll = 470, R_pull = 22000;
  const beta = 100, Vbe_on = 0.65, Ron = 10;
  const C = 100e-6;

  const components = [
    // Power: +rail=1, GND=0
    { id: 'vsrc', type: 'VSRC', nodes: [1, 0], extraIdx: vsrcExtraIdx, props: { voltage: Vcc } },
    // Collector resistors: rail→Q1_col, rail→Q2_col
    { id: 'rc1', type: 'R', nodes: [1, 2], props: { resistance: R_coll } },
    { id: 'rc2', type: 'R', nodes: [1, 4], props: { resistance: R_coll } },
    // Base pull-ups: rail→Q1_base, rail→Q2_base
    { id: 'rp1', type: 'R', nodes: [1, 5], props: { resistance: R_pull } },
    { id: 'rp2', type: 'R', nodes: [1, 3], props: { resistance: R_pull } },
    // Transistors: NPN([Base, Collector, Emitter])
    { id: 'q1', type: 'NPN', nodes: [5, 2, 0], props: { beta, Vbe_on, Ron } },
    { id: 'q2', type: 'NPN', nodes: [3, 4, 0], props: { beta, Vbe_on, Ron } },
    // Cross-coupling caps: C1(Q1_col→Q2_base), C2(Q2_col→Q1_base... wait:
    // C1: pin0=Q1_col(2), pin1=Q2_base(3), vCap = V(2)-V(3)
    // C2: pin0=Q1_base(5), pin1=Q2_col(4), vCap = V(5)-V(4)
    { id: 'c1', type: 'CAP', nodes: [2, 3], props: { capacitance: C, vCap: initialC1vCap } },
    { id: 'c2', type: 'CAP', nodes: [5, 4], props: { capacitance: C, vCap: initialC2vCap } },
  ];

  const dt = 0.005;
  let prevX = new Array(numNodes + extraVarCount).fill(0);
  // Seed prevX with initial conditions
  prevX[0] = Vcc; // V(1) = +rail... wait, in our indexing X[0]=V(node1)

  // Actually: X[i] = V(node i+1), X[numNodes] = extra
  // Initial guess: rail at 9V, others at mid
  prevX[0] = Vcc; // node1 (+rail) = 9V forced by vsrc, but let's start with 0

  console.log('Step |  t(ms) | V_q1col | V_q2col | V_q1b  | V_q2b  | C1.vCap | C2.vCap | Q1    | Q2   ');
  console.log('-----|--------|---------|---------|--------|--------|---------|---------|-------|------');

  let c1vCap = initialC1vCap;
  let c2vCap = initialC2vCap;
  let t = 0;
  let q1_switches = 0, q2_switches = 0;
  let prev_q1_active = false, prev_q2_active = false;

  for (let step = 0; step <= 400; step++) {
    // Update cap states
    components.find(c => c.id === 'c1').props.vCap = c1vCap;
    components.find(c => c.id === 'c2').props.vCap = c2vCap;

    const size = numNodes + extraVarCount;
    const A = Array.from({ length: size }, () => new Array(size).fill(0));
    const Z = new Array(size).fill(0);

    for (const c of components) stampComponent(A, Z, c, prevX, numNodes, dt);

    let X;
    try {
      X = solveLinearSystem(A, Z);
    } catch (e) {
      console.log(`Step ${step}: Solver error: ${e.message}`);
      break;
    }

    // X[0]=V1(+rail), X[1]=V2(Q1_col), X[2]=V3(Q2_base),
    // X[3]=V4(Q2_col), X[4]=V5(Q1_base), X[5]=I_vsrc
    const V_rail = X[0];
    const V_q1col = X[1];
    const V_q2base = X[2];
    const V_q2col = X[3];
    const V_q1base = X[4];

    const q1_active = (V_q1base - 0) > Vbe_on; // emitter at GND
    const q2_active = (V_q2base - 0) > Vbe_on;

    if (q1_active !== prev_q1_active) { q1_switches++; prev_q1_active = q1_active; }
    if (q2_active !== prev_q2_active) { q2_switches++; prev_q2_active = q2_active; }

    if (step % 20 === 0 || step < 5 || q1_switches !== q1_switches || q2_switches !== q2_switches) {
      console.log(
        `${String(step).padStart(4)} | ${(t*1000).toFixed(0).padStart(6)} | ` +
        `${V_q1col.toFixed(3).padStart(7)} | ${V_q2col.toFixed(3).padStart(7)} | ` +
        `${V_q1base.toFixed(3).padStart(6)} | ${V_q2base.toFixed(3).padStart(6)} | ` +
        `${c1vCap.toFixed(3).padStart(7)} | ${c2vCap.toFixed(3).padStart(7)} | ` +
        `${q1_active ? 'ON ' : 'off'} | ${q2_active ? 'ON ' : 'off'}`
      );
    }

    // Update vCap: vCap = new voltage across cap
    c1vCap = V_q1col - V_q2base;  // V(pin0) - V(pin1)
    c2vCap = V_q1base - V_q2col;  // V(pin0) - V(pin1)

    if (isNaN(c1vCap) || isNaN(c2vCap)) {
      console.log(`Step ${step}: NaN detected! V_q1col=${V_q1col} V_q2base=${V_q2base}`);
      break;
    }

    prevX = X;
    t += dt;
  }
  console.log(`\nQ1 state changes: ${q1_switches}, Q2 state changes: ${q2_switches}`);
}

// ── Run all tests ─────────────────────────────────────────────────────────────
testRC();
testBlinker(0, 0,   'BOTH vCap=0 (symmetric)');
testBlinker(8, -8,  'C1=+8V, C2=-8V (our fix)');
testBlinker(0, -9,  'C2=-9V only');
