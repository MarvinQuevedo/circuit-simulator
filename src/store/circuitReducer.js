// Actions that should trigger a history snapshot
const undoableActions = [
  'ADD_COMPONENT', 'REMOVE_ELEMENT', 'ADD_WIRE', 
  'ROTATE_COMPONENT', 'CLEAR_CIRCUIT', 'LOAD_CIRCUIT', 
  'SET_SWITCH_STATE', 'TOGGLE_SWITCH', 'APPLY_DAMAGE', 
  'REPAIR_COMPONENT', 'COMMIT_HISTORY'
];

export const initialState = {
  components: [],
  wires: [],
  selectedElementId: null,
  isSimulating: false,
  enableDamage: false,
  undoStack: [],
  redoStack: [],
  simulationResults: {
    nodeVoltages: {}, // pinId -> voltage
    branchCurrents: {} // compId -> current
  },
  vizMode: 'digital' // 'digital' or 'analog'
};

function saveHistory(state) {
  const { undoStack, redoStack, simulationResults, ...cleanState } = state;
  // Deep clone components to ensure history isn't mutated by future updates
  return {
    ...cleanState,
    components: JSON.parse(JSON.stringify(cleanState.components)),
    wires: JSON.parse(JSON.stringify(cleanState.wires))
  };
}

export function circuitReducer(state, action) {
  // Handle History First
  if (action.type === 'UNDO') {
    if (state.undoStack.length === 0) return state;
    const previous = state.undoStack[state.undoStack.length - 1];
    const newUndoStack = state.undoStack.slice(0, -1);
    return {
      ...state,
      ...previous,
      undoStack: newUndoStack,
      redoStack: [saveHistory(state), ...state.redoStack].slice(0, 50)
    };
  }

  if (action.type === 'REDO') {
    if (state.redoStack.length === 0) return state;
    const next = state.redoStack[0];
    const newRedoStack = state.redoStack.slice(1);
    return {
      ...state,
      ...next,
      undoStack: [...state.undoStack, saveHistory(state)].slice(-50),
      redoStack: newRedoStack
    };
  }

  let newState;
  switch (action.type) {
    case 'COMMIT_HISTORY':
      newState = state; // We just want to trigger the history recording at the end
      break;

    case 'ADD_COMPONENT':
      newState = {
        ...state,
        components: [...state.components, action.payload]
      };
      break;
    
    case 'REMOVE_ELEMENT': {
      const id = action.payload;
      if (state.components.some(c => c.id === id)) {
        const comp = state.components.find(c => c.id === id);
        const pinIds = comp.pins.map(p => p.id);
        newState = {
          ...state,
          components: state.components.filter(c => c.id !== id),
          wires: state.wires.filter(w => !pinIds.includes(w.startPinId) && !pinIds.includes(w.endPinId)),
          selectedElementId: state.selectedElementId === id ? null : state.selectedElementId
        };
      } else if (state.wires.some(w => w.id === id)) {
        newState = {
          ...state,
          wires: state.wires.filter(w => w.id !== id),
          selectedElementId: state.selectedElementId === id ? null : state.selectedElementId
        };
      } else {
        newState = state;
      }
      break;
    }

    case 'ADD_WIRE':
      newState = {
        ...state,
        wires: [...state.wires, action.payload]
      };
      break;

    case 'MOVE_COMPONENT':
      newState = {
        ...state,
        components: state.components.map(c => 
          c.id === action.payload.id 
            ? { ...c, x: action.payload.x, y: action.payload.y } 
            : c
        )
      };
      return newState; // Move is continuous, don't record history here

    case 'UPDATE_PROPERTY':
      newState = {
        ...state,
        components: state.components.map(c => 
          c.id === action.payload.id 
            ? { ...c, properties: { ...c.properties, [action.payload.key]: action.payload.value } } 
            : c
        )
      };
      return newState; // Typing is continuous, don't record history here

    case 'UPDATE_PROPERTIES_BATCH':
      newState = {
        ...state,
        components: state.components.map(c =>
          c.id === action.payload.id
            ? { ...c, properties: { ...c.properties, ...action.payload.updates } }
            : c
        )
      };
      break;

    case 'ROTATE_COMPONENT':
      newState = {
        ...state,
        components: state.components.map(c => 
          c.id === action.payload 
            ? { ...c, rotation: (c.rotation + 90) % 360 } 
            : c
        )
      };
      break;

    case 'TOGGLE_SWITCH':
      newState = {
        ...state,
        components: state.components.map(c => 
          c.id === action.payload && (c.type === 'SWITCH' || c.type === 'PUSH_BUTTON')
            ? { ...c, properties: { ...c.properties, closed: !c.properties.closed } } 
            : c
        )
      };
      break;

    case 'SET_SIMULATION_RESULTS':
      return { ...state, simulationResults: action.payload };

    case 'TOGGLE_SIMULATION':
      newState = { 
        ...state, 
        isSimulating: !state.isSimulating,
        components: state.components.map(c => 
          c.properties && c.properties.damaged
            ? { ...c, properties: { ...c.properties, damaged: false, damageReason: undefined } }
            : c
        )
      };
      break;

    case 'SET_SELECTED':
      return { ...state, selectedElementId: action.payload };

    case 'TOGGLE_VIZ_MODE':
      return { ...state, vizMode: state.vizMode === 'digital' ? 'analog' : 'digital' };

    case 'APPLY_DAMAGE':
      newState = {
        ...state,
        components: state.components.map(c => {
          const damageInfo = action.payload.find(d => d.id === c.id);
          if (damageInfo) {
            return { 
              ...c, 
              properties: { ...c.properties, damaged: true, damageReason: damageInfo.reason } 
            };
          }
          return c;
        })
      };
      break;

    case 'LOAD_CIRCUIT':
      newState = { ...initialState, ...action.payload, undoStack: [], redoStack: [] };
      break;

    case 'CLEAR_CIRCUIT':
      newState = { ...initialState };
      break;

    case 'SIMULATION_TICK': {
      const { results } = action.payload;
      const updates = results.updatedComponentProperties || {};
      return {
        ...state,
        simulationResults: results,
        components: state.components.map(c =>
          updates[c.id]
            ? { ...c, properties: { ...c.properties, ...updates[c.id] } }
            : c
        )
      };
    }

    default:
      return state;
  }

  // Record History if action is undoable
  if (undoableActions.includes(action.type)) {
    return {
      ...newState,
      undoStack: [...state.undoStack, saveHistory(state)].slice(-50),
      redoStack: []
    };
  }

  return newState;
}
