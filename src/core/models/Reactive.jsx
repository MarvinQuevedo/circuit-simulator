import BaseComponent from './BaseComponent.jsx';
import React from 'react';

// ─── Real-world transistor model libraries ────────────────────────────────────
export const NPN_MODELS = {
  '2N3904':  { label: '2N3904 (General Purpose)', beta: 100, Vbe: 0.65, Ron: 10,  maxIc: 0.2 },
  'BC547':   { label: 'BC547 (Low Power)',         beta: 200, Vbe: 0.65, Ron: 8,   maxIc: 0.1 },
  '2N2222':  { label: '2N2222 (Fast Switch)',      beta: 150, Vbe: 0.60, Ron: 5,   maxIc: 0.6 },
  'BC337':   { label: 'BC337 (Medium Power)',      beta: 100, Vbe: 0.65, Ron: 5,   maxIc: 0.8 },
  'TIP31C':  { label: 'TIP31C (Power NPN)',        beta: 40,  Vbe: 0.70, Ron: 1,   maxIc: 3.0 },
  'BD139':   { label: 'BD139 (Power Driver)',      beta: 80,  Vbe: 0.70, Ron: 1.5, maxIc: 1.5 },
  'CUSTOM':  { label: 'Custom…',                  beta: 100, Vbe: 0.70, Ron: 10,  maxIc: 0.6 },
};

export const PNP_MODELS = {
  '2N3906':  { label: '2N3906 (General Purpose)', beta: 100, Vbe: 0.65, Ron: 10,  maxIc: 0.2 },
  'BC557':   { label: 'BC557 (Low Power)',         beta: 200, Vbe: 0.65, Ron: 8,   maxIc: 0.1 },
  '2N2907':  { label: '2N2907 (Fast Switch)',      beta: 150, Vbe: 0.60, Ron: 5,   maxIc: 0.6 },
  'BC327':   { label: 'BC327 (Medium Power)',      beta: 100, Vbe: 0.65, Ron: 5,   maxIc: 0.8 },
  'TIP32C':  { label: 'TIP32C (Power PNP)',        beta: 40,  Vbe: 0.70, Ron: 1,   maxIc: 3.0 },
  'BD140':   { label: 'BD140 (Power Driver)',      beta: 80,  Vbe: 0.70, Ron: 1.5, maxIc: 1.5 },
  'CUSTOM':  { label: 'Custom…',                  beta: 100, Vbe: 0.70, Ron: 10,  maxIc: 0.6 },
};

const TRANSISTOR_CUSTOM_FIELDS = [
  { key: 'beta',  label: 'β (hFE gain)',          type: 'number', min: 1,     step: 1    },
  { key: 'Vbe',   label: 'V_BE threshold (V)',    type: 'number', min: 0,     step: 0.01 },
  { key: 'Ron',   label: 'Ron Base-Emitter (Ω)', type: 'number', min: 0.01,  step: 0.1  },
  { key: 'maxIc', label: 'Max Collector I (A)',   type: 'number', min: 0,     step: 0.01 },
];

// ─────────────────────────────────────────────────────────────────────────────
// CAPACITOR
// In DC steady-state (which our MNA solves) a capacitor is an open circuit.
// We model it as a very high resistance (1e9 Ω) so it doesn't short the circuit,
// but exposes its capacitance as an editable property for future AC/transient sim.
// ─────────────────────────────────────────────────────────────────────────────
export class CapacitorModel extends BaseComponent {
  get type() { return 'CAPACITOR'; }
  get label() { return 'Capacitor'; }
  get category() { return 'Passive'; }
  get numPins() { return 2; }
  get defaultProperties() { return { capacitance: 100, maxVoltage: 50 }; }
  get propertyMeta() {
    return {
      capacitance: { label: 'Capacitance (μF)', type: 'number', step: 1 },
      maxVoltage: { label: 'Max Voltage (V)', type: 'number', min: 0 }
    };
  }
  get color() { return '#818cf8'; } // indigo

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages, dt) {
    if (componentState.properties.damaged) return;
    
    // Convert μF to F for math
    const val_uf = componentState.properties.capacitance ?? 100;
    const C = val_uf * 1e-6;
    const vCap = componentState.properties.vCap ?? 0;
    
    // Transient companion model (Backward Euler/Thevenin equivalent)
    // I = C * dv/dt => I = C/dt * (v(t) - v(t-dt))
    // I = G_eq * v(t) - G_eq * v(t-dt)
    // G_eq = C / dt
    // I_eq = G_eq * vCap
    const G_eq = C / Math.max(dt, 1e-6);
    const I_eq = G_eq * vCap;

    const n1 = resolvedNodeMap.get(componentState.pins[0].id) || 0;
    const n2 = resolvedNodeMap.get(componentState.pins[1].id) || 0;

    // Stamp G_eq (like a resistor)
    if (n1 > 0) A[n1 - 1][n1 - 1] += G_eq;
    if (n2 > 0) A[n2 - 1][n2 - 1] += G_eq;
    if (n1 > 0 && n2 > 0) {
      A[n1 - 1][n2 - 1] -= G_eq;
      A[n2 - 1][n1 - 1] -= G_eq;
    }
    
    // Stamp I_eq (current source in parallel with G_eq)
    // It flows from Pin 0 to Pin 1 if vCap is positive (vCap = V0 - V1)
    if (n1 > 0) Z[n1 - 1] += I_eq;
    if (n2 > 0) Z[n2 - 1] -= I_eq;
  }

  extractCurrent(componentState, nodeVoltages, extraVarIndices, dt) {
    if (componentState.properties.damaged) return 0;
    const val_uf = componentState.properties.capacitance ?? 100;
    const C = val_uf * 1e-6;
    const p1 = componentState.pins[0].id;
    const p2 = componentState.pins[1].id;
    const V_curr = (nodeVoltages[p1] || 0) - (nodeVoltages[p2] || 0);
    const vCap = componentState.properties.vCap ?? 0;
    
    // Transient current: I = C * (V_curr - vCap) / dt
    return C * (V_curr - vCap) / Math.max(dt, 1e-6);
  }

  getUpdatedProperties(componentState, nodeVoltages) {
    const vA = nodeVoltages[componentState.pins[0].id] || 0;
    const vB = nodeVoltages[componentState.pins[1].id] || 0;
    return { vCap: vA - vB };
  }

  checkDamage(componentState, current, voltage) {
    if (componentState.properties.damaged) return false;
    const maxV = componentState.properties.maxVoltage ?? 50;
    // For capacitors, overvoltage is usually the primary failure mode
    if (Math.abs(voltage) > maxV) {
      return `Overvoltage: ${Math.abs(voltage).toFixed(1)}V exceeded the ${maxV}V rating. Dielectric breakdown.`;
    }
    return false;
  }

  renderShape(componentState, simulationCurrent) {
    const isCharged = Math.abs(componentState.properties.vCap || 0) > 0.1;
    const c = this.color;
    return (
      <g>
        <line x1="-30" y1="0" x2="-6" y2="0" stroke={c} strokeWidth="3" />
        <line x1="6" y1="0" x2="30" y2="0" stroke={c} strokeWidth="3" />
        <line x1="-6" y1="-14" x2="-6" y2="14" stroke={c} strokeWidth={isCharged ? 4 : 3}
          style={{ filter: isCharged ? `drop-shadow(0 0 4px ${c})` : 'none', transition: 'all 0.2s' }}
        />
        <line x1="6" y1="-14" x2="6" y2="14" stroke={c} strokeWidth={isCharged ? 4 : 3}
          style={{ filter: isCharged ? `drop-shadow(0 0 4px ${c})` : 'none', transition: 'all 0.2s' }}
        />
        {/* + label */}
        <text x="-14" y="-16" fill={c} fontSize="9" textAnchor="middle">+</text>
      </g>
    );
  }

  renderIcon() {
    const c = this.color;
    return (
      <g>
        <line x1="-30" y1="0" x2="-8" y2="0" stroke={c} strokeWidth="4" />
        <line x1="8" y1="0" x2="30" y2="0" stroke={c} strokeWidth="4" />
        <line x1="-8" y1="-18" x2="-8" y2="18" stroke={c} strokeWidth="5" />
        <line x1="8" y1="-18" x2="8" y2="18" stroke={c} strokeWidth="5" />
      </g>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BJT NPN TRANSISTOR
//
// Pins: [0]=Base, [1]=Collector, [2]=Emitter
// DC model: Ebers-Moll simplified (piecewise linear)
//   IC = β * IB     when VBE > Vbe_on
//   Emitter current IE = IB + IC   (KCL)
// MNA stamps:
//   VBE junction modeled as a diode (Vbe_on, Ron)
//   Collector current injected as a current-controlled current source β*IB
// ─────────────────────────────────────────────────────────────────────────────
export class NpnTransistorModel extends BaseComponent {
  get type() { return 'NPN'; }
  get label() { return 'NPN Transistor'; }
  get category() { return 'Semiconductors'; }
  get numPins() { return 3; } // Base, Collector, Emitter
  get defaultProperties() { return { modelId: '2N3904', useCustom: false, beta: 100, Vbe: 0.65, Ron: 10, maxIc: 0.2 }; }
  get propertyMeta() {
    return {
      modelId: {
        type: 'model-select',
        label: 'NPN Model',
        options: Object.entries(NPN_MODELS).map(([k, v]) => ({ value: k, label: v.label })),
        modelLibrary: NPN_MODELS,
        customFields: TRANSISTOR_CUSTOM_FIELDS
      }
    };
  }
  get color() { return '#34d399'; } // emerald

  _resolveModel(properties) {
    const preset = NPN_MODELS[properties.modelId] || NPN_MODELS['2N3904'];
    if (!properties.useCustom) return preset;
    return {
      ...preset,
      beta:  properties.beta  !== undefined ? properties.beta  : preset.beta,
      Vbe:   properties.Vbe   !== undefined ? properties.Vbe   : preset.Vbe,
      Ron:   properties.Ron   !== undefined ? properties.Ron   : preset.Ron,
      maxIc: properties.maxIc !== undefined ? properties.maxIc : preset.maxIc,
    };
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    if (componentState.properties.damaged) return;
    const { beta, Vbe: Vbe_on, Ron } = this._resolveModel(componentState.properties);
    const pB = componentState.pins[0].id;
    const pC = componentState.pins[1].id;
    const pE = componentState.pins[2].id;

    const nB = resolvedNodeMap.get(pB) || 0;
    const nC = resolvedNodeMap.get(pC) || 0;
    const nE = resolvedNodeMap.get(pE) || 0;

    const vB = lastNodeVoltages ? (lastNodeVoltages[pB] || 0) : 0;
    const vC = lastNodeVoltages ? (lastNodeVoltages[pC] || 0) : 0;
    const vE = lastNodeVoltages ? (lastNodeVoltages[pE] || 0) : 0;
    const Vbe = vB - vE;
    const Vce = vC - vE;

    // ── Stamp base-emitter junction diode ──
    let G_be = 1e-9;
    let Ieq = 0;

    if (Vbe > Vbe_on) {
      G_be = 1.0 / Ron;
      Ieq  = Vbe_on * G_be; // Norton current to maintain Vbe_on drop
    }

    if (nB > 0) A[nB - 1][nB - 1] += G_be;
    if (nE > 0) A[nE - 1][nE - 1] += G_be;
    if (nB > 0 && nE > 0) {
      A[nB - 1][nE - 1] -= G_be;
      A[nE - 1][nB - 1] -= G_be;
    }
    if (nB > 0) Z[nB - 1] += Ieq;
    if (nE > 0) Z[nE - 1] -= Ieq;

    // ── Stamp collector ──
    // Use VCCS (voltage-controlled current source) in active region,
    // or saturation model (small C-E resistance) when Vce is low.
    // This prevents numerical explosion from large β*Ib current sources.
    if (Vbe > Vbe_on) {
      const Vce_sat = 0.2;

      if (Vce >= Vce_sat) {
        // ── Active region: VCCS stamp ──
        // Ic = Gm*(Vb - Ve - Vbe_on), extracted from C, injected into E
        const Gm = beta / Ron;
        if (nC > 0 && nB > 0) A[nC - 1][nB - 1] += Gm;
        if (nC > 0 && nE > 0) A[nC - 1][nE - 1] -= Gm;
        if (nE > 0 && nB > 0) A[nE - 1][nB - 1] -= Gm;
        if (nE > 0)            A[nE - 1][nE - 1] += Gm;
        if (nC > 0) Z[nC - 1] += Gm * Vbe_on;
        if (nE > 0) Z[nE - 1] -= Gm * Vbe_on;
      } else {
        // ── Saturation region: stamp low C-E resistance ──
        // Model Vce ≈ Vce_sat via Norton equivalent: G_sat in parallel with I_sat
        const G_sat = 1.0 / 0.01; // 100 S → effectively clamps Vce
        const I_sat = G_sat * Vce_sat;
        if (nC > 0) A[nC - 1][nC - 1] += G_sat;
        if (nE > 0) A[nE - 1][nE - 1] += G_sat;
        if (nC > 0 && nE > 0) {
          A[nC - 1][nE - 1] -= G_sat;
          A[nE - 1][nC - 1] -= G_sat;
        }
        if (nC > 0) Z[nC - 1] += I_sat;
        if (nE > 0) Z[nE - 1] -= I_sat;
      }
    }
  }

  extractCurrent(componentState, nodeVoltages) {
    if (componentState.properties.damaged) return 0;
    const { beta, Vbe: Vbe_on, Ron } = this._resolveModel(componentState.properties);
    const vB = nodeVoltages[componentState.pins[0].id] || 0;
    const vE = nodeVoltages[componentState.pins[2].id] || 0;
    const Vbe = vB - vE;
    if (Vbe > Vbe_on) {
      const Ib = (Vbe - Vbe_on) / Ron;
      return beta * Ib; // Ic
    }
    return 0;
  }

  checkDamage(componentState, current, voltage) {
    if (componentState.properties.damaged) return false;
    const { maxIc } = this._resolveModel(componentState.properties);
    if (current > maxIc) {
      return `Collector overcurrent: ${(current * 1000).toFixed(0)}mA exceeded ${(maxIc * 1000).toFixed(0)}mA max. Junction destroyed.`;
    }
    return false;
  }

  renderShape(componentState, simulationCurrent) {
    const c = this.color;
    const active = simulationCurrent > 0.001;
    const glow = active ? `drop-shadow(0 0 6px ${c})` : 'none';
    return (
      <g style={{ filter: glow, transition: 'filter 0.2s' }}>
        {/* Body circle */}
        <circle cx="0" cy="0" r="18" fill="none" stroke={c} strokeWidth="2" />
        {/* Base lead (left) */}
        <line x1="-30" y1="0" x2="-6" y2="0" stroke={c} strokeWidth="3" />
        {/* Vertical base bar */}
        <line x1="-6" y1="-12" x2="-6" y2="12" stroke={c} strokeWidth="3" />
        {/* Collector lead (top right) — pin[1] */}
        <line x1="-6" y1="-10" x2="14" y2="-24" stroke={c} strokeWidth="3" />
        <line x1="14" y1="-24" x2="30" y2="-24" stroke={c} strokeWidth="3" />
        {/* Emitter lead (bottom right) — pin[2] with arrow */}
        <line x1="-6" y1="10" x2="14" y2="24" stroke={c} strokeWidth="3" />
        <line x1="14" y1="24" x2="30" y2="24" stroke={c} strokeWidth="3" />
        {/* NPN arrow on emitter (pointing outward from base) */}
        <polygon points="10,20 16,26 8,28" fill={c} />
        {/* Labels */}
        <text x="-30" y="-8" fill={c} fontSize="7" textAnchor="start">B</text>
        <text x="18" y="-22" fill={c} fontSize="7">C</text>
        <text x="18" y="30" fill={c} fontSize="7">E</text>
      </g>
    );
  }

  renderIcon() {
    const c = this.color;
    return (
      <g>
        <circle cx="0" cy="0" r="22" fill="none" stroke={c} strokeWidth="3" />
        <line x1="-30" y1="0" x2="-8" y2="0" stroke={c} strokeWidth="3" />
        <line x1="-8" y1="-14" x2="-8" y2="14" stroke={c} strokeWidth="3" />
        <line x1="-8" y1="-11" x2="14" y2="-28" stroke={c} strokeWidth="3" />
        <line x1="-8" y1="11" x2="14" y2="28" stroke={c} strokeWidth="3" />
        <polygon points="8,24 16,29 8,32" fill={c} />
      </g>
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BJT PNP TRANSISTOR
// Same as NPN but polarity flipped (VEB instead of VBE, IC flows E→C)
// Pins: [0]=Base, [1]=Collector, [2]=Emitter
// ─────────────────────────────────────────────────────────────────────────────
export class PnpTransistorModel extends NpnTransistorModel {
  get type() { return 'PNP'; }
  get label() { return 'PNP Transistor'; }
  get color() { return '#f472b6'; } // pink
  get defaultProperties() { return { modelId: '2N3906', useCustom: false, beta: 100, Vbe: 0.65, Ron: 10, maxIc: 0.2 }; }
  get propertyMeta() {
    return {
      modelId: {
        type: 'model-select',
        label: 'PNP Model',
        options: Object.entries(PNP_MODELS).map(([k, v]) => ({ value: k, label: v.label })),
        modelLibrary: PNP_MODELS,
        customFields: TRANSISTOR_CUSTOM_FIELDS
      }
    };
  }

  _resolveModel(properties) {
    const preset = PNP_MODELS[properties.modelId] || PNP_MODELS['2N3906'];
    if (!properties.useCustom) return preset;
    return {
      ...preset,
      beta:  properties.beta  !== undefined ? properties.beta  : preset.beta,
      Vbe:   properties.Vbe   !== undefined ? properties.Vbe   : preset.Vbe,
      Ron:   properties.Ron   !== undefined ? properties.Ron   : preset.Ron,
      maxIc: properties.maxIc !== undefined ? properties.maxIc : preset.maxIc,
    };
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    if (componentState.properties.damaged) return;
    const { beta, Vbe: Vbe_on, Ron } = this._resolveModel(componentState.properties);
    const pB = componentState.pins[0].id;
    const pC = componentState.pins[1].id;
    const pE = componentState.pins[2].id;

    const nB = resolvedNodeMap.get(pB) || 0;
    const nC = resolvedNodeMap.get(pC) || 0;
    const nE = resolvedNodeMap.get(pE) || 0;

    const vB = lastNodeVoltages ? (lastNodeVoltages[pB] || 0) : 0;
    const vC = lastNodeVoltages ? (lastNodeVoltages[pC] || 0) : 0;
    const vE = lastNodeVoltages ? (lastNodeVoltages[pE] || 0) : 0;
    const Veb = vE - vB; // PNP uses V_EB
    const Vec = vE - vC; // PNP: Vec = Ve - Vc

    // ── Stamp emitter-base junction diode (reversed polarity) ──
    let G_eb = 1e-9;
    let Ieq = 0;

    if (Veb > Vbe_on) {
      G_eb = 1.0 / Ron;
      Ieq  = Vbe_on * G_eb;
    }

    // Stamp current from E to B (reversed)
    if (nE > 0) A[nE - 1][nE - 1] += G_eb;
    if (nB > 0) A[nB - 1][nB - 1] += G_eb;
    if (nE > 0 && nB > 0) {
      A[nE - 1][nB - 1] -= G_eb;
      A[nB - 1][nE - 1] -= G_eb;
    }
    if (nE > 0) Z[nE - 1] += Ieq;
    if (nB > 0) Z[nB - 1] -= Ieq;

    // ── PNP collector: VCCS active / saturation clamp ──
    if (Veb > Vbe_on) {
      const Vce_sat = 0.2;

      if (Vec >= Vce_sat) {
        // Active: VCCS — Ic = Gm*(Ve - Vb - Vbe_on), extracted from E, injected into C
        const Gm = beta / Ron;
        if (nE > 0)            A[nE - 1][nE - 1] += Gm;
        if (nE > 0 && nB > 0) A[nE - 1][nB - 1] -= Gm;
        if (nC > 0 && nE > 0) A[nC - 1][nE - 1] -= Gm;
        if (nC > 0 && nB > 0) A[nC - 1][nB - 1] += Gm;
        if (nE > 0) Z[nE - 1] += Gm * Vbe_on;
        if (nC > 0) Z[nC - 1] -= Gm * Vbe_on;
      } else {
        // Saturation: clamp Vec ≈ Vce_sat
        const G_sat = 1.0 / 0.01;
        const I_sat = G_sat * Vce_sat;
        if (nE > 0) A[nE - 1][nE - 1] += G_sat;
        if (nC > 0) A[nC - 1][nC - 1] += G_sat;
        if (nE > 0 && nC > 0) {
          A[nE - 1][nC - 1] -= G_sat;
          A[nC - 1][nE - 1] -= G_sat;
        }
        if (nE > 0) Z[nE - 1] += I_sat;
        if (nC > 0) Z[nC - 1] -= I_sat;
      }
    }
  }

  extractCurrent(componentState, nodeVoltages) {
    if (componentState.properties.damaged) return 0;
    const { beta, Vbe: Vbe_on, Ron } = this._resolveModel(componentState.properties);
    const vB = nodeVoltages[componentState.pins[0].id] || 0;
    const vE = nodeVoltages[componentState.pins[2].id] || 0;
    const Veb = vE - vB;
    if (Veb > Vbe_on) {
      const Ib = (Veb - Vbe_on) / Ron;
      return -(beta * Ib); // IC flows into Collector in PNP (negative convention)
    }
    return 0;
  }

  renderShape(componentState, simulationCurrent) {
    const c = this.color;
    const active = Math.abs(simulationCurrent) > 0.001;
    const glow = active ? `drop-shadow(0 0 6px ${c})` : 'none';
    return (
      <g style={{ filter: glow, transition: 'filter 0.2s' }}>
        <circle cx="0" cy="0" r="18" fill="none" stroke={c} strokeWidth="2" />
        <line x1="-30" y1="0" x2="-6" y2="0" stroke={c} strokeWidth="3" />
        <line x1="-6" y1="-12" x2="-6" y2="12" stroke={c} strokeWidth="3" />
        {/* Collector */}
        <line x1="-6" y1="-10" x2="14" y2="-24" stroke={c} strokeWidth="3" />
        <line x1="14" y1="-24" x2="30" y2="-24" stroke={c} strokeWidth="3" />
        {/* Emitter */}
        <line x1="-6" y1="10" x2="14" y2="24" stroke={c} strokeWidth="3" />
        <line x1="14" y1="24" x2="30" y2="24" stroke={c} strokeWidth="3" />
        {/* PNP arrow on emitter (pointing INTO base) */}
        <polygon points="-2,12 6,8 2,16" fill={c} />
        <text x="-30" y="-8" fill={c} fontSize="7" textAnchor="start">B</text>
        <text x="18" y="-22" fill={c} fontSize="7">C</text>
        <text x="18" y="30" fill={c} fontSize="7">E</text>
      </g>
    );
  }

  renderIcon() {
    const c = this.color;
    return (
      <g>
        <circle cx="0" cy="0" r="22" fill="none" stroke={c} strokeWidth="3" />
        <line x1="-30" y1="0" x2="-8" y2="0" stroke={c} strokeWidth="3" />
        <line x1="-8" y1="-14" x2="-8" y2="14" stroke={c} strokeWidth="3" />
        <line x1="-8" y1="-11" x2="14" y2="-28" stroke={c} strokeWidth="3" />
        <line x1="-8" y1="11" x2="14" y2="28" stroke={c} strokeWidth="3" />
        {/* PNP arrow into base */}
        <polygon points="-4,14 4,9 0,18" fill={c} />
      </g>
    );
  }
}
