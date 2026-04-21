import BaseComponent from './BaseComponent.jsx';
import React from 'react';

/**
 * 3-Terminal Voltage Regulator (e.g. 7805)
 * Pins: [0]=IN, [1]=OUT, [2]=GND
 */
export class VoltageRegulatorModel extends BaseComponent {
  get type() { return 'VOLTAGE_REGULATOR'; }
  get label() { return 'Voltage Regulator'; }
  get category() { return 'Active'; }
  get numPins() { return 3; }
  get defaultProperties() { return { targetVoltage: 5, dropoutVoltage: 2, maxCurrent: 1.5 }; }
  
  get pinPositions() {
    return [
      { offsetX: -40, offsetY: 0, label: 'IN' },
      { offsetX: 40, offsetY: 0, label: 'OUT' },
      { offsetX: 0, offsetY: 30, label: 'GND' }
    ];
  }
  
  get propertyMeta() {
    return {
      targetVoltage: { label: 'Fixed Output (V)', type: 'number', min: 0.1, step: 0.1 },
      dropoutVoltage: { label: 'Dropout (V)', type: 'number', min: 0, step: 0.1 },
      maxCurrent: { label: 'Max Current (A)', type: 'number', min: 0.01 }
    };
  }

  get color() { return '#10b981'; } // Emerald

  getExtraVariablesCount() {
    return 1; // Branch current through OUT
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    if (componentState.properties.damaged) return;
    
    const vReg = componentState.properties.targetVoltage ?? 5;
    const vDo = componentState.properties.dropoutVoltage ?? 2;
    
    const pIn = componentState.pins[0].id;
    const pOut = componentState.pins[1].id;
    const pGnd = componentState.pins[2].id;

    const nIn = resolvedNodeMap.get(pIn) || 0;
    const nOut = resolvedNodeMap.get(pOut) || 0;
    const nGnd = resolvedNodeMap.get(pGnd) || 0;
    
    const vsEqIndex = extraVarIndices[0];

    // Read voltages from last tick
    const v_in = lastNodeVoltages ? (lastNodeVoltages[pIn] || 0) : 0;
    const v_gnd = lastNodeVoltages ? (lastNodeVoltages[pGnd] || 0) : 0;
    
    // Vout = min(Vreg, Vin - Vdo) relative to local ground
    // We must handle the case where Vin < Vgnd (reversed) which is 0V out
    const headroom = v_in - v_gnd;
    const vTarget = Math.max(0, Math.min(vReg, headroom - vDo));

    // Equation: Vout - Vgnd = vTarget
    if (nOut > 0) A[vsEqIndex][nOut - 1] += 1;
    if (nGnd > 0) A[vsEqIndex][nGnd - 1] -= 1;
    
    // KCL at OUT and GND
    if (nOut > 0) A[nOut - 1][vsEqIndex] += 1;
    if (nGnd > 0) A[nGnd - 1][vsEqIndex] -= 1;
    
    Z[vsEqIndex] = vTarget;

    // Small leakage resistor between IN and GND to provide a path if OUT is floating
    const R_leak = 1e6;
    const G_leak = 1/R_leak;
    if (nIn > 0) A[nIn - 1][nIn - 1] += G_leak;
    if (nGnd > 0) A[nGnd - 1][nGnd - 1] += G_leak;
    if (nIn > 0 && nGnd > 0) {
      A[nIn - 1][nGnd - 1] -= G_leak;
      A[nGnd - 1][nIn - 1] -= G_leak;
    }
  }

  extractCurrent(componentState, nodeVoltages, extraVarValues) {
    if (componentState.properties.damaged) return 0;
    return extraVarValues[0] || 0; // Output current
  }

  checkDamage(componentState, current, voltage) {
    if (componentState.properties.damaged) return false;
    const maxI = componentState.properties.maxCurrent ?? 1.5;
    if (Math.abs(current) > maxI) {
      return `Overcurrent: ${Math.abs(current).toFixed(2)}A exceeded ${maxI}A rating. Thermal shutdown failed.`;
    }
    return false;
  }

  renderShape(componentState, simulationCurrent) {
    const c = this.color;
    const active = Math.abs(simulationCurrent) > 0.001;
    const label = `${componentState.properties.targetVoltage}V`;
    
    return (
      <g>
        {/* Rectangular body */}
        <rect x="-24" y="-18" width="48" height="36" fill="none" stroke={c} strokeWidth="3" rx="2" />
        
        {/* Leads */}
        <line x1="-40" y1="0" x2="-24" y2="0" stroke={c} strokeWidth="3" /> {/* IN */}
        <line x1="24" y1="0" x2="40" y2="0" stroke={c} strokeWidth="3" />  {/* OUT */}
        <line x1="0" y1="18" x2="0" y2="30" stroke={c} strokeWidth="3" />   {/* GND */}
        
        {/* Internal labels */}
        <text x="0" y="2" fill={c} fontSize="10" fontWeight="bold" textAnchor="middle">{label}</text>
        <text x="-18" y="12" fill={c} fontSize="6" textAnchor="start">IN</text>
        <text x="18" y="12" fill={c} fontSize="6" textAnchor="end">OUT</text>
        <text x="0" y="15" fill={c} fontSize="6" textAnchor="middle">GND</text>
      </g>
    );
  }

  renderIcon() {
    const c = this.color;
    return (
      <g>
        <rect x="-20" y="-15" width="40" height="30" fill="none" stroke={c} strokeWidth="4" rx="2" />
        <line x1="-35" y1="0" x2="-20" y2="0" stroke={c} strokeWidth="4" />
        <line x1="20" y1="0" x2="35" y2="0" stroke={c} strokeWidth="4" />
        <line x1="0" y1="15" x2="0" y2="30" stroke={c} strokeWidth="4" />
      </g>
    );
  }
}
