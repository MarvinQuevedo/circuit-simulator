import { describe, it, expect } from 'vitest'
import { LUDecomposition } from '../../../src/core/solver/LUDecomposition.js'

function solve2x2(a00, a01, a10, a11, b0, b1) {
  const lu = new LUDecomposition(2)
  const A = [new Float64Array([a00, a01]), new Float64Array([a10, a11])]
  lu.factor(A)
  const x = new Float64Array(2)
  lu.solve(new Float64Array([b0, b1]), x)
  return x
}

describe('LUDecomposition', () => {
  it('solves a simple 2x2 system [[4,3],[6,3]] x = [10,12]', () => {
    // 4x+3y=10, 6x+3y=12 → x=1, y=2
    const x = solve2x2(4, 3, 6, 3, 10, 12)
    expect(x[0]).toBeCloseTo(1, 6)
    expect(x[1]).toBeCloseTo(2, 6)
  })

  it('solves identity matrix system', () => {
    const x = solve2x2(1, 0, 0, 1, 5, 7)
    expect(x[0]).toBeCloseTo(5, 6)
    expect(x[1]).toBeCloseTo(7, 6)
  })

  it('handles near-singular matrix gracefully (floating node → 0)', () => {
    const lu = new LUDecomposition(2)
    // Singular: second row is zero
    const A = [new Float64Array([1, 0]), new Float64Array([0, 0])]
    lu.factor(A)
    expect(lu.isValid()).toBe(false)
    const x = new Float64Array(2)
    lu.solve(new Float64Array([3, 0]), x)
    expect(x[0]).toBeCloseTo(3, 6)
    expect(x[1]).toBe(0) // floating node → 0
  })

  it('accepts array-of-Float64Array input (dense row format)', () => {
    const lu = new LUDecomposition(3)
    // 2x+y+z=8, 4x+3y+3z=20, 8x+7y+9z=48 → x=y=z=2
    // Verify: 2*2+2+2=8, 4*2+3*2+3*2=20, 8*2+7*2+9*2=48 ✓
    const A = [
      new Float64Array([2, 1, 1]),
      new Float64Array([4, 3, 3]),
      new Float64Array([8, 7, 9]),
    ]
    lu.factor(A)
    const x = new Float64Array(3)
    lu.solve(new Float64Array([8, 20, 48]), x)
    expect(x[0]).toBeCloseTo(2, 5)
    expect(x[1]).toBeCloseTo(2, 5)
    expect(x[2]).toBeCloseTo(2, 5)
  })
})
