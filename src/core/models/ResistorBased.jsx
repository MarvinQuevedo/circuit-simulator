import BaseComponent from './BaseComponent.jsx';
import React from 'react';

export class ResistorModel extends BaseComponent {
  get type() { return 'RESISTOR'; }
  get label() { return 'Resistor'; }
  get category() { return 'Passive'; }
  get numPins() { return 2; }
  get defaultProperties() { return { resistance: 1000, maxPower: 0.25 }; }
  get propertyMeta() { 
    return { 
      resistance: { label: 'Resistance (Ω)', type: 'number' },
      maxPower: { label: 'Max Power (W)', type: 'number', min: 0 }
    }; 
  }
  get color() { return '#f59e0b'; }

  applyMNA(A, Z, componentState, finalNodeMap) {
    let r = componentState.properties.damaged ? 1e9 : (componentState.properties.resistance || 1000);
    // Prevent division by zero
    if (r < 1e-6) r = 1e-6; 
    
    const g = 1.0 / r;
    const n1 = finalNodeMap.get(componentState.pins[0].id) || 0;
    const n2 = finalNodeMap.get(componentState.pins[1].id) || 0;

    if (n1 > 0) A[n1 - 1][n1 - 1] += g;
    if (n2 > 0) A[n2 - 1][n2 - 1] += g;
    if (n1 > 0 && n2 > 0) {
      A[n1 - 1][n2 - 1] -= g;
      A[n2 - 1][n1 - 1] -= g;
    }
  }

  extractCurrent(componentState, nodeVoltages) {
    let r = componentState.properties.damaged ? 1e9 : (componentState.properties.resistance || 1000);
    if (r < 1e-6) r = 1e-6;
    const v1 = nodeVoltages[componentState.pins[0].id] || 0;
    const v2 = nodeVoltages[componentState.pins[1].id] || 0;
    return (v1 - v2) / r;
  }

  checkDamage(componentState, current, voltage) {
    if (componentState.properties.damaged) return false;
    const r = componentState.properties.resistance || 1000;
    const maxP = componentState.properties.maxPower ?? 0.25;
    
    // Calculate wattage
    const power = current * current * r;
    if (power > maxP) {
      return `Power exceeded limit (${maxP}W max). ${(power).toFixed(2)}W dissipated.`;
    }
    return false;
  }

  renderShape() {
    return (
      <path d="M -30 0 L -15 0 L -10 -10 L 0 10 L 10 -10 L 15 0 L 30 0" stroke={this.color} strokeWidth="3" fill="none" />
    );
  }

  renderIcon() {
    return (
      <path d="M -30 0 L -15 0 L -10 -15 L 0 15 L 10 -15 L 15 0 L 30 0" stroke={this.color} strokeWidth="4" fill="none" />
    );
  }
}

export class SwitchModel extends ResistorModel {
  get type() { return 'SWITCH'; }
  get label() { return 'Switch'; }
  get category() { return 'Interactive'; }
  get defaultProperties() { return { closed: false, maxCurrent: 15 }; }
  get propertyMeta() { 
    return {
      maxCurrent: { label: 'Max Current (A)', type: 'number', min: 0 }
    }; 
  }
  get color() { return '#a8a29e'; }

  applyMNA(A, Z, componentState, finalNodeMap) {
    // Open = 100TΩ (truly negligible leakage) 
    // Closed = 1Ω (numerically stable, ~0V drop at mA range)
    const r = componentState.properties.closed ? 1.0 : 1e13;
    componentState.properties.resistance = r;
    super.applyMNA(A, Z, componentState, finalNodeMap);
    componentState.properties.resistance = undefined;
  }

  extractCurrent(componentState, nodeVoltages) {
    if (!componentState.properties.closed) return 0;
    const v1 = nodeVoltages[componentState.pins[0].id] || 0;
    const v2 = nodeVoltages[componentState.pins[1].id] || 0;
    return (v1 - v2) / 1.0; // matches stamped R=1Ω
  }

  checkDamage(componentState, current, voltage) {
    if (componentState.properties.damaged) return false;
    const maxI = componentState.properties.maxCurrent ?? 15;
    if (current > maxI) {
      return `Overcurrent: ${(current).toFixed(2)}A exceeded maximum switch rating of ${maxI}A. Contacts melted.`;
    }
    return false;
  }

  renderShape(componentState) {
    const closed = componentState.properties.closed;
    return (
      <g>
        <circle cx="-15" cy="0" r="3" fill={this.color} />
        <circle cx="15" cy="0" r="3" fill={this.color} />
        <line x1="-30" y1="0" x2="-15" y2="0" stroke={this.color} strokeWidth="3" />
        <line x1="15" y1="0" x2="30" y2="0" stroke={this.color} strokeWidth="3" />
        <line x1="-15" y1="0" x2={closed ? "15" : "12"} y2={closed ? "0" : "-15"} stroke={this.color} strokeWidth="3" style={{ transition: 'all 0.2s' }} />
      </g>
    );
  }

  renderIcon() {
    return (
      <g stroke={this.color}>
        <circle cx="-15" cy="0" r="4" fill={this.color} />
        <circle cx="15" cy="0" r="4" fill={this.color} />
        <line x1="-30" y1="0" x2="-15" y2="0" strokeWidth="4" />
        <line x1="15" y1="0" x2="30" y2="0" strokeWidth="4" />
        <line x1="-15" y1="0" x2="10" y2="-15" strokeWidth="4" />
      </g>
    );
  }
}

export class PushbuttonModel extends SwitchModel {
  get type() { return 'PUSH_BUTTON'; }
  get label() { return 'Push Button'; }
  get category() { return 'Interactive'; }
  get color() { return '#f87171'; }

  renderShape(componentState) {
    const closed = componentState.properties.closed;
    return (
      <g>
        <rect x="-20" y="-12" width="40" height="24" fill="#333" stroke={this.color} strokeWidth="2" rx="2" />
        <circle cx="0" cy="0" r={closed ? 8 : 10} fill={this.color} style={{ transition: 'all 0.1s' }} />
        <line x1="-30" y1="0" x2="-20" y2="0" stroke={this.color} strokeWidth="3" />
        <line x1="20" y1="0" x2="30" y2="0" stroke={this.color} strokeWidth="3" />
      </g>
    );
  }

  renderIcon() {
    return (
      <g>
        <rect x="-20" y="-12" width="40" height="24" fill="none" stroke={this.color} strokeWidth="3" rx="2" />
        <circle cx="0" cy="0" r="8" fill={this.color} />
      </g>
    );
  }
}

export class BulbModel extends ResistorModel {
  get type() { return 'BULB'; }
  get label() { return 'Light Bulb'; }
  get category() { return 'Output'; }
  get defaultProperties() { return { resistance: 100, maxPower: 2.5 }; }
  get propertyMeta() { 
    return { 
      resistance: { label: 'Resistance (Ω)', type: 'number' },
      maxPower: { label: 'Max Power (W)', type: 'number', min: 0 }
    }; 
  }
  get color() { return '#fbbf24'; }

  renderShape(componentState, simulationCurrent) {
    const isGlowing = Math.abs(simulationCurrent) > 0.001; // > 1mA
    const brightness = Math.min(1, Math.abs(simulationCurrent) * 10); // Scale brightness
    return (
      <g>
        <line x1="-30" y1="0" x2="-15" y2="0" stroke={this.color} strokeWidth="3" />
        <line x1="15" y1="0" x2="30" y2="0" stroke={this.color} strokeWidth="3" />
        <circle cx="0" cy="0" r="15" fill={isGlowing ? `rgba(251, 191, 36, ${0.4 + brightness * 0.6})` : 'transparent'} stroke={this.color} strokeWidth="2" style={{ transition: 'fill 0.2s' }} />
        <path d="M -8 5 L -4 -5 L 4 5 L 8 -5" fill="none" stroke={this.color} strokeWidth="2" />
      </g>
    );
  }

  checkDamage(componentState, current, voltage) {
    if (componentState.properties.damaged) return false;
    const r = componentState.properties.resistance || 100;
    const maxP = componentState.properties.maxPower ?? 2.5;

    const power = current * current * r;
    if (power > maxP) {
      return `Power exceeded limit (${maxP}W max). ${(power).toFixed(2)}W dissipated, causing filament to burn out.`;
    }
    return false; 
  }

  renderIcon() {
    return (
      <g stroke={this.color} fill="none">
        <line x1="-30" y1="0" x2="-15" y2="0" strokeWidth="4" />
        <line x1="15" y1="0" x2="30" y2="0" strokeWidth="4" />
        <circle cx="0" cy="0" r="18" strokeWidth="3" />
        <path d="M -10 6 L -5 -6 L 5 6 L 10 -6" strokeWidth="3" />
      </g>
    );
  }
}
