# Component Model Authoring Guide

This guide walks through adding a new component model. As a worked example we'll add a **Potentiometer** (voltage divider with a wiper pin).

## 1. Decide the domain

- **Analog** — stamped into MNA (most components). ✓ Use for Potentiometer.
- **Digital** — handled by the digital event kernel (gates, flip-flops, counters).
- **Interface** — spans both domains (output buffers, input samplers).

## 2. Create the model class

Create or add to a file in `src/core/models/`. Extend `BaseComponent`:

```js
// src/core/models/ResistorBased.jsx  (add at bottom)
export class PotentiometerModel extends BaseComponent {
  get type()    { return 'POTENTIOMETER' }
  get label()   { return 'Potentiometer' }
  get category(){ return 'Passive' }
  get color()   { return '#f59e0b' }
  get numPins() { return 3 } // [0]=A, [1]=Wiper, [2]=B

  get defaultProperties() {
    return { resistance: 10000, position: 0.5, maxPower: 0.25 }
  }
  get propertyMeta() {
    return {
      resistance: { label: 'Total R (Ω)', type: 'number', min: 1 },
      position:   { label: 'Wiper (0–1)', type: 'number', min: 0, max: 1, step: 0.01 },
    }
  }

  isLinear() { return true }  // stamps don't depend on X
```

## 3. Implement `applyMNA`

A potentiometer is two resistors in series: `R1 = position * R`, `R2 = (1-position) * R`.

```js
  applyMNA(A, Z, state, nodeMap) {
    if (state.properties.damaged) return
    const R   = state.properties.resistance ?? 10000
    const pos = Math.min(1, Math.max(0, state.properties.position ?? 0.5))
    const R1  = R * pos         // A → Wiper
    const R2  = R * (1 - pos)   // Wiper → B

    const nA = nodeMap.get(state.pins[0].id) || 0
    const nW = nodeMap.get(state.pins[1].id) || 0  // wiper
    const nB = nodeMap.get(state.pins[2].id) || 0

    const G1 = R1 > 0 ? 1 / R1 : 1e9
    const G2 = R2 > 0 ? 1 / R2 : 1e9

    // Stamp R1 (A–Wiper)
    if (nA > 0) A[nA-1][nA-1] += G1
    if (nW > 0) A[nW-1][nW-1] += G1
    if (nA > 0 && nW > 0) { A[nA-1][nW-1] -= G1; A[nW-1][nA-1] -= G1 }

    // Stamp R2 (Wiper–B)
    if (nW > 0) A[nW-1][nW-1] += G2
    if (nB > 0) A[nB-1][nB-1] += G2
    if (nW > 0 && nB > 0) { A[nW-1][nB-1] -= G2; A[nB-1][nW-1] -= G2 }
  }
```

**Stamp rules:**
- Conductance `G = 1/R` is stamped symmetrically at the four positions `(n1,n1)`, `(n2,n2)`, `(n1,n2)`, `(n2,n1)`.
- Always guard with `if (n > 0)` — node 0 is ground (eliminated).
- Don't stamp the ground row/column.

## 4. Implement helper hooks

```js
  extractCurrent(state, nodeVoltages, extraVarValues, dt) {
    const vA = nodeVoltages[state.pins[0].id] || 0
    const vB = nodeVoltages[state.pins[2].id] || 0
    const R  = state.properties.resistance ?? 10000
    return (vA - vB) / R
  }

  checkDamage(state, current, voltage) {
    if (state.properties.damaged) return false
    const P = current * current * (state.properties.resistance ?? 10000)
    if (P > (state.properties.maxPower ?? 0.25))
      return `Overpower: ${P.toFixed(2)}W exceeds ${state.properties.maxPower}W rating`
    return false
  }
```

## 5. Add `renderShape` (SVG)

The component origin is `(0,0)`. Pins are placed at their `offsetX, offsetY` coordinates (set in step 6). Keep shapes within ±40px.

```js
  renderShape(state, current) {
    return (
      <g>
        <line x1="-30" y1="0" x2="30" y2="0" stroke={this.color} strokeWidth="3" />
        <rect x="-20" y="-8" width="40" height="16" rx="3"
          fill="none" stroke={this.color} strokeWidth="2" />
        {/* wiper arrow */}
        <line x1={((state.properties.position ?? 0.5) - 0.5) * 40}
              y1="-14" x2={((state.properties.position ?? 0.5) - 0.5) * 40}
              y2="14" stroke="#fbbf24" strokeWidth="2" />
      </g>
    )
  }

  renderIcon() {
    return (
      <g>
        <line x1="-30" y1="0" x2="30" y2="0" stroke={this.color} strokeWidth="4" />
        <rect x="-20" y="-10" width="40" height="20" rx="4" fill="none" stroke={this.color} strokeWidth="3" />
      </g>
    )
  }
```

## 6. Register the model

In `src/core/ComponentDefs.js`, import and add to the registry:

```js
import { PotentiometerModel } from './models/ResistorBased.jsx'
// ...
registry.register(new PotentiometerModel())
```

Also add to `COMPONENT_DEFINITIONS` for sidebar display:

```js
POTENTIOMETER: {
  pins: [
    { index: 0, label: 'A',     offsetX: -30, offsetY: 0 },
    { index: 1, label: 'W',     offsetX:   0, offsetY: -20 },
    { index: 2, label: 'B',     offsetX:  30, offsetY: 0 },
  ],
  defaultProperties: new PotentiometerModel().defaultProperties,
  propertyMeta:      new PotentiometerModel().propertyMeta,
}
```

The Sidebar picks up newly registered models automatically.

## 7. Write a unit test

```js
// test/unit/models/Potentiometer.test.js
import { describe, it, expect } from 'vitest'
import '../../src/core/ComponentDefs.js'
import { createSession } from '../../src/core/solver/index.js'

it('potentiometer wiper at 50% gives Vout = Vin/2', () => {
  // ... build a circuit and assert node voltage
})
```

## Common pitfalls

| Pitfall | Fix |
|---|---|
| Stamping at `n-1` when `n=0` (ground row) | Always guard `if (n > 0)` |
| Forgetting to return `null` from `getUpdatedProperties` for stateless components | Return `null`, not `{}` — `{}` triggers unnecessary state updates |
| Using `Math.abs(resistance)` for negative R (tetrahedra oscillator) | Negative resistance is valid; don't abs() it |
| Not handling `state.properties.damaged` | Add `if (state.properties.damaged) return` at the top of `applyMNA` |
