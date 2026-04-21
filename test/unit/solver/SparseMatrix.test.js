import { describe, it, expect } from 'vitest'
import { SparseMatrixBuilder, SparseMatrix } from '../../../src/core/solver/SparseMatrix.js'

describe('SparseMatrixBuilder', () => {
  it('builds a matrix with declared slots', () => {
    const b = new SparseMatrixBuilder(3)
    b.add(0, 0); b.add(0, 2)
    b.add(1, 1)
    b.add(2, 0); b.add(2, 2)
    const m = b.build()
    expect(m.size).toBe(3)
    expect(m.rowPtr[0]).toBe(0)
    expect(m.rowPtr[1]).toBe(2) // row 0 has 2 entries
    expect(m.rowPtr[2]).toBe(3) // row 1 has 1 entry
    expect(m.rowPtr[3]).toBe(5) // row 2 has 2 entries
  })

  it('add() is idempotent — duplicate declarations do not create duplicate slots', () => {
    const b = new SparseMatrixBuilder(2)
    b.add(0, 0); b.add(0, 0); b.add(0, 0)
    const m = b.build()
    expect(m.rowPtr[1] - m.rowPtr[0]).toBe(1) // only 1 slot for row 0
  })
})

describe('SparseMatrix.stamp', () => {
  it('accumulates values at declared slots', () => {
    const b = new SparseMatrixBuilder(2)
    b.add(0, 0); b.add(0, 1); b.add(1, 0); b.add(1, 1)
    const m = b.build()
    m.stamp(0, 0, 4); m.stamp(0, 1, 3)
    m.stamp(1, 0, 6); m.stamp(1, 1, 3)
    expect(m.get(0, 0)).toBe(4)
    expect(m.get(0, 1)).toBe(3)
    expect(m.get(1, 0)).toBe(6)
    expect(m.get(1, 1)).toBe(3)
  })

  it('zero() resets all values to 0', () => {
    const b = new SparseMatrixBuilder(2)
    b.add(0, 0); b.add(1, 1)
    const m = b.build()
    m.stamp(0, 0, 99); m.stamp(1, 1, 77)
    m.zero()
    expect(m.get(0, 0)).toBe(0)
    expect(m.get(1, 1)).toBe(0)
  })

  it('stamp() on undeclared slot logs warning and does not throw', () => {
    const b = new SparseMatrixBuilder(2)
    b.add(0, 0)
    const m = b.build()
    expect(() => m.stamp(0, 1, 5)).not.toThrow() // no crash
    expect(m.get(0, 1)).toBe(0) // undeclared = 0
  })
})

describe('SparseMatrix.toDense', () => {
  it('copies sparse data into a flat Float64Array correctly', () => {
    const b = new SparseMatrixBuilder(2)
    b.add(0, 0); b.add(0, 1); b.add(1, 0); b.add(1, 1)
    const m = b.build()
    m.stamp(0, 0, 1); m.stamp(0, 1, 2)
    m.stamp(1, 0, 3); m.stamp(1, 1, 4)
    const dense = new Float64Array(4)
    m.toDense(dense)
    expect(Array.from(dense)).toEqual([1, 2, 3, 4])
  })
})
