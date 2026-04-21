import BaseComponent from './BaseComponent.jsx';
import React from 'react';

// Help helper for logic levels
const getLogicLevel = (v) => (v > 2.0 ? 1 : 0);
const LOGIC_VOLTAGE = 5.0;
const OUTPUT_RESISTANCE = 50; // Ohms

export class LogicGateModel extends BaseComponent {
  get category() { return 'Digital'; }
  get numPins() { return 3; } // Default: 2 In, 1 Out
  get defaultProperties() { return { threshold: 2.0, outputVoltage: 5.0 }; }
  
  getBounds() {
    return { minX: -35, minY: -25, maxX: 35, maxY: 25 };
  }

  get pinPositions() {
    return [
      { offsetX: -30, offsetY: -15, label: 'A' },
      { offsetX: -30, offsetY: 15, label: 'B' },
      { offsetX: 30, offsetY: 0, label: 'OUT' },
    ];
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    if (componentState.properties.damaged) return;
    
    // Inputs are high impedance, so we don't stamp anything for them.
    // Output is modeled as a voltage source with series resistance.
    // I = (Vtarget - Vout) / Rout  =>  G*Vout = G*Vtarget - I
    // G = 1/Rout
    
    const v1 = lastNodeVoltages[componentState.pins[0].id] || 0;
    const v2 = lastNodeVoltages[componentState.pins[1].id] || 0;
    
    const level1 = getLogicLevel(v1);
    const level2 = getLogicLevel(v2);
    
    const outLevel = this.computeLogic(level1, level2);
    const targetV = outLevel ? (componentState.properties.outputVoltage || LOGIC_VOLTAGE) : 0;
    
    const nOut = resolvedNodeMap.get(componentState.pins[2].id) || 0;
    if (nOut > 0) {
      const g = 1.0 / OUTPUT_RESISTANCE;
      A[nOut - 1][nOut - 1] += g;
      Z[nOut - 1] += targetV * g;
    }
  }

  computeLogic(a, b) {
    return 0; // Override
  }

  getDebugState(componentState, nodeVoltages) {
    const vOut = nodeVoltages[componentState.pins[this.numPins - 1].id] || 0;
    const level = getLogicLevel(vOut);
    return level ? "HIGH (1)" : "LOW (0)";
  }

  extractCurrent(componentState, nodeVoltages) {
    const vOut = nodeVoltages[componentState.pins[2].id] || 0;
    const v1 = nodeVoltages[componentState.pins[0].id] || 0;
    const v2 = nodeVoltages[componentState.pins[1].id] || 0;
    const outLevel = this.computeLogic(getLogicLevel(v1), getLogicLevel(v2));
    const targetV = outLevel ? (componentState.properties.outputVoltage || LOGIC_VOLTAGE) : 0;
    return (targetV - vOut) / OUTPUT_RESISTANCE;
  }
}

export class AndGateModel extends LogicGateModel {
  get type() { return 'AND_GATE'; }
  get label() { return 'AND Gate'; }
  get color() { return '#60a5fa'; }
  computeLogic(a, b) { return a && b; }
  
  renderShape() {
    return (
      <g stroke={this.color} fill="none" strokeWidth="3">
        <path d="M -15 -20 L 0 -20 A 20 20 0 0 1 0 20 L -15 20 Z" />
        <line x1="-30" y1="-15" x2="-15" y2="-15" />
        <line x1="-30" y1="15" x2="-15" y2="15" />
        <line x1="20" y1="0" x2="30" y2="0" />
      </g>
    );
  }
  renderIcon() {
    return (
        <g stroke={this.color} fill="none" strokeWidth="4">
          <path d="M -20 -25 L 0 -25 A 25 25 0 0 1 0 25 L -20 25 Z" />
        </g>
    );
  }
}

export class OrGateModel extends LogicGateModel {
  get type() { return 'OR_GATE'; }
  get label() { return 'OR Gate'; }
  get color() { return '#60a5fa'; }
  computeLogic(a, b) { return a || b; }

  renderShape() {
    return (
      <g stroke={this.color} fill="none" strokeWidth="3">
        <path d="M -15 -20 C -5 -20 15 -15 20 0 C 15 15 -5 20 -15 20 C -10 10 -10 -10 -15 -20" />
        <line x1="-30" y1="-15" x2="-12" y2="-15" />
        <line x1="-30" y1="15" x2="-12" y2="15" />
        <line x1="20" y1="0" x2="30" y2="0" />
      </g>
    );
  }
  renderIcon() {
    return (
        <g stroke={this.color} fill="none" strokeWidth="4">
          <path d="M -20 -25 C -10 -25 15 -20 20 0 C 15 20 -10 25 -20 25 C -15 15 -15 -15 -20 -25" />
        </g>
    );
  }
}

export class NotGateModel extends LogicGateModel {
  get type() { return 'NOT_GATE'; }
  get label() { return 'NOT Gate (Inverter)'; }
  get numPins() { return 2; }
  get color() { return '#60a5fa'; }
  
  get pinPositions() {
    return [
      { offsetX: -30, offsetY: 0, label: 'A' },
      { offsetX: 30, offsetY: 0, label: 'OUT' },
    ];
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    const v1 = lastNodeVoltages[componentState.pins[0].id] || 0;
    const outLevel = v1 > 2.0 ? 0 : 1;
    const targetV = outLevel ? (componentState.properties.outputVoltage || LOGIC_VOLTAGE) : 0;
    const nOut = resolvedNodeMap.get(componentState.pins[1].id) || 0;
    if (nOut > 0) {
      const g = 1.0 / OUTPUT_RESISTANCE;
      A[nOut - 1][nOut - 1] += g;
      Z[nOut - 1] += targetV * g;
    }
  }

  renderShape() {
    return (
      <g stroke={this.color} fill="none" strokeWidth="3">
        <path d="M -15 -15 L 10 0 L -15 15 Z" />
        <circle cx="15" cy="0" r="4" />
        <line x1="-30" y1="0" x2="-15" y2="0" />
        <line x1="19" y1="0" x2="30" y2="0" />
      </g>
    );
  }
  renderIcon() {
    return (
        <g stroke={this.color} fill="none" strokeWidth="4">
          <path d="M -20 -20 L 10 0 L -20 20 Z" />
          <circle cx="18" cy="0" r="6" />
        </g>
    );
  }
}

export class XorGateModel extends LogicGateModel {
  get type() { return 'XOR_GATE'; }
  get label() { return 'XOR Gate'; }
  get color() { return '#60a5fa'; }
  computeLogic(a, b) { return a !== b; }

  renderShape() {
    return (
      <g stroke={this.color} fill="none" strokeWidth="3">
        <path d="M -10 -20 C 0 -20 15 -15 20 0 C 15 15 0 20 -10 20 C -5 10 -5 -10 -10 -20" />
        <path d="M -18 -20 C -13 -10 -13 10 -18 20" />
        <line x1="-30" y1="-15" x2="-13" y2="-15" />
        <line x1="-30" y1="15" x2="-13" y2="15" />
        <line x1="20" y1="0" x2="30" y2="0" />
      </g>
    );
  }
  renderIcon() {
    return (
        <g stroke={this.color} fill="none" strokeWidth="4">
          <path d="M -10 -25 C 0 -25 15 -20 20 0 C 15 20 0 25 -10 25 C -5 15 -5 -15 -10 -25" />
          <path d="M -20 -25 C -15 -15 -15 15 -20 25" />
        </g>
    );
  }
}

export class NandGateModel extends LogicGateModel {
  get type() { return 'NAND_GATE'; }
  get label() { return 'NAND Gate'; }
  get color() { return '#60a5fa'; }
  computeLogic(a, b) { return !(a && b); }
  
  renderShape() {
    return (
      <g stroke={this.color} fill="none" strokeWidth="3">
        <path d="M -15 -20 L 0 -20 A 20 20 0 0 1 0 20 L -15 20 Z" />
        <circle cx="24" cy="0" r="4" />
        <line x1="-30" y1="-15" x2="-15" y2="-15" />
        <line x1="-30" y1="15" x2="-15" y2="15" />
        <line x1="28" y1="0" x2="38" y2="0" />
      </g>
    );
  }
  renderIcon() {
    return (
        <g stroke={this.color} fill="none" strokeWidth="4">
          <path d="M -20 -25 L 0 -25 A 25 25 0 0 1 0 25 L -20 25 Z" />
          <circle cx="32" cy="0" r="6" />
        </g>
    );
  }
}

export class NorGateModel extends LogicGateModel {
  get type() { return 'NOR_GATE'; }
  get label() { return 'NOR Gate'; }
  get color() { return '#60a5fa'; }
  computeLogic(a, b) { return !(a || b); }

  renderShape() {
    return (
      <g stroke={this.color} fill="none" strokeWidth="3">
        <path d="M -15 -20 C -5 -20 15 -15 20 0 C 15 15 -5 20 -15 20 C -10 10 -10 -10 -15 -20" />
        <circle cx="24" cy="0" r="4" />
        <line x1="-30" y1="-15" x2="-12" y2="-15" />
        <line x1="-30" y1="15" x2="-12" y2="15" />
        <line x1="28" y1="0" x2="38" y2="0" />
      </g>
    );
  }
  renderIcon() {
    return (
        <g stroke={this.color} fill="none" strokeWidth="4">
          <path d="M -20 -25 C -10 -25 15 -20 20 0 C 15 20 -10 25 -20 25 C -15 15 -15 -15 -20 -25" />
          <circle cx="30" cy="0" r="6" />
        </g>
    );
  }
}

// --- 7 Segment Display ---
// Pins: 0=A, 1=B, 2=C, 3=D, 4=E, 5=F, 6=G, 7=DP, 8=COM
export class SevenSegmentDisplayModel extends BaseComponent {
  get type() { return '7SEG_DISPLAY'; }
  get label() { return '7-Segment Display'; }
  get category() { return 'Digital'; }
  get numPins() { return 9; }
  get defaultProperties() { return { commonAnode: false, threshold: 2.0 }; }
  get propertyMeta() {
    return {
      commonAnode: { label: 'Common Anode', type: 'boolean' }
    };
  }
  
  getBounds() {
    return { minX: -30, minY: -50, maxX: 40, maxY: 50 };
  }

  get pinPositions() {
    return [
      { offsetX: -40, offsetY: -30, label: 'A' }, // 0: A
      { offsetX: -40, offsetY: -20, label: 'B' }, // 1: B
      { offsetX: -40, offsetY: -10, label: 'C' }, // 2: C
      { offsetX: -40, offsetY: 0,   label: 'D' }, // 3: D
      { offsetX: -40, offsetY: 10,  label: 'E' }, // 4: E
      { offsetX: -40, offsetY: 20,  label: 'F' }, // 5: F
      { offsetX: -40, offsetY: 30,  label: 'G' }, // 6: G
      { offsetX: 40,  offsetY: 40,  label: 'DP' }, // 7: DP
      { offsetX: 40,  offsetY: 0,   label: 'COM' }, // 8: COM
    ];
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    if (componentState.properties.damaged) return;
    
    // Model each segment as a diode + small resistor
    const anode = componentState.properties.commonAnode;
    const comPin = componentState.pins[8].id;
    const vCom = lastNodeVoltages[comPin] || 0;
    
    const G_on = 1.0 / 220; // 220 ohm resistor for each segment
    const V_f = 2.0; // Segment forward voltage
    
    for (let i = 0; i < 8; i++) {
        const segPin = componentState.pins[i].id;
        const vSeg = lastNodeVoltages[segPin] || 0;
        
        const vDiff = anode ? (vCom - vSeg) : (vSeg - vCom);
        if (vDiff > V_f) {
            const nSeg = resolvedNodeMap.get(segPin) || 0;
            const nCom = resolvedNodeMap.get(comPin) || 0;
            
            if (nSeg > 0) A[nSeg - 1][nSeg - 1] += G_on;
            if (nCom > 0) A[nCom - 1][nCom - 1] += G_on;
            if (nSeg > 0 && nCom > 0) {
                A[nSeg - 1][nCom - 1] -= G_on;
                A[nCom - 1][nSeg - 1] -= G_on;
            }
            
            const Ieq = V_f * G_on;
            if (anode) {
                // Current from COM to SEG
                if (nCom > 0) Z[nCom - 1] += Ieq;
                if (nSeg > 0) Z[nSeg - 1] -= Ieq;
            } else {
                // Current from SEG to COM
                if (nSeg > 0) Z[nSeg - 1] += Ieq;
                if (nCom > 0) Z[nCom - 1] -= Ieq;
            }
        }
    }
  }

  renderShape(componentState, simulationCurrent, nodeVoltages) {
    const anode = componentState.properties.commonAnode;
    const vCom = nodeVoltages ? (nodeVoltages[componentState.pins[8].id] || 0) : 0;
    
    const isLit = (idx) => {
        if (!nodeVoltages) return false;
        const vSeg = nodeVoltages[componentState.pins[idx].id] || 0;
        const vDiff = anode ? (vCom - vSeg) : (vSeg - vCom);
        return vDiff > 1.8;
    };

    const color = (idx) => isLit(idx) ? "#ef4444" : "#331111";

    return (
      <g transform="scale(0.8)">
        <rect x="-30" y="-45" width="60" height="90" fill="#111" stroke="#444" strokeWidth="2" rx="4" />
        {/* Segments: A, B, C, D, E, F, G */}
        <path d="M -15 -35 L 15 -35" stroke={color(0)} strokeWidth="6" strokeLinecap="round" /> {/* A */}
        <path d="M 18 -32 L 18 -3"   stroke={color(1)} strokeWidth="6" strokeLinecap="round" /> {/* B */}
        <path d="M 18 3 L 18 32"    stroke={color(2)} strokeWidth="6" strokeLinecap="round" /> {/* C */}
        <path d="M -15 35 L 15 35"  stroke={color(3)} strokeWidth="6" strokeLinecap="round" /> {/* D */}
        <path d="M -18 3 L -18 32"  stroke={color(4)} strokeWidth="6" strokeLinecap="round" /> {/* E */}
        <path d="M -18 -32 L -18 -3" stroke={color(5)} strokeWidth="6" strokeLinecap="round" /> {/* F */}
        <path d="M -15 0 L 15 0"    stroke={color(6)} strokeWidth="6" strokeLinecap="round" /> {/* G */}
        <circle cx="25" cy="35" r="3" fill={color(7)} /> {/* DP */}
      </g>
    );
  }

  renderIcon() {
    return (
       <g transform="scale(0.8)">
        <rect x="-30" y="-45" width="60" height="90" fill="#111" stroke="#ef4444" strokeWidth="3" rx="4" />
        <path d="M -15 -35 L 15 -35" stroke="#ef4444" strokeWidth="6" strokeLinecap="round" />
        <path d="M 18 -32 L 18 -3"   stroke="#ef4444" strokeWidth="6" strokeLinecap="round" />
        <path d="M 18 3 L 18 32"    stroke="#ef4444" strokeWidth="6" strokeLinecap="round" />
        <path d="M -15 35 L 15 35"  stroke="#ef4444" strokeWidth="6" strokeLinecap="round" />
      </g>
    );
  }
}

// --- Decoder BCD to 7-Segment (7447 style) ---
// Pins: 0-3=In(A-D), 4-10=Out(a-g), 11=GND, 12=VCC
export class DecoderBCD7SegModel extends BaseComponent {
  get type() { return '7447_DECODER'; }
  get label() { return 'BCD-to-7Seg Decoder (7447)'; }
  get category() { return 'Digital'; }
  get numPins() { return 13; }
  
  getBounds() {
    return { minX: -40, minY: -45, maxX: 40, maxY: 45 };
  }

  get pinPositions() {
    return [
      { offsetX: -40, offsetY: -30, label: 'A' }, // 0: IN A
      { offsetX: -40, offsetY: -10, label: 'B' }, // 1
      { offsetX: -40, offsetY: 10,  label: 'C' }, // 2
      { offsetX: -40, offsetY: 30,  label: 'D' }, // 3: IN D
      { offsetX: 40,  offsetY: -30, label: 'a' }, // 4: Out a
      { offsetX: 40,  offsetY: -20, label: 'b' }, // 5
      { offsetX: 40,  offsetY: -10, label: 'c' }, // 6
      { offsetX: 40,  offsetY: 0,   label: 'd' }, // 7
      { offsetX: 40,  offsetY: 10,  label: 'e' }, // 8
      { offsetX: 40,  offsetY: 20,  label: 'f' }, // 9
      { offsetX: 40,  offsetY: 30,  label: 'g' }, // 10
      { offsetX: 0,   offsetY: 45,  label: 'GND' }, // 11
      { offsetX: 0,   offsetY: -45, label: 'VCC' }, // 12
    ];
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    const vVcc = lastNodeVoltages[componentState.pins[12].id] || 0;
    if (vVcc < 3.0) return; // Not powered
    
    // Read binary input
    let bcd = 0;
    if (getLogicLevel(lastNodeVoltages[componentState.pins[0].id])) bcd |= 1;
    if (getLogicLevel(lastNodeVoltages[componentState.pins[1].id])) bcd |= 2;
    if (getLogicLevel(lastNodeVoltages[componentState.pins[2].id])) bcd |= 4;
    if (getLogicLevel(lastNodeVoltages[componentState.pins[3].id])) bcd |= 8;
    
    const segments = [
      0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F, 0x58, 0x4C, 0x62, 0x5E, 0x79, 0x71
    ];
    const mask = segments[bcd % 16];
    
    for (let i = 0; i < 7; i++) {
        const outPin = componentState.pins[4 + i].id;
        const nOut = resolvedNodeMap.get(outPin) || 0;
        if (nOut > 0) {
            const lit = (mask >> i) & 1;
            // 7447 is active low (common anode), but let's make it standard active high for simplicity or check props
            const targetV = lit ? vVcc : 0;
            const g = 1.0 / OUTPUT_RESISTANCE;
            A[nOut - 1][nOut - 1] += g;
            Z[nOut - 1] += targetV * g;
        }
    }
  }

  renderShape() {
    return (
      <g>
        <rect x="-35" y="-40" width="70" height="80" fill="#222" stroke="#666" rx="2" />
        <text x="0" y="0" fill="#aaa" fontSize="10" textAnchor="middle" fontWeight="bold">74LS47</text>
      </g>
    );
  }
}

// --- 4-Bit Binary/Decade Counter (7493/7490 type) ---
// Pins: 0=CLK, 1=R1, 2=R2, 3-6=Q0-Q3, 7=OVF, 8=GND, 9=VCC
export class Counter4BitModel extends BaseComponent {
  get type() { return 'COUNTER_4BIT'; }
  get label() { return 'Counter (Binary/Decade)'; }
  get category() { return 'Digital'; }
  get numPins() { return 10; }
  get defaultProperties() { return { count: 0, lastClock: 0, maxCount: 10 }; }
  get propertyMeta() {
    return {
      maxCount: { label: 'Reset at', type: 'number', min: 2, max: 16 },
      count: { label: 'State', type: 'number', min: 0, max: 15 }
    };
  }

  getBounds() {
    return { minX: -35, minY: -50, maxX: 35, maxY: 50 };
  }

  get pinPositions() {
    return [
      { offsetX: -30, offsetY: -30, label: 'CLK' },
      { offsetX: -30, offsetY: -10, label: 'R1'  },
      { offsetX: -30, offsetY: 10,  label: 'R2'  },
      { offsetX: 30,  offsetY: -35, label: 'Q0'  },
      { offsetX: 30,  offsetY: -15, label: 'Q1'  },
      { offsetX: 30,  offsetY: 5,   label: 'Q2'  },
      { offsetX: 30,  offsetY: 25,  label: 'Q3'  },
      { offsetX: 30,  offsetY: 40,  label: 'OVF' },
      { offsetX: 0,   offsetY: 50,  label: 'GND' },
      { offsetX: 0,   offsetY: -50, label: 'VCC' },
    ];
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    const vVcc = lastNodeVoltages[componentState.pins[9].id] || 0;
    if (vVcc < 3.0) return;
    
    const count = componentState.properties.count || 0;
    const maxCount = componentState.properties.maxCount || 10;

    // Q outputs
    for (let i = 0; i < 4; i++) {
        const outPin = componentState.pins[3 + i].id;
        const nOut = resolvedNodeMap.get(outPin) || 0;
        if (nOut > 0) {
            const targetV = (count >> i) & 1 ? vVcc : 0;
            const g = 1.0 / (OUTPUT_RESISTANCE || 50);
            A[nOut - 1][nOut - 1] += g;
            Z[nOut - 1] += targetV * g;
        }
    }

    // OVF output (High when count is 0, creates a rising edge on 9 -> 0 transition)
    const nOvf = resolvedNodeMap.get(componentState.pins[7].id) || 0;
    if (nOvf > 0) {
        const targetV = (count === 0) ? vVcc : 0;
        const g = 1.0 / (OUTPUT_RESISTANCE || 50);
        A[nOvf - 1][nOvf - 1] += g;
        Z[nOvf - 1] += targetV * g;
    }
  }

  getUpdatedProperties(componentState, nodeVoltages) {
    const vVcc = nodeVoltages[componentState.pins[9].id] || 0;
    if (vVcc < 3.0) return null;

    const vClk = nodeVoltages[componentState.pins[0].id] || 0;
    const vR1 = nodeVoltages[componentState.pins[1].id] || 0;
    const vR2 = nodeVoltages[componentState.pins[2].id] || 0;
    
    // TTL Hysteresis (Schmidt Trigger behavior) for CLK
    // Standard TTL: Low < 0.8V, High > 2.0V
    let clkLevel = componentState.properties.lastClock || 0;
    if (vClk > 2.0) clkLevel = 1;
    else if (vClk < 0.8) clkLevel = 0;

    const r1Level = getLogicLevel(vR1);
    const r2Level = getLogicLevel(vR2);
    const rstActive = r1Level && r2Level;

    let count = componentState.properties.count || 0;
    const lastClock = componentState.properties.lastClock || 0;
    const maxCount = componentState.properties.maxCount || 10;
    
    let changed = false;
    if (rstActive) {
        if (count !== 0) {
            count = 0;
            changed = true;
        }
    } else if (clkLevel && !lastClock) {
        // Rising edge trigger (More intuitive for manual buttons)
        count = (count + 1) % maxCount;
        changed = true;
    }
    
    if (changed || clkLevel !== lastClock) {
        return { count, lastClock: clkLevel };
    }
    return null;
  }

  renderShape(componentState) {
    const count = componentState.properties.count || 0;
    const max = componentState.properties.maxCount || 10;
    return (
      <g>
        <rect x="-30" y="-45" width="60" height="90" fill="#222" stroke="#60a5fa" rx="2" strokeWidth="2" />
        <text x="0" y="-15" fill="#60a5fa" fontSize="9" textAnchor="middle" fontWeight="bold">COUNTER</text>
        <text x="0" y="10" fill="#60a5fa" fontSize="22" textAnchor="middle" fontFamily="monospace" fontWeight="bold">{count}</text>
        <text x="0" y="30" fill="#444" fontSize="8" textAnchor="middle">MOD-{max}</text>
      </g>
    );
  }
}

// --- 8-Bit Shift Register (74HC595 style) ---
// Pins: 0=DATA, 1=CLOCK, 2=LATCH, 3=GND, 4=VCC, 5-12=Q0-Q7
export class ShiftRegister8BitModel extends BaseComponent {
  get type() { return 'SHIFT_REG_8BIT'; }
  get label() { return '8-Bit Shift Register'; }
  get category() { return 'Digital'; }
  get numPins() { return 13; }
  get defaultProperties() { return { shiftReg: 0, storageReg: 0, lastClock: 0, lastLatch: 0 }; }

  getBounds() {
    return { minX: -45, minY: -50, maxX: 45, maxY: 50 };
  }

  get pinPositions() {
    const pos = [
      { offsetX: -40, offsetY: -30, label: 'DS' },   // 0
      { offsetX: -40, offsetY: -10, label: 'SHCP' }, // 1
      { offsetX: -40, offsetY: 10,  label: 'STCP' }, // 2
      { offsetX: 0,   offsetY: 45,  label: 'GND' },  // 3
      { offsetX: 0,   offsetY: -45, label: 'VCC' },  // 4
    ];
    for (let i = 0; i < 8; i++) {
        pos.push({ offsetX: 40, offsetY: -35 + i * 10, label: `Q${i}` });
    }
    return pos;
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    const vVcc = lastNodeVoltages[componentState.pins[4].id] || 0;
    if (vVcc < 3.0) return;
    
    const storageReg = componentState.properties.storageReg || 0;
    for (let i = 0; i < 8; i++) {
        const outPin = componentState.pins[5 + i].id;
        const nOut = resolvedNodeMap.get(outPin) || 0;
        if (nOut > 0) {
            const targetV = (storageReg >> i) & 1 ? vVcc : 0;
            const g = 1.0 / OUTPUT_RESISTANCE;
            A[nOut - 1][nOut - 1] += g;
            Z[nOut - 1] += targetV * g;
        }
    }
  }

  getUpdatedProperties(componentState, nodeVoltages) {
    const vVcc = nodeVoltages[componentState.pins[4].id] || 0;
    if (vVcc < 3.0) return null;

    const vData = nodeVoltages[componentState.pins[0].id] || 0;
    const vClock = nodeVoltages[componentState.pins[1].id] || 0;
    const vLatch = nodeVoltages[componentState.pins[2].id] || 0;
    
    const dataLevel = getLogicLevel(vData);
    const clockLevel = getLogicLevel(vClock);
    const latchLevel = getLogicLevel(vLatch);
    
    let shiftReg = componentState.properties.shiftReg || 0;
    let storageReg = componentState.properties.storageReg || 0;
    const lastClock = componentState.properties.lastClock || 0;
    const lastLatch = componentState.properties.lastLatch || 0;
    
    let changed = false;
    if (clockLevel && !lastClock) {
        // rising edge shift
        shiftReg = ((shiftReg << 1) | dataLevel) & 0xFF;
        changed = true;
    }
    
    if (latchLevel && !lastLatch) {
        // rising edge latch
        storageReg = shiftReg;
        changed = true;
    }
    
    if (changed || clockLevel !== lastClock || latchLevel !== lastLatch) {
        return { shiftReg, storageReg, lastClock: clockLevel, lastLatch: latchLevel };
    }
    return null;
  }

  renderShape(componentState) {
    const storageReg = componentState.properties.storageReg || 0;
    const bits = storageReg.toString(2).padStart(8, '0');
    return (
      <g>
        <rect x="-35" y="-40" width="70" height="90" fill="#222" stroke="#60a5fa" rx="2" />
        <text x="0" y="-20" fill="#60a5fa" fontSize="9" textAnchor="middle" fontWeight="bold">74HC595</text>
        <text x="0" y="5" fill="#60a5fa" fontSize="10" textAnchor="middle" fontFamily="monospace">{bits}</text>
        <text x="0" y="25" fill="#60a5fa" fontSize="14" textAnchor="middle" fontFamily="monospace">0x{storageReg.toString(16).toUpperCase()}</text>
      </g>
    );
  }
}

// --- Clock Source / Pulse Generator ---
// Pins: 0=GND, 1=OUT
export class ClockSourceModel extends BaseComponent {
  get type() { return 'CLOCK_SOURCE'; }
  get label() { return 'Pulse Generator'; }
  get category() { return 'Digital'; }
  get numPins() { return 2; }
  get defaultProperties() { return { frequency: 1, outputVoltage: 5, time: 0, state: 0 }; }
  get propertyMeta() {
    return {
      frequency: { label: 'Freq (Hz)', type: 'number', min: 0.1, max: 100 },
      outputVoltage: { label: 'Voltage', type: 'number', min: 1, max: 12 }
    };
  }
  
  getBounds() {
    return { minX: -25, minY: -25, maxX: 25, maxY: 25 };
  }

  get pinPositions() {
    return [
      { offsetX: -20, offsetY: 0, label: 'GND' },
      { offsetX: 20, offsetY: 0, label: 'OUT' },
    ];
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    const outLevel = componentState.properties.state || 0;
    const targetV = outLevel ? (componentState.properties.outputVoltage || 5.0) : 0;
    
    const nOut = resolvedNodeMap.get(componentState.pins[1].id) || 0;
    const nGnd = resolvedNodeMap.get(componentState.pins[0].id) || 0;

    const OUTPUT_RESISTANCE = 50; 

    if (nOut > 0) {
      const g = 1.0 / OUTPUT_RESISTANCE;
      A[nOut - 1][nOut - 1] += g;
      Z[nOut - 1] += targetV * g;
      if (nGnd > 0) {
        A[nOut - 1][nGnd - 1] -= g;
        A[nGnd - 1][nOut - 1] -= g;
        A[nGnd - 1][nGnd - 1] += g;
        Z[nGnd - 1] -= targetV * g;
      }
    }
  }

  getUpdatedProperties(componentState, nodeVoltages, extraVars, dt) {
    let { frequency, time, state } = componentState.properties;
    time = (time || 0) + dt;
    const period = 1.0 / (frequency || 1);
    const newState = (time % period) < (period / 2) ? 1 : 0;
    
    if (time >= period) {
      time -= period;
    }

    if (newState !== state || Math.abs(time - (componentState.properties.time || 0)) > 1e-6) {
       return { time, state: newState };
    }
    return null;
  }

  renderShape(componentState) {
    const state = componentState.properties.state;
    return (
      <g>
        <rect x="-20" y="-20" width="40" height="40" fill="#222" stroke="#60a5fa" rx="2" strokeWidth="2" />
        <path d={state ? "M -12 8 L -12 -8 L 0 -8 L 0 8 L 12 8 L 12 -8" : "M -12 -8 L -12 8 L 0 8 L 0 -8 L 12 -8 L 12 8"} 
              stroke="#60a5fa" fill="none" strokeWidth="2" strokeLinecap="square" />
        <text x="0" y="32" fill="#60a5fa" fontSize="9" textAnchor="middle" fontWeight="bold">{componentState.properties.frequency} Hz</text>
      </g>
    );
  }

  renderIcon() {
    return (
      <g stroke="#60a5fa" fill="none" strokeWidth="6">
        <rect x="-30" y="-30" width="60" height="60" rx="4" />
        <path d="M -15 15 L -15 -15 L 0 -15 L 0 15 L 15 15 L 15 -15" />
      </g>
    );
  }
}

