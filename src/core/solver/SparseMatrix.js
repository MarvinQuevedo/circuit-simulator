/**
 * SparseMatrix.js — CSR sparse matrix with two-phase build/stamp API.
 *
 * Phase 1: Use SparseMatrixBuilder to declare all nonzero slot positions.
 * Phase 2: Call build() once to get a fixed-structure SparseMatrix.
 *          Then call zero() + stamp() each Newton iteration without any allocation.
 */

export class SparseMatrixBuilder {
  constructor(size) {
    this.size = size;
    // Use a Set per row to collect unique (row,col) pairs
    this._slots = new Array(size);
    for (let i = 0; i < size; i++) this._slots[i] = new Set();
  }

  /**
   * Reserve a nonzero slot at (row, col).
   * Can be called multiple times for the same slot — idempotent.
   */
  add(row, col) {
    if (row < 0 || row >= this.size || col < 0 || col >= this.size) return;
    this._slots[row].add(col);
  }

  /**
   * Build a fixed-structure SparseMatrix from the declared slots.
   * After this, no new slots can be added.
   */
  build() {
    const n = this.size;
    const rowPtr = new Int32Array(n + 1);
    let nnz = 0;
    for (let i = 0; i < n; i++) {
      nnz += this._slots[i].size;
    }
    const colIdx = new Int32Array(nnz);
    const data = new Float64Array(nnz);

    let ptr = 0;
    for (let i = 0; i < n; i++) {
      rowPtr[i] = ptr;
      // Sort columns for deterministic order
      const sortedCols = Array.from(this._slots[i]).sort((a, b) => a - b);
      for (const col of sortedCols) {
        colIdx[ptr] = col;
        ptr++;
      }
    }
    rowPtr[n] = ptr;

    return new SparseMatrix(n, rowPtr, colIdx, data);
  }
}

export class SparseMatrix {
  constructor(size, rowPtr, colIdx, data) {
    this.size = size;
    this.rowPtr = rowPtr;   // Int32Array, length n+1
    this.colIdx = colIdx;   // Int32Array, length nnz
    this.data = data;       // Float64Array, length nnz
  }

  /** Reset all values to zero (keeps structure). O(nnz). */
  zero() {
    this.data.fill(0);
  }

  /**
   * Add `value` to slot (row, col).
   * Asserts the slot was declared. If missing, logs a warning and ignores.
   */
  stamp(row, col, value) {
    const start = this.rowPtr[row];
    const end = this.rowPtr[row + 1];
    // Binary search for col in colIdx[start..end)
    let lo = start, hi = end - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const c = this.colIdx[mid];
      if (c === col) {
        this.data[mid] += value;
        return;
      }
      if (c < col) lo = mid + 1;
      else hi = mid - 1;
    }
    // Slot not found — this is a programming error during topology build.
    console.warn(`SparseMatrix: stamp(${row}, ${col}) called but slot not declared. Value ignored.`);
  }

  /**
   * Read value at (row, col). Returns 0 if slot not declared.
   */
  get(row, col) {
    const start = this.rowPtr[row];
    const end = this.rowPtr[row + 1];
    let lo = start, hi = end - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const c = this.colIdx[mid];
      if (c === col) return this.data[mid];
      if (c < col) lo = mid + 1;
      else hi = mid - 1;
    }
    return 0;
  }

  /**
   * Iterate over nonzero slots in a row.
   * @yields {{ col: number, value: number }}
   */
  *rowView(row) {
    const start = this.rowPtr[row];
    const end = this.rowPtr[row + 1];
    for (let i = start; i < end; i++) {
      yield { col: this.colIdx[i], value: this.data[i] };
    }
  }

  /**
   * Copy this sparse matrix into a dense Float64Array (row-major) for LU.
   * denseOut must be pre-allocated: Float64Array(size * size)
   */
  toDense(denseOut) {
    const n = this.size;
    denseOut.fill(0);
    for (let i = 0; i < n; i++) {
      const start = this.rowPtr[i];
      const end = this.rowPtr[i + 1];
      for (let p = start; p < end; p++) {
        denseOut[i * n + this.colIdx[p]] = this.data[p];
      }
    }
  }
}
