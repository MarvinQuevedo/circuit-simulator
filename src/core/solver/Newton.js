/**
 * Newton.js — Adaptive Newton-Raphson driver.
 *
 * For purely linear circuits (all components report isLinear() = true),
 * a single solve is sufficient. For nonlinear circuits (BJTs, diodes),
 * iterate until both absolute and relative tolerances are met.
 */

/**
 * Run Newton-Raphson iterations.
 *
 * @param {function} stampFn  — (A: SparseMatrix, Z: Float64Array) => void
 *                              Stamps the system for the current X guess.
 * @param {function} solveFn  — (A: SparseMatrix, Z: Float64Array, xOut: Float64Array) => void
 *                              Solves A·x = Z, writes result into xOut.
 * @param {Float64Array} X    — Current solution vector (mutated in-place).
 * @param {boolean} allLinear — If true, skip after 1 iteration.
 * @param {object} [options]
 * @param {number} [options.maxIter=50]
 * @param {number} [options.absTol=1e-9]    — Absolute tolerance on ΔX
 * @param {number} [options.relTol=1e-4]    — Relative tolerance on ΔX / (|X| + vAbs)
 * @param {number} [options.vAbs=1e-3]      — Voltage floor for relative tolerance
 * @param {number} [options.minIter=1]      — Minimum iterations regardless of convergence
 * @returns {{ converged: boolean, iterations: number, residual: number }}
 */
export function runNewton(stampFn, solveFn, X, allLinear, options = {}) {
  const {
    maxIter = 50,
    absTol  = 1e-9,
    relTol  = 1e-4,
    vAbs    = 1e-3,
    minIter = 1,
  } = options;

  const n = X.length;
  const xNew = new Float64Array(n);

  let converged = false;
  let iterations = 0;
  let residual = Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations++;
    stampFn(X);
    solveFn(xNew);

    // Compute convergence metrics
    let absErr = 0;
    let relErr = 0;
    let hasNaN = false;
    for (let i = 0; i < n; i++) {
      if (isNaN(xNew[i])) { hasNaN = true; break; }
      const delta = Math.abs(xNew[i] - X[i]);
      absErr = Math.max(absErr, delta);
      relErr = Math.max(relErr, delta / (Math.abs(xNew[i]) + vAbs));
    }

    // Copy new solution into X
    for (let i = 0; i < n; i++) X[i] = xNew[i];

    residual = absErr;

    if (hasNaN) {
      converged = false;
      break;
    }

    // Linear circuits converge in one pass — don't iterate more
    if (allLinear && iter >= minIter - 1) {
      converged = true;
      break;
    }

    // Check convergence tolerances
    if (iter >= minIter - 1 && absErr < absTol && relErr < relTol) {
      converged = true;
      break;
    }
  }

  return { converged, iterations, residual };
}
