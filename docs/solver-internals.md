# Solver Internals

## Modified Nodal Analysis (MNA)

Every component stamps its contribution into a system `A·x = Z`:

- **A** — admittance/conductance matrix (`n_nodes + n_extra_vars` square)
- **Z** — known quantities (voltage/current sources, companion model history)
- **x** — unknowns: `[V_1, V_2, …, V_n, I_vs1, I_vs2, …]`

Node `0` is always ground (eliminated from the matrix). Nodes `1…n` correspond to circuit nodes. Extra variable slots follow node slots (voltage source branch currents, etc.).

### Resistor stamp (conductance G = 1/R)

```
A[n1-1][n1-1] += G
A[n2-1][n2-1] += G
A[n1-1][n2-1] -= G
A[n2-1][n1-1] -= G
```

### Voltage source stamp (branch current variable at index `k`)

```
A[n+][k] += 1     // KCL at plus node
A[n-][k] -= 1     // KCL at minus node
A[k][n+] += 1     // KVL: V+ - V- = Vs
A[k][n-] -= 1
Z[k] = Vs
```

## Companion models (transient)

Reactive elements are replaced by their Norton equivalent at each timestep.

### Backward Euler (1st order)

**Capacitor:** `G_eq = C/dt`, `I_eq = G_eq * vCap_prev`

```
A[n1][n1] += G_eq   // conductance in parallel
Z[n1]     += I_eq   // history current source
```

### Trapezoidal (2nd order, default)

**Capacitor:** `G_eq = 2C/dt`, `I_eq = G_eq * vCap_prev + i_cap_prev`

More accurate (2nd-order phase error vs 1st-order). Can ring on stiff circuits — fall back to Backward Euler if needed via `createSession(..., {integrator:'backward-euler'})`.

### Inductor companion

**Backward Euler:** `G_eq = dt/L`, `V_eq = -i_L_prev * (L/dt)` (Thévenin form)  
**Trapezoidal:** `G_eq = dt/(2L)`, `V_eq = -(G_eq*v_L_prev + i_L_prev)`

## Topology build (`TopologyBuilder.js`)

1. Assign an integer node to each pin.
2. Merge nodes connected by wires (union-find style — simple iteration).
3. Merge all GROUND component pins into node 0.
4. Renumber non-ground nodes as `1…n`.
5. Allocate extra variable slots for voltage sources (1 each), regulators (1 each).
6. Return `resolvedNodeMap: pinId → MNA index (0 = ground)`.

Wire conductance: wires are stamped as `G_wire = 1e3 S` (1 mΩ) in the matrix. This is the "short wire" approximation — physically accurate for PCB traces.

## Newton-Raphson (`Newton.js`)

For nonlinear circuits (BJTs, diodes), solve iteratively:

1. Stamp current linearisation into A, Z using current X.
2. Factor A (LU) and solve into x_new.
3. Check `max|Δx| < absTol` AND `max|Δx/(|x|+vAbs)| < relTol`.
4. Copy x_new → X. Repeat.

**Linear shortcut:** if every component reports `isLinear()=true`, skip after 1 iteration. Resistors, capacitors, linear voltage sources are all linear. BJTs and diodes return `false`.

## DC operating point (`DCOperatingPoint.js`)

Primes the solution vector X before transient begins:

1. Source stepping: scale sources by α ∈ {0.1, 0.25, 0.5, 0.75, 1.0}.
2. At each α, run Newton with previous solution as warm start.
3. Capacitors → open circuit (`G = 1e-12 S`), inductors → short (`G_eq = dt/L`).
4. Final X at α=1 is the DC bias. Capacitor `vCap` is initialised from the DC node voltage.

If convergence fails at any α step, the solver continues with its best estimate and logs a warning. Fall-back: `X = 0` (all voltages zero).

## LU decomposition (`LUDecomposition.js`)

- Doolittle factorisation with partial pivoting (row swap at each column for numerical stability).
- Accepts array-of-Float64Array (dense rows, compatible with `A[r][c] +=` in models).
- `factor(A)` stores L (below diagonal) and U (diagonal + above) in `_lu`, permutation in `_piv`.
- `solve(b, xOut)` applies permutation + forward/back substitution in-place.
- Near-zero pivot (`< 1e-12`) → marks `_valid = false`, sets that solution row to 0 (floating node convention).

LU is refactored once per Newton iteration. For fully linear circuits this is once per time step.
