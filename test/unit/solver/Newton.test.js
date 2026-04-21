import { describe, it, expect, vi } from 'vitest'
import { runNewton } from '../../../src/core/solver/Newton.js'

describe('runNewton', () => {
  it('converges in 1 iteration for a linear system (allLinear=true)', () => {
    const n = 2
    let stampCalls = 0
    const X = new Float64Array(n)

    // Linear: A = [[2,0],[0,3]], Z = [4,9] → x=[2,3]
    const stampFn = () => {
      stampCalls++
      // The test doesn't need real matrix — we simulate by injecting the answer
    }
    const solveFn = (xOut) => {
      xOut[0] = 2; xOut[1] = 3
    }

    const result = runNewton(stampFn, solveFn, X, true, { maxIter: 20 })
    expect(result.converged).toBe(true)
    expect(result.iterations).toBe(1)
    expect(stampCalls).toBe(1)
  })

  it('iterates multiple times for nonlinear system', () => {
    const n = 1
    const X = new Float64Array([10]) // bad initial guess
    let iter = 0

    const stampFn = () => {}
    // Simulate a Newton step toward the root 5.0
    const solveFn = (xOut) => {
      iter++
      xOut[0] = X[0] > 5 ? X[0] - 1 : 5 // simple step toward 5
    }

    const result = runNewton(stampFn, solveFn, X, false, {
      maxIter: 20, absTol: 1e-6, relTol: 1e-4, minIter: 1,
    })
    expect(result.converged).toBe(true)
    expect(result.iterations).toBeGreaterThan(1)
    expect(X[0]).toBeCloseTo(5, 4)
  })

  it('respects maxIter and reports non-convergence', () => {
    const X = new Float64Array([0])
    const solveFn = (xOut) => { xOut[0] = X[0] + 1000 } // diverging
    const result = runNewton(() => {}, solveFn, X, false, { maxIter: 5 })
    expect(result.converged).toBe(false)
    expect(result.iterations).toBe(5)
  })
})
