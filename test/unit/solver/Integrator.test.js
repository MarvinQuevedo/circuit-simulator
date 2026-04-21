import { describe, it, expect } from 'vitest'
import { BackwardEuler, Trapezoidal } from '../../../src/core/solver/Integrator.js'

describe('BackwardEuler capacitor companion', () => {
  it('produces correct Geq and Ieq for first step (vPrev=0)', () => {
    const C = 100e-6 // 100 μF
    const dt = 0.002 // 2 ms
    const { Geq, Ieq } = BackwardEuler.companionCapacitor(C, 0, 0, dt)
    expect(Geq).toBeCloseTo(C / dt, 6)   // 0.05 S
    expect(Ieq).toBeCloseTo(0, 10)       // no history current
  })

  it('produces correct Ieq when vPrev is non-zero', () => {
    const C = 100e-6, dt = 0.002
    const vPrev = 5
    const { Geq, Ieq } = BackwardEuler.companionCapacitor(C, vPrev, 0, dt)
    expect(Ieq).toBeCloseTo(Geq * vPrev, 6)
  })
})

describe('Trapezoidal capacitor companion', () => {
  it('has double Geq compared to Backward Euler', () => {
    const C = 100e-6, dt = 0.002
    const { Geq: GeqBE } = BackwardEuler.companionCapacitor(C, 0, 0, dt)
    const { Geq: GeqTR } = Trapezoidal.companionCapacitor(C, 0, 0, dt)
    expect(GeqTR).toBeCloseTo(2 * GeqBE, 6)
  })

  it('Ieq includes iPrev history term', () => {
    const C = 100e-6, dt = 0.002
    const vPrev = 5, iPrev = 0.1
    const { Geq, Ieq } = Trapezoidal.companionCapacitor(C, vPrev, iPrev, dt)
    expect(Ieq).toBeCloseTo(Geq * vPrev + iPrev, 6)
  })
})
