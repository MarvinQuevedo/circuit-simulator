/**
 * LUDecomposition.js — LU with partial pivoting for dense n×n systems.
 *
 * Works on a dense flat Float64Array (row-major) extracted from SparseMatrix.
 * Key win: factor() is called once per timestep for linear circuits.
 *          solve() is called once per Newton iteration (just forward/back-sub).
 */

export class LUDecomposition {
  /**
   * @param {number} n — system size
   */
  constructor(n) {
    this.n = n;
    // Working copy of the matrix (LU stored in place after factoring)
    this._lu = new Float64Array(n * n);
    // Pivot permutation array
    this._piv = new Int32Array(n);
    this._valid = false;
    // Temporary for extracting sparse matrix
    this._tmp = new Float64Array(n * n);
  }

  /**
   * Factor the given SparseMatrix (or dense Float64Array) in-place.
   * After this call, this._lu holds L (below diagonal) and U (above+diag).
   * this._piv holds row-swap permutation.
   *
   * @param {SparseMatrix|Float64Array} matrix — source matrix
   */
  factor(matrix) {
    const n = this.n;
    const lu = this._lu;

    // Copy matrix into working area
    if (matrix instanceof Float64Array) {
      lu.set(matrix);
    } else if (Array.isArray(matrix)) {
      // array-of-Float64Array (dense rows): copy row by row
      for (let i = 0; i < n; i++) lu.set(matrix[i], i * n);
    } else {
      // SparseMatrix — use toDense
      matrix.toDense(lu);
    }

    const piv = this._piv;
    for (let i = 0; i < n; i++) piv[i] = i;

    this._valid = true;

    for (let k = 0; k < n; k++) {
      // Partial pivoting: find row with max |lu[r][k]|
      let maxVal = Math.abs(lu[k * n + k]);
      let maxRow = k;
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(lu[i * n + k]);
        if (v > maxVal) { maxVal = v; maxRow = i; }
      }

      // Swap rows k and maxRow in lu
      if (maxRow !== k) {
        const pivK = piv[k];
        piv[k] = piv[maxRow];
        piv[maxRow] = pivK;
        for (let j = 0; j < n; j++) {
          const tmp = lu[k * n + j];
          lu[k * n + j] = lu[maxRow * n + j];
          lu[maxRow * n + j] = tmp;
        }
      }

      const pivot = lu[k * n + k];
      if (Math.abs(pivot) < 1e-12) {
        // Near-singular — mark invalid but continue (floating node → X=0)
        this._valid = false;
        continue;
      }

      // Eliminate below
      for (let i = k + 1; i < n; i++) {
        const factor = lu[i * n + k] / pivot;
        lu[i * n + k] = factor; // store L multiplier
        for (let j = k + 1; j < n; j++) {
          lu[i * n + j] -= factor * lu[k * n + j];
        }
      }
    }
  }

  /**
   * Solve (after factor). Applies permutation, then forward/back substitution.
   * @param {Float64Array|number[]} b — RHS vector (length n)
   * @param {Float64Array} xOut — solution vector (length n), mutated in-place
   */
  solve(b, xOut) {
    const n = this.n;
    const lu = this._lu;
    const piv = this._piv;

    // Apply row permutation to b → xOut
    for (let i = 0; i < n; i++) xOut[i] = b[piv[i]];

    // Forward substitution: L * y = b (L has 1s on diagonal, stored below)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) {
        xOut[i] -= lu[i * n + j] * xOut[j];
      }
    }

    // Back substitution: U * x = y
    for (let i = n - 1; i >= 0; i--) {
      const diag = lu[i * n + i];
      if (Math.abs(diag) < 1e-12) {
        xOut[i] = 0; // floating node
        continue;
      }
      for (let j = i + 1; j < n; j++) {
        xOut[i] -= lu[i * n + j] * xOut[j];
      }
      xOut[i] /= diag;
    }
  }

  /**
   * Returns false if the last factor() encountered a near-zero pivot.
   */
  isValid() {
    return this._valid;
  }
}
