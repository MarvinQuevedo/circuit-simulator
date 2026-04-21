import BaseComponent from './BaseComponent.jsx';
import React from 'react';

export const DIODE_MODELS = {
  '1N4148':  { label: '1N4148 (Fast Diode)',    Vf: 0.6, Ron: 0.1,  type: 'diode' },
  '1N4001':  { label: '1N4001 (Rectifier 50V)', Vf: 0.7, Ron: 0.08, type: 'diode' },
  '1N4007':  { label: '1N4007 (Rectifier 1kV)', Vf: 0.7, Ron: 0.05, type: 'diode' },
  'BAT43':   { label: 'BAT43 (Schottky)',        Vf: 0.3, Ron: 0.05, type: 'diode' },
  '1N4733A': { label: '1N4733A (5.1V Zener)',   Vf: 0.7, Ron: 0.1,  Vz: 5.1, type: 'zener' },
  '1N4740A': { label: '1N4740A (10V Zener)',    Vf: 0.7, Ron: 0.1,  Vz: 10,  type: 'zener' },
  '1N4751A': { label: '1N4751A (30V Zener)',    Vf: 0.7, Ron: 0.1,  Vz: 30,  type: 'zener' },
  'CUSTOM':  { label: 'Custom…',                Vf: 0.6, Ron: 0.1,  type: 'diode' },
};

export const LED_MODELS = {
  'RED':     { label: 'Red LED',     Vf: 1.8, Ron: 0.1, color: '#ef4444', glow: 'rgba(239, 68, 68, 0.6)' },
  'GREEN':   { label: 'Green LED',   Vf: 2.2, Ron: 0.1, color: '#22c55e', glow: 'rgba(34, 197, 94, 0.6)' },
  'BLUE':    { label: 'Blue LED',    Vf: 3.2, Ron: 0.1, color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.6)' },
  'YELLOW':  { label: 'Yellow LED',  Vf: 2.1, Ron: 0.1, color: '#eab308', glow: 'rgba(234, 179, 8, 0.6)' },
  'WHITE':   { label: 'White LED',   Vf: 3.4, Ron: 0.1, color: '#f8fafc', glow: 'rgba(248, 250, 252, 0.7)' },
  'IR':      { label: 'IR LED',      Vf: 1.2, Ron: 0.1, color: '#7c3aed', glow: 'rgba(124, 58, 237, 0.5)' },
  'CUSTOM':  { label: 'Custom…',     Vf: 2.0, Ron: 0.1, color: '#a855f7', glow: 'rgba(168, 85, 247, 0.6)' },
};

export class DiodeModel extends BaseComponent {
  get type() { return 'DIODE'; }
  get label() { return 'Diode'; }
  get category() { return 'Semiconductors'; }
  get numPins() { return 2; }
  get defaultProperties() { return { modelId: '1N4148', useCustom: false, Vf: 0.6, Ron: 0.1 }; }
  
  get propertyMeta() { 
    return {
      modelId: { 
        type: 'model-select', 
        label: 'Diode Model', 
        options: Object.entries(DIODE_MODELS).map(([k, v]) => ({ value: k, label: v.label })),
        modelLibrary: DIODE_MODELS,
        customFields: [
          { key: 'Vf',  label: 'Forward Voltage (V)', type: 'number', min: 0, step: 0.01 },
          { key: 'Ron', label: 'On Resistance (Ω)',   type: 'number', min: 0.001, step: 0.01 },
        ]
      }
    };
  }

  get color() { return '#9ca3af'; } // Grayish

  // Pull effective model — merges preset with any user overrides
  _resolveModel(properties) {
    const preset = DIODE_MODELS[properties.modelId] || DIODE_MODELS['1N4148'];
    if (!properties.useCustom) return preset;
    return {
      ...preset,
      Vf:  properties.Vf  !== undefined ? properties.Vf  : preset.Vf,
      Ron: properties.Ron !== undefined ? properties.Ron : preset.Ron,
      ...(properties.Vz !== undefined ? { Vz: properties.Vz } : {}),
    };
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    if (componentState.properties.damaged) return; // Burned out, open circuit

    const model = this._resolveModel(componentState.properties);
    const pA = componentState.pins[0].id;
    const pC = componentState.pins[1].id;
    const nA = resolvedNodeMap.get(pA) || 0;
    const nC = resolvedNodeMap.get(pC) || 0;

    const vA = lastNodeVoltages ? (lastNodeVoltages[pA] || 0) : 0;
    const vC = lastNodeVoltages ? (lastNodeVoltages[pC] || 0) : 0;
    const Vd = vA - vC;

    let G = 1e-9;
    let Ieq = 0; // equivalent current injection

    if (Vd > model.Vf) {
      // Forward biased
      G = 1.0 / model.Ron;
      Ieq = model.Vf * G;
    } else if (model.Vz && Vd < -model.Vz) {
      // Reverse biased Zener breakdown
      G = 1.0 / model.Ron;
      Ieq = -model.Vz * G;
    }

    // Add conductances
    if (nA > 0) A[nA - 1][nA - 1] += G;
    if (nC > 0) A[nC - 1][nC - 1] += G;
    if (nA > 0 && nC > 0) {
      A[nA - 1][nC - 1] -= G;
      A[nC - 1][nA - 1] -= G;
    }

    // Add Norton equivalent current sources
    if (nA > 0) Z[nA - 1] += Ieq;
    if (nC > 0) Z[nC - 1] -= Ieq;
  }

  extractCurrent(componentState, nodeVoltages) {
    if (componentState.properties.damaged) return 0;

    const model = this._resolveModel(componentState.properties);
    const vA = nodeVoltages[componentState.pins[0].id] || 0;
    const vC = nodeVoltages[componentState.pins[1].id] || 0;
    const Vd = vA - vC;
    
    if (Vd > model.Vf) {
      return (Vd - model.Vf) / model.Ron;
    } else if (model.Vz && Vd < -model.Vz) {
      return (Vd + model.Vz) / model.Ron; // Negative current
    }
    return Vd * 1e-9; 
  }

  checkDamage(componentState, current, voltage) {
    if (componentState.properties.damaged) return false;
    const model = this._resolveModel(componentState.properties);
    const Vd = voltage; // we map voltage to Vd
    
    // Blows up if forward current > 1.5A or reverse voltage (non-zener) is extreme > 100V
    if (current > 1.5) return `Overcurrent: ${(current).toFixed(2)}A exceeded maximum 1.5A rating.`;
    if (model.type !== 'zener' && Vd < -100) return `Reverse breakdown: Extrapolated ${(-Vd).toFixed(1)}V exceeds Max Reverse Voltage (100V).`;
    
    // Zener blows up if dissipating too much power (e.g. > 1W)
    if (model.type === 'zener' && Vd < 0 && Math.abs(current * Vd) > 1.0) {
      return `Power dissipation limit: ${Math.abs(current * Vd).toFixed(2)}W dissipated in Zener breakdown (>1W).`;
    }

    return false;
  }

  renderShape(componentState) {
    const model = this._resolveModel(componentState.properties);
    const isZener = model.type === 'zener';

    return (
      <g>
        <line x1="-30" y1="0" x2="-15" y2="0" stroke={this.color} strokeWidth="3" />
        <line x1="15" y1="0" x2="30" y2="0" stroke={this.color} strokeWidth="3" />
        {/* Triangle */}
        <polygon points="-15,10 -15,-10 5,0" fill={this.color} />
        {/* Cathode line */}
        <line x1="5" y1="-10" x2="5" y2="10" stroke={this.color} strokeWidth="3" />
        {isZener && (
          <>
            <line x1="5" y1="-10" x2="10" y2="-10" stroke={this.color} strokeWidth="2" />
            <line x1="5" y1="10" x2="0" y2="10" stroke={this.color} strokeWidth="2" />
          </>
        )}
      </g>
    );
  }

  renderIcon() {
    return (
      <g stroke={this.color}>
        <line x1="-30" y1="0" x2="-12" y2="0" strokeWidth="3" />
        <line x1="12" y1="0" x2="30" y2="0" strokeWidth="3" />
        <polygon points="-12,12 -12,-12 12,0" fill={this.color} />
        <line x1="12" y1="-12" x2="12" y2="12" strokeWidth="3" />
      </g>
    );
  }
}

export class LedModel extends DiodeModel {
  get type() { return 'LED'; }
  get label() { return 'LED'; }
  get category() { return 'Output'; }
  get defaultProperties() { return { modelId: 'RED', useCustom: false, Vf: 1.8, Ron: 0.1 }; }
  
  get propertyMeta() { 
    return {
      modelId: { 
        type: 'model-select', 
        label: 'LED Model', 
        options: Object.entries(LED_MODELS).map(([k, v]) => ({ value: k, label: v.label })),
        modelLibrary: LED_MODELS,
        customFields: [
          { key: 'Vf',  label: 'Forward Voltage (V)', type: 'number', min: 0, step: 0.01 },
          { key: 'Ron', label: 'On Resistance (Ω)',   type: 'number', min: 0.001, step: 0.01 },
        ]
      }
    };
  }

  _resolveLedModel(properties) {
    const preset = LED_MODELS[properties.modelId] || LED_MODELS['RED'];
    if (!properties.useCustom) return preset;
    return {
      ...preset,
      Vf:  properties.Vf  !== undefined ? properties.Vf  : preset.Vf,
      Ron: properties.Ron !== undefined ? properties.Ron : preset.Ron,
    };
  }

  applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages) {
    const model = this._resolveLedModel(componentState.properties);
    // Temporarily stamp LED model into DIODE_MODELS for the parent applyMNA
    const originalModelId = componentState.properties.modelId;
    DIODE_MODELS['_TEMP_LED'] = model;
    componentState.properties.modelId = '_TEMP_LED';
    
    super.applyMNA(A, Z, componentState, resolvedNodeMap, extraVarIndices, lastNodeVoltages);
    
    componentState.properties.modelId = originalModelId;
    delete DIODE_MODELS['_TEMP_LED'];
  }

  extractCurrent(componentState, nodeVoltages) {
    const model = this._resolveLedModel(componentState.properties);
    const originalModelId = componentState.properties.modelId;
    DIODE_MODELS['_TEMP_LED'] = model;
    componentState.properties.modelId = '_TEMP_LED';
    
    const ans = super.extractCurrent(componentState, nodeVoltages);
    
    componentState.properties.modelId = originalModelId;
    delete DIODE_MODELS['_TEMP_LED'];
    return ans;
  }

  checkDamage(componentState, current, voltage) {
    if (componentState.properties.damaged) return false;
    // An LED blows up if forward current > 50mA or reverse voltage > 5V
    if (current > 0.05) return `Overcurrent fatal: ${(current * 1000).toFixed(1)}mA exceeded the 50mA maximum limit for LEDs.`; 
    if (voltage < -6) return `Reverse voltage fatal: Reversed ${Math.abs(voltage).toFixed(1)}V broke through the fragile 6V limit.`; 
    return false;
  }

  renderShape(componentState, simulationCurrent) {
    const model = this._resolveLedModel(componentState.properties);
    const isGlowing = simulationCurrent > 0.001; // > 1mA forward
    const brightness = Math.min(1, Math.max(0, simulationCurrent) * 20); // Scale up brightness
    const baseColor = model.color;

    return (
      <g>
        <line x1="-30" y1="0" x2="-15" y2="0" stroke={baseColor} strokeWidth="3" />
        <line x1="15" y1="0" x2="30" y2="0" stroke={baseColor} strokeWidth="3" />
        <polygon points="-15,10 -15,-10 5,0" fill={baseColor} />
        <line x1="5" y1="-10" x2="5" y2="10" stroke={baseColor} strokeWidth="3" />
        
        {/* Light rays */}
        <line x1="8" y1="-12" x2="14" y2="-18" stroke={baseColor} strokeWidth="2" opacity={isGlowing ? 1 : 0.3} />
        <polygon points="12,-18 16,-19 15,-15" fill={baseColor} opacity={isGlowing ? 1 : 0.3} />
        
        <line x1="0" y1="-14" x2="4" y2="-22" stroke={baseColor} strokeWidth="2" opacity={isGlowing ? 1 : 0.3}/>
        <polygon points="2,-22 6,-24 6,-20" fill={baseColor} opacity={isGlowing ? 1 : 0.3}/>

        {/* Glow halo */}
        <circle cx="-5" cy="0" r="22" fill={isGlowing ? model.glow : 'transparent'} style={{ transition: 'opacity 0.1s', opacity: brightness }} pointerEvents="none" />
      </g>
    );
  }

  renderIcon() {
    return (
      <g stroke="#ef4444">
        <line x1="-30" y1="0" x2="-12" y2="0" strokeWidth="3" />
        <line x1="12" y1="0" x2="30" y2="0" strokeWidth="3" />
        <polygon points="-12,12 -12,-12 12,0" fill="#ef4444" />
        <line x1="12" y1="-12" x2="12" y2="12" strokeWidth="3" />
        <line x1="10" y1="-15" x2="18" y2="-23" strokeWidth="2" />
        <line x1="0" y1="-18" x2="5" y2="-28" strokeWidth="2" />
      </g>
    );
  }
}
