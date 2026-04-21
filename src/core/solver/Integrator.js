/**
 * Integrator.js — Companion model strategies for transient analysis.
 *
 * Each strategy provides companionCapacitor(C, vPrev, iPrev, dt) and
 * companionInductor(L, vPrev, iPrev, dt), returning { Geq, Ieq } or { Geq, Veq }.
 *
 * Default: Trapezoidal (more accurate, less phase error than Backward Euler).
 * Note: Trapezoidal can ring on stiff circuits. Gear-2 / BDF is a TODO for Phase 3.
 */

export const BackwardEuler = {
  name: 'backward-euler',

  /**
   * Capacitor companion: G_eq = C/dt, I_eq = G_eq * vCap_prev
   * Norton equivalent: current source I_eq in parallel with conductance G_eq.
   */
  companionCapacitor(C, vPrev, iPrev, dt) {
    const Geq = C / dt;
    return { Geq, Ieq: Geq * vPrev };
  },

  /**
   * Inductor companion: G_eq = dt/L, V_eq = -iPrev * (L/dt)
   * Thevenin equivalent: voltage source V_eq in series with conductance G_eq.
   * TODO: Inductor model not yet used; placeholder for Phase 2.
   */
  companionInductor(L, vPrev, iPrev, dt) {
    return { Geq: dt / L, Veq: -iPrev * (L / dt) };
  },
};

export const Trapezoidal = {
  name: 'trapezoidal',

  /**
   * Capacitor companion (Trapezoidal / bilinear transform):
   *   G_eq = 2C/dt
   *   I_eq = G_eq * vCap_prev + iPrev
   * More accurate than Backward Euler (2nd order vs 1st order).
   * Can ring on stiff circuits — if that occurs, fall back to BackwardEuler.
   */
  companionCapacitor(C, vPrev, iPrev, dt) {
    const Geq = 2 * C / dt;
    return { Geq, Ieq: Geq * vPrev + iPrev };
  },

  /**
   * Inductor companion (Trapezoidal):
   *   G_eq = dt/(2L)
   *   V_eq = -(G_eq * vPrev + iPrev)  [sign convention: textbook Pillage eq 5.14]
   * TODO: Inductor model not yet used; placeholder for Phase 2.
   */
  companionInductor(L, vPrev, iPrev, dt) {
    const Geq = dt / (2 * L);
    return { Geq, Veq: -(Geq * vPrev + iPrev) };
  },
};

/**
 * Resolve an integrator strategy from a string name or object.
 * @param {'trapezoidal'|'backward-euler'|object} nameOrObj
 * @returns {BackwardEuler|Trapezoidal}
 */
export function resolveIntegrator(nameOrObj) {
  if (typeof nameOrObj === 'object' && nameOrObj !== null) return nameOrObj;
  if (nameOrObj === 'backward-euler') return BackwardEuler;
  return Trapezoidal; // default
}

// Module-level session integrator — set by createSession, read by models.
// Avoids circular imports between solver/index.js and models/Reactive.jsx.
let _sessionIntegrator = BackwardEuler;

export function setSessionIntegrator(integ) {
  _sessionIntegrator = typeof integ === 'string' ? resolveIntegrator(integ) : integ;
}

export function getSessionIntegrator() {
  return _sessionIntegrator;
}
