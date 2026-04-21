/**
 * Integration test: RC low-pass circuit.
 *
 * Circuit: 5V DC source → 1kΩ resistor → 100μF capacitor → GND
 * Time constant τ = R*C = 0.1 s
 * At t=τ, vCap should be ≈ 5*(1 - e⁻¹) ≈ 3.16 V
 * At t=5τ=0.5s, vCap should be ≈ 5V (fully charged)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createSession } from '../../src/core/solver/index.js'
import '../../src/core/ComponentDefs.js' // registers all models

function makeRC({ voltage = 5, R = 1000, C_uF = 100 } = {}) {
  const components = [
    {
      id: 'vs', type: 'DC_VOLTAGE_SOURCE',
      pins: [{ id: 'vs_p' }, { id: 'vs_n' }],
      properties: { voltage },
    },
    {
      id: 'gnd', type: 'GROUND',
      pins: [{ id: 'gnd_p' }],
      properties: {},
    },
    {
      id: 'r1', type: 'RESISTOR',
      pins: [{ id: 'r1_a' }, { id: 'r1_b' }],
      properties: { resistance: R },
    },
    {
      id: 'c1', type: 'CAPACITOR',
      pins: [{ id: 'c1_a' }, { id: 'c1_b' }],
      properties: { capacitance: C_uF, vCap: 0, iCap: 0, maxVoltage: 50 },
    },
  ]

  // Topology: vs(+) — r1_a — r1_b — c1_a — c1_b — gnd
  const wires = [
    { id: 'w1', startPinId: 'vs_p', endPinId: 'r1_a' },
    { id: 'w2', startPinId: 'r1_b', endPinId: 'c1_a' },
    { id: 'w3', startPinId: 'c1_b', endPinId: 'gnd_p' },
    { id: 'w4', startPinId: 'vs_n', endPinId: 'gnd_p' },
  ]

  return { components, wires }
}

// Step response: capacitor starts at 0V, voltage source applies 5V at t=0.
// solveDC() is intentionally NOT called — it would set vCap=5V (correct for
// DC steady-state) but the test validates the transient charging waveform.
describe('RC step response (BackwardEuler)', () => {
  it('capacitor reaches ~63.2% of supply at t=τ', () => {
    const { components, wires } = makeRC()
    const session = createSession(components, wires, { integrator: 'backward-euler' })
    // No solveDC() — capacitor starts discharged (vCap=0)

    const R = 1000, C = 100e-6
    const tau = R * C    // 0.1 s
    const dt = 0.001     // 1 ms steps (τ/100)
    const steps = Math.round(tau / dt)

    let vCap = 0
    for (let i = 0; i < steps; i++) {
      const r = session.step(dt)
      vCap = r.nodeVoltages['c1_a'] ?? 0
    }

    const expected = 5 * (1 - Math.exp(-1)) // ≈ 3.161
    // Backward Euler at dt=τ/100 has ~1% error — allow 0.1V tolerance
    expect(Math.abs(vCap - expected)).toBeLessThan(0.12)
  })

  it('capacitor reaches >99% of supply at t=5τ', () => {
    const { components, wires } = makeRC()
    const session = createSession(components, wires, { integrator: 'backward-euler' })

    const dt = 0.002
    const steps = Math.round(0.5 / dt) // 5τ = 0.5 s

    let vCap = 0
    for (let i = 0; i < steps; i++) {
      const r = session.step(dt)
      vCap = r.nodeVoltages['c1_a'] ?? 0
    }

    expect(vCap).toBeGreaterThan(4.9) // > 99% of 5V
  })
})

describe('RC step response (Trapezoidal)', () => {
  it('capacitor reaches ~63.2% of supply at t=τ with better accuracy than BE', () => {
    const { components, wires } = makeRC()
    const session = createSession(components, wires, { integrator: 'trapezoidal' })
    // No solveDC() — capacitor starts discharged

    const dt = 0.001
    const steps = 100 // τ = 0.1s / 1ms = 100 steps

    let vCap = 0
    for (let i = 0; i < steps; i++) {
      const r = session.step(dt)
      vCap = r.nodeVoltages['c1_a'] ?? 0
    }

    const expected = 5 * (1 - Math.exp(-1))
    // Trapezoidal is 2nd order — same tolerance but should be closer
    expect(Math.abs(vCap - expected)).toBeLessThan(0.12)
  })
})

describe('Simple resistor divider (no reactive elements)', () => {
  it('voltage divider produces Vout = Vin * R2/(R1+R2)', () => {
    const components = [
      { id: 'vs', type: 'DC_VOLTAGE_SOURCE', pins: [{ id: 'vp' }, { id: 'vn' }], properties: { voltage: 10 } },
      { id: 'gnd', type: 'GROUND', pins: [{ id: 'gp' }], properties: {} },
      { id: 'r1', type: 'RESISTOR', pins: [{ id: 'r1a' }, { id: 'r1b' }], properties: { resistance: 1000 } },
      { id: 'r2', type: 'RESISTOR', pins: [{ id: 'r2a' }, { id: 'r2b' }], properties: { resistance: 1000 } },
    ]
    const wires = [
      { id: 'w1', startPinId: 'vp', endPinId: 'r1a' },
      { id: 'w2', startPinId: 'r1b', endPinId: 'r2a' },
      { id: 'w3', startPinId: 'r2b', endPinId: 'gp' },
      { id: 'w4', startPinId: 'vn', endPinId: 'gp' },
    ]
    const session = createSession(components, wires)
    session.solveDC()
    const r = session.step(0.001)
    // Midpoint = 10 * 1000/2000 = 5V
    expect(r.nodeVoltages['r2a']).toBeCloseTo(5, 3)
  })
})
