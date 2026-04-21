import BaseComponent from './BaseComponent.jsx';
import React from 'react';

export class DcVoltageSourceModel extends BaseComponent {
  get type() { return 'DC_VOLTAGE_SOURCE'; }
  get label() { return 'DC Voltage'; }
  get category() { return 'Sources'; }
  get numPins() { return 2; }
  get defaultProperties() { return { voltage: 9 }; }
  get propertyLabels() { return { voltage: 'Voltage (V)' }; }
  get color() { return '#3b82f6'; }

  getExtraVariablesCount() {
    return 1; // Needs 1 branch current constraint
  }

  applyMNA(A, Z, componentState, finalNodeMap, extraVarIndices) {
    const v = componentState.properties.voltage || 9;
    const nPlus = finalNodeMap.get(componentState.pins[0].id) || 0; 
    const nMinus = finalNodeMap.get(componentState.pins[1].id) || 0;
    const vsEqIndex = extraVarIndices[0];

    // Branch current equation mapping
    if (nPlus > 0) A[nPlus - 1][vsEqIndex] += 1;
    if (nMinus > 0) A[nMinus - 1][vsEqIndex] -= 1;
    if (nPlus > 0) A[vsEqIndex][nPlus - 1] += 1;
    if (nMinus > 0) A[vsEqIndex][nMinus - 1] -= 1;

    Z[vsEqIndex] = v;
  }

  extractCurrent(componentState, nodeVoltages, extraVarValues) {
    return extraVarValues[0] || 0;
  }

  renderShape() {
    return (
      <g>
        <line x1="-30" y1="0" x2="-10" y2="0" stroke={this.color} strokeWidth="3" />
        <line x1="10" y1="0" x2="30" y2="0" stroke={this.color} strokeWidth="3" />
        <line x1="-10" y1="-15" x2="-10" y2="15" stroke={this.color} strokeWidth="3" />
        <line x1="10" y1="-8" x2="10" y2="8" stroke={this.color} strokeWidth="5" />
        <text x="-25" y="-12" fill={this.color} fontSize="14" fontWeight="bold" textAnchor="middle">+</text>
      </g>
    );
  }

  renderIcon() {
    return (
      <g stroke={this.color}>
        <line x1="-30" y1="0" x2="-10" y2="0" strokeWidth="4" />
        <line x1="10" y1="0" x2="30" y2="0" strokeWidth="4" />
        <line x1="-10" y1="-20" x2="-10" y2="20" strokeWidth="4" />
        <line x1="10" y1="-10" x2="10" y2="10" strokeWidth="6" />
      </g>
    );
  }
}

export class GroundModel extends BaseComponent {
  get type() { return 'GROUND'; }
  get label() { return 'Ground'; }
  get category() { return 'Sources'; }
  get numPins() { return 1; }
  get color() { return '#10b981'; }

  // Ground doesn't apply math via stamp directly,
  // The system merges all grounds into node 0.
  applyMNA() {}
  
  extractCurrent() { return 0; }

  renderShape() {
    return (
      <g>
        <line x1="0" y1="0" x2="0" y2="15" stroke={this.color} strokeWidth="3" />
        <line x1="-15" y1="15" x2="15" y2="15" stroke={this.color} strokeWidth="3" />
        <line x1="-10" y1="20" x2="10" y2="20" stroke={this.color} strokeWidth="3" />
        <line x1="-5" y1="25" x2="5" y2="25" stroke={this.color} strokeWidth="3" />
      </g>
    );
  }

  renderIcon() {
    return (
      <g stroke={this.color} transform="translate(0, -15)">
        <line x1="0" y1="0" x2="0" y2="20" strokeWidth="4" />
        <line x1="-20" y1="20" x2="20" y2="20" strokeWidth="4" />
        <line x1="-12" y1="28" x2="12" y2="28" strokeWidth="4" />
        <line x1="-5" y1="36" x2="5" y2="36" strokeWidth="4" />
      </g>
    );
  }
}

export class DcCurrentSourceModel extends BaseComponent {
  get type() { return 'DC_CURRENT_SOURCE'; }
  get label() { return 'DC Current'; }
  get category() { return 'Sources'; }
  get numPins() { return 2; }
  get color() { return '#10b981'; } // emerald green

  get defaultProperties() { return { current: 0.01 }; }
  get propertyMeta() {
    return {
      current: { label: 'Current (A)', type: 'number', step: 0.001 },
    };
  }

  // Ideal current source: no extra variable — inject directly into RHS
  getExtraVariablesCount() { return 0; }
  isLinear() { return true; }

  applyMNA(A, Z, componentState, resolvedNodeMap) {
    const I = componentState.properties.current ?? 0.01;
    // pin[0] = + terminal (conventional current exits here into circuit)
    // pin[1] = - terminal (current returns here from circuit)
    const n1 = resolvedNodeMap.get(componentState.pins[0].id) || 0;
    const n2 = resolvedNodeMap.get(componentState.pins[1].id) || 0;
    if (n1 > 0) Z[n1 - 1] += I;
    if (n2 > 0) Z[n2 - 1] -= I;
  }

  extractCurrent(componentState) {
    return componentState.properties.current ?? 0.01;
  }

  renderShape(componentState) {
    const c = this.color;
    return (
      <g>
        {/* Body circle */}
        <circle cx="0" cy="0" r="18" fill="none" stroke={c} strokeWidth="3" />
        {/* Lead lines */}
        <line x1="-30" y1="0" x2="-18" y2="0" stroke={c} strokeWidth="3" />
        <line x1="18" y1="0" x2="30" y2="0" stroke={c} strokeWidth="3" />
        {/* Arrow shaft (pointing up — conventional current direction from - to +) */}
        <line x1="0" y1="10" x2="0" y2="-6" stroke={c} strokeWidth="2.5" />
        {/* Arrowhead pointing up (toward + terminal, pin[0] is on left) */}
        <polygon points="0,-10 -5,-2 5,-2" fill={c} />
        {/* + and - labels */}
        <text x="-26" y="-8" fill={c} fontSize="9" textAnchor="middle">+</text>
        <text x="26"  y="-8" fill={c} fontSize="9" textAnchor="middle">−</text>
      </g>
    );
  }

  renderIcon() {
    const c = this.color;
    return (
      <g>
        <circle cx="0" cy="0" r="22" fill="none" stroke={c} strokeWidth="4" />
        <line x1="-30" y1="0" x2="-22" y2="0" stroke={c} strokeWidth="4" />
        <line x1="22" y1="0" x2="30" y2="0" stroke={c} strokeWidth="4" />
        <line x1="0" y1="12" x2="0" y2="-8" stroke={c} strokeWidth="3" />
        <polygon points="0,-13 -6,-3 6,-3" fill={c} />
      </g>
    );
  }
}

export class AcVoltageSourceModel extends BaseComponent {
  get type() { return 'AC_VOLTAGE_SOURCE'; }
  get label() { return 'AC Voltage'; }
  get category() { return 'Sources'; }
  get numPins() { return 2; }
  get defaultProperties() { return { amplitude: 10, frequency: 60, time: 0 }; }
  get propertyMeta() {
    return {
      amplitude: { label: 'Amplitude (Vpk)', type: 'number', min: 0 },
      frequency: { label: 'Frequency (Hz)', type: 'number', min: 0.1, max: 1000 }
    };
  }
  get color() { return '#3b82f6'; }

  getExtraVariablesCount() {
    return 1;
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages, dt) {
    const { amplitude, frequency, time } = componentState.properties;
    const v = amplitude * Math.sin(2 * Math.PI * frequency * (time || 0));
    
    const nPlus = resolvedNodeMap.get(componentState.pins[0].id) || 0;
    const nMinus = resolvedNodeMap.get(componentState.pins[1].id) || 0;
    const vsEqIndex = extraVarIndices[0];

    if (nPlus > 0) A[nPlus - 1][vsEqIndex] += 1;
    if (nMinus > 0) A[nMinus - 1][vsEqIndex] -= 1;
    if (nPlus > 0) A[vsEqIndex][nPlus - 1] += 1;
    if (nMinus > 0) A[vsEqIndex][nMinus - 1] -= 1;

    Z[vsEqIndex] = v;
  }

  getUpdatedProperties(componentState, nodeVoltages, extraVars, dt) {
    let { time, frequency } = componentState.properties;
    time = (time || 0) + dt;
    const period = 1.0 / (frequency || 60);
    if (time >= period) time -= period;
    
    return { time };
  }

  extractCurrent(componentState, nodeVoltages, extraVarValues) {
    return extraVarValues[0] || 0;
  }

  renderShape(componentState) {
    return (
      <g>
        <circle cx="0" cy="0" r="20" fill="none" stroke={this.color} strokeWidth="3" />
        <path d="M -12 0 Q -6 -12 0 0 T 12 0" stroke={this.color} fill="none" strokeWidth="3" />
        <line x1="-30" y1="0" x2="-20" y2="0" stroke={this.color} strokeWidth="3" />
        <line x1="20" y1="0" x2="30" y2="0" stroke={this.color} strokeWidth="3" />
        <text x="0" y="32" fill={this.color} fontSize="9" textAnchor="middle" fontWeight="bold">
          {componentState.properties.amplitude}V {componentState.properties.frequency}Hz
        </text>
      </g>
    );
  }

  renderIcon() {
    return (
      <g stroke={this.color}>
         <circle cx="0" cy="0" r="25" fill="none" strokeWidth="4" />
         <path d="M -15 0 Q -7.5 -15 0 0 T 15 0" strokeWidth="4" fill="none" />
      </g>
    );
  }
}
