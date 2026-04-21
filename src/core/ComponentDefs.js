import { registry } from './ComponentRegistry';
import { ResistorModel, SwitchModel, PushbuttonModel, BulbModel } from './models/ResistorBased.jsx';
import { DcVoltageSourceModel, AcVoltageSourceModel, GroundModel } from './models/Sources.jsx';
import { DiodeModel, LedModel } from './models/Semiconductors.jsx';
import { CapacitorModel, NpnTransistorModel, PnpTransistorModel } from './models/Reactive.jsx';
import { 
  AndGateModel, OrGateModel, NotGateModel, XorGateModel, NandGateModel, NorGateModel,
  SevenSegmentDisplayModel, DecoderBCD7SegModel, Counter4BitModel, ShiftRegister8BitModel, ClockSourceModel 
} from './models/Digital.jsx';
import { VoltageRegulatorModel } from './models/Power.jsx';

// Register core models
registry.register(new ResistorModel());
registry.register(new SwitchModel());
registry.register(new PushbuttonModel());
registry.register(new BulbModel());
registry.register(new DcVoltageSourceModel());
registry.register(new AcVoltageSourceModel());
registry.register(new GroundModel());
registry.register(new DiodeModel());
registry.register(new LedModel());
registry.register(new CapacitorModel());
registry.register(new NpnTransistorModel());
registry.register(new PnpTransistorModel());
registry.register(new VoltageRegulatorModel());

// Register digital models
registry.register(new AndGateModel());
registry.register(new OrGateModel());
registry.register(new NotGateModel());
registry.register(new XorGateModel());
registry.register(new NandGateModel());
registry.register(new NorGateModel());
registry.register(new SevenSegmentDisplayModel());
registry.register(new DecoderBCD7SegModel());
registry.register(new Counter4BitModel());
registry.register(new ShiftRegister8BitModel());
registry.register(new ClockSourceModel());

// Export types dynamically for backwards compatibility
export const COMPONENT_TYPES = {};
export const COMPONENT_DEFINITIONS = {};

registry.getAll().forEach(model => {
  COMPONENT_TYPES[model.type] = model.type;
  
  // Maintain backward compatibility shape for the Reducer/ComponentDef factory
  COMPONENT_DEFINITIONS[model.type] = {
    type: model.type,
    label: model.label,
    category: model.category,
    numPins: model.numPins,
    defaultProperties: model.defaultProperties,
    propertyLabels: model.propertyLabels,
    propertyMeta: model.propertyMeta,
    color: model.color,
  };
});

// Provide a global way to get the registry if needed
export { registry };

export function createComponent(type, x, y) {
  const def = registry.get(type);
  if (!def) throw new Error(`Unknown component type: ${type}`);

  // Pin layout helper — handles 1, 2, and 3-pin components
  const buildPins = (numPins) => {
    // If the model defines custom pin positions, use them
    if (def.pinPositions) {
        return def.pinPositions.map((pos, i) => ({
            id: `pin_${Date.now()}_${Math.random() * 1e6 | 0}_${i}`,
            index: i,
            offsetX: pos.offsetX,
            offsetY: pos.offsetY,
            label: pos.label
        }));
    }

    if (numPins === 1) {
      return [{ id: `pin_${Date.now()}_${Math.random() * 1e6 | 0}_0`, index: 0, offsetX: 0, offsetY: 0 }];
    }
    if (numPins === 2) {
      return [0, 1].map(i => ({
        id: `pin_${Date.now()}_${Math.random() * 1e6 | 0}_${i}`,
        index: i,
        offsetX: i === 0 ? -30 : 30,
        offsetY: 0
      }));
    }
    if (numPins === 3) {
      // Transistor layout: Base(-30,0), Collector(30,-24), Emitter(30,24)
      const positions = [
        { offsetX: -30, offsetY:  0  }, // 0 = Base
        { offsetX:  30, offsetY: -24 }, // 1 = Collector
        { offsetX:  30, offsetY:  24 }, // 2 = Emitter
      ];
      return positions.map((pos, i) => ({
        id: `pin_${Date.now()}_${Math.random() * 1e6 | 0}_${i}`,
        index: i,
        ...pos
      }));
    }
    // Generic fallback
    return Array.from({ length: numPins }).map((_, i) => ({
      id: `pin_${Date.now()}_${Math.random() * 1e6 | 0}_${i}`,
      index: i,
      offsetX: i === 0 ? -30 : 30,
      offsetY: 0
    }));
  };

  return {
    id: `comp_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    type,
    x,
    y,
    rotation: 0,
    properties: { ...def.defaultProperties },
    pins: buildPins(def.numPins)
  };
}

export function createWire(startPinId, endPinId) {
  return {
    id: `wire_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    startPinId,
    endPinId,
    path: [] 
  };
}

