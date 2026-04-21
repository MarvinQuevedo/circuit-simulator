import { solveLinearSystem, simulateCircuit } from './src/core/Solver.js';
import { registry } from './src/core/ComponentRegistry.js';
import { ResistorModel, SwitchModel, BulbModel } from './src/core/models/ResistorBased.jsx';
import { DcVoltageSourceModel, GroundModel } from './src/core/models/Sources.jsx';

registry.register(new ResistorModel());
registry.register(new SwitchModel());
registry.register(new BulbModel());
registry.register(new DcVoltageSourceModel());
registry.register(new GroundModel());

const components = [
  { id: 'c1', type: 'DC_VOLTAGE_SOURCE', pins: [{id: 'p1'}, {id: 'p2'}], properties: {voltage: 9} },
  { id: 'c2', type: 'RESISTOR', pins: [{id: 'p3'}, {id: 'p4'}], properties: {resistance: 1000} },
  { id: 'c3', type: 'GROUND', pins: [{id: 'p5'}], properties: {} }
];

const wires = [
  { id: 'w1', startPinId: 'p1', endPinId: 'p3' },
  { id: 'w2', startPinId: 'p2', endPinId: 'p5' },
  { id: 'w3', startPinId: 'p4', endPinId: 'p5' } // Actually, let's just make a loop
];

const res = simulateCircuit(components, wires);
console.log(JSON.stringify(res, null, 2));
