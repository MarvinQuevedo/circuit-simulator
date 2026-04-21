import { solveLinearSystem } from './src/core/Solver.js';

const G_wire = 1e4; // 0.1 mOhm
const A = [
  [G_wire + 1, -G_wire],   // Node 1: connected to 9V source (implicit in Z) and wire to 2. and 1 ohm resistor
  [-G_wire, G_wire + 1]    // Node 2: connected to wire from 1, and 1 ohm resistor to ground
];
// Wait, simple circuit: 9V -> Node 1. 
// Let's just mock a matrix test to see if 1e4 causes numeric instability.
