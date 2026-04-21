import React, { useReducer, useEffect, useState, useRef } from 'react';
import './App.css';
import { circuitReducer, initialState } from './store/circuitReducer';
import { createComponent, registry } from './core/ComponentDefs';
import { simulateCircuit } from './core/Solver';
import Sidebar from './components/Sidebar';
import Canvas from './components/Canvas';
import ComponentNode from './components/ComponentNode';
import WireNode from './components/WireNode';
import PropertiesPanel from './components/PropertiesPanel';
import ExamplesGallery from './components/ExamplesGallery';
import DebugPanel from './components/DebugPanel';

function App() {
  const [state, dispatch] = useReducer(circuitReducer, initialState);
  const [showExamples, setShowExamples] = useState(false);
  const [showDebugger, setShowDebugger] = useState(false);
  const [watchedPins, setWatchedPins] = useState([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const debugHistoryRef = useRef([]);
  const simTimeRef = useRef(0);
  const simResultsRef = useRef({ nodeVoltages: {}, branchCurrents: {} });
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Expose API for console debugging
  useEffect(() => {
    window.simulator = {
      state: state,
      dispatch: dispatch,
      toggle: (idOrType) => {
        const comp = state.components.find(c => c.id === idOrType || c.type === idOrType);
        if (comp) dispatch({ type: 'TOGGLE_SWITCH', payload: comp.id });
      },
      getVoltages: () => simResultsRef.current.nodeVoltages,
      getComponents: () => state.components,
      help: () => {
        console.log("%cCircuit Simulator API", "color: #60a5fa; font-weight: bold; font-size: 1.2rem;");
        console.log("Usage:");
        console.log("  simulator.toggle('sw_a')   - Toggle switch by ID or type");
        console.log("  simulator.getVoltages()    - Get all node voltages");
        console.log("  simulator.logDigital()     - Print logic levels of all digital components");
        console.log("  simulator.state            - Full internal state");
      },
      logDigital: () => {
        const digital = state.components.filter(c => c.category === 'Digital' || c.type.includes('GATE'));
        console.table(digital.map(c => ({
          ID: c.id,
          Type: c.type,
          State: registry.get(c.type)?.getDebugState(c, simResultsRef.current.nodeVoltages) || 'N/A'
        })));
      },
      inspect: (id) => {
        const comp = state.components.find(c => c.id === id);
        if (!comp) return console.error("Component not found");
        console.log(`%cInspecting ${comp.type} [${comp.id}]`, "color: #fbbf24; font-weight: bold;");
        console.dir(comp);
        console.log("Current Voltages:", comp.pins.map(p => ({ Pin: p.label || p.index, V: simResultsRef.current.nodeVoltages[p.id] })));
      },
      logCounters: () => {
        const counters = state.components.filter(c => c.type === 'COUNTER_4BIT');
        console.table(counters.map(c => ({
          ID: c.id,
          Count: c.properties.count,
          CLK: simResultsRef.current.nodeVoltages[c.pins[0].id]?.toFixed(2) + 'V',
          OVF: simResultsRef.current.nodeVoltages[c.pins[7].id]?.toFixed(2) + 'V',
        })));
      }
    };
  }, [state, dispatch]);

  useEffect(() => {
    simResultsRef.current = state.simulationResults;
  }, [state.simulationResults]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeElement = document.activeElement;
      const currentState = stateRef.current;

      // Do not handle keydown if user is typing in an input
      if (activeElement && activeElement.tagName === 'INPUT') return;

      const isZ = e.key.toLowerCase() === 'z';
      const isY = e.key.toLowerCase() === 'y';
      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && isZ) {
        e.preventDefault();
        if (e.shiftKey) dispatch({ type: 'REDO' });
        else dispatch({ type: 'UNDO' });
        return;
      }

      if (isCtrl && isY) {
        e.preventDefault();
        dispatch({ type: 'REDO' });
        return;
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && currentState.selectedElementId) {
        e.preventDefault();
        dispatch({ type: 'REMOVE_ELEMENT', payload: currentState.selectedElementId });
      } else if ((e.key === 'r' || e.key === 'R') && currentState.selectedElementId) {
        e.preventDefault();
        dispatch({ type: 'ROTATE_COMPONENT', payload: currentState.selectedElementId });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // No deps needed with stateRef

  // Reset debug history when simulation starts/stops
  // Also auto-probe interesting pins if nothing is selected
  useEffect(() => {
    if (state.isSimulating) {
      simTimeRef.current = 0;
      debugHistoryRef.current = [];
      
      const savedProbes = JSON.parse(localStorage.getItem('debug_watched_pins') || '[]');
      if (watchedPins.length === 0 && savedProbes.length > 0) {
        // Validation: Only load probes that exist in current project
        const validIds = new Set(state.components.flatMap(c => c.pins.map(p => p.id)));
        const filtered = savedProbes.filter(id => validIds.has(id));
        if (filtered.length > 0) setWatchedPins(filtered);
      } else if (watchedPins.length === 0 && state.components.length > 0) {
        // Smart Auto-Probe: Target the Input and the Final Load
        const source = state.components.find(c => c.type === 'AC_VOLTAGE_SOURCE' || c.type === 'DC_VOLTAGE_SOURCE');
        const resistor = state.components.find(c => c.type === 'RESISTOR');
        const otherLoad = state.components.find(c => c.type === 'LED' || c.type === 'CAPACITOR');
        
        const autoProbes = [];
        // 1. Monitor the Source Output (Usually Pin B / index 1)
        if (source && source.pins[1]) autoProbes.push(source.pins[1].id);
        
        // 2. Monitor the Final Load (Usually Pin A / index 0)
        const load = resistor || otherLoad;
        if (load && load.pins[0]) {
          // Only add if it's not the same node (avoiding ground or source output)
          if (!autoProbes.includes(load.pins[0].id)) {
            autoProbes.push(load.pins[0].id);
          }
        }
        
        if (autoProbes.length > 0) setWatchedPins(autoProbes);
      }
    }
  }, [state.isSimulating, state.components.length]);

  // Persist watched pins
  useEffect(() => {
    if (watchedPins.length > 0) {
      localStorage.setItem('debug_watched_pins', JSON.stringify(watchedPins));
    }
  }, [watchedPins]);

  const componentsRef = useRef(state.components);
  const wiresRef = useRef(state.wires);
  const enableDamageRef = useRef(state.enableDamage);

  useEffect(() => {
    componentsRef.current = state.components;
    wiresRef.current = state.wires;
    enableDamageRef.current = state.enableDamage;
  }, [state.components, state.wires, state.enableDamage]);

  useEffect(() => {
    if (!state.isSimulating) {
      dispatch({ type: 'SET_SIMULATION_RESULTS', payload: { nodeVoltages: {}, branchCurrents: {} } });
      return;
    }

    let frameId;
    const dt = 0.002; // 2ms steps for better transient stability
    const subSteps = 10; // 10 steps per frame = 20ms sim per frame

    const tick = () => {
      try {
        let currentResults = null;
        let newlyDamagedIds = [];
        let cumulativeUpdates = {};
        // Transient state to track property changes across sub-steps within a single frame
        let transientPropsMap = new Map();

        // Use current refs to get the latest state
        const originalComponents = componentsRef.current;
        const wires = wiresRef.current;

        for (let i = 0; i < subSteps; i++) {
          // Create a virtual view of components with updates from previous sub-steps applied
          const currentComponents = originalComponents.map(c => ({
            ...c,
            properties: transientPropsMap.has(c.id) 
              ? { ...c.properties, ...transientPropsMap.get(c.id) } 
              : c.properties
          }));

          const results = simulateCircuit(currentComponents, wires, dt);
          currentResults = results;
          
          if (results.updatedComponentProperties) {
            for (const [id, props] of Object.entries(results.updatedComponentProperties)) {
              const existing = transientPropsMap.get(id) || {};
              const merged = { ...existing, ...props };
              transientPropsMap.set(id, merged);
              cumulativeUpdates[id] = merged;
            }
          }

          if (enableDamageRef.current) {
            currentComponents.forEach(comp => {
              if (comp.properties.damaged || newlyDamagedIds.some(d => d.id === comp.id)) return;
              const model = registry.get(comp.type);
              if (model && model.checkDamage) {
                const current = Math.abs(results.branchCurrents[comp.id] || 0);
                const vA = results.nodeVoltages[comp.pins[0]?.id] || 0;
                const vB = results.nodeVoltages[comp.pins[1]?.id] || 0;
                const reason = model.checkDamage(comp, current, vA - vB);
                if (reason) newlyDamagedIds.push({ id: comp.id, reason });
              }
            });
          }
          
          if (newlyDamagedIds.length > 0) break;
        }
        
        if (newlyDamagedIds.length > 0) {
          dispatch({ type: 'APPLY_DAMAGE', payload: newlyDamagedIds });
          return;
        }

        if (currentResults) {
          simTimeRef.current += subSteps * dt;
          const history = debugHistoryRef.current;
          history.push({ time: simTimeRef.current, nodeVoltages: { ...currentResults.nodeVoltages } });
          if (history.length > 800) history.splice(0, history.length - 800);

          // Use cumulative updates so no state change is lost between frames
          const finalResults = { 
            ...currentResults, 
            updatedComponentProperties: cumulativeUpdates 
          };
          dispatch({ type: 'SIMULATION_TICK', payload: { results: finalResults } });
        }
      } catch (err) {
        console.error("Simulation error", err);
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [state.isSimulating]);

  const handleTogglePin = (pinId) => {
    if (!pinId) return;
    setWatchedPins(prev =>
      prev.includes(pinId) ? prev.filter(p => p !== pinId) : [...prev.slice(-5), pinId]
    );
  };

  const handleSave = () => {
    const data = JSON.stringify({ components: state.components, wires: state.wires });
    localStorage.setItem('circuit-backup', data);
    alert('Circuit saved successfully!');
  };

  const handleLoad = () => {
    const data = localStorage.getItem('circuit-backup');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        dispatch({ type: 'LOAD_CIRCUIT', payload: parsed });
        setWatchedPins([]);
        localStorage.removeItem('debug_watched_pins');
      } catch (e) {
        alert('Failed to load circuit.');
      }
    } else {
      alert('No saved circuit found.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (state.isSimulating) {
      alert("Cannot add components while simulation is running.");
      return;
    }
    const type = e.dataTransfer.getData('componentType');
    if (type) {
      const canvasContainer = document.querySelector('.canvas-container');
      const canvasRect = canvasContainer.getBoundingClientRect();
      const x = Math.round((e.clientX - canvasRect.left) / 20) * 20;
      const y = Math.round((e.clientY - canvasRect.top) / 20) * 20;
      const newComponent = createComponent(type, x, y);
      dispatch({ type: 'ADD_COMPONENT', payload: newComponent });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  return (
    <div className="app-container" onDrop={handleDrop} onDragOver={handleDragOver}>
      <div className="top-bar glass-panel">
        <h1 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button className="tb-btn mobile-only" onClick={() => setMobileSidebarOpen(true)} style={{ padding: '8px' }}>☰</button>
          <span style={{color: 'var(--accent-color)'}}>⚡</span> <span className="logo-text">Circuit Simulator</span>
        </h1>

        {/* Desktop Only Actions */}
        <div className="desktop-actions" style={{ display: 'flex', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <input 
              type="checkbox" 
              checked={state.enableDamage} 
              onChange={() => dispatch({ type: 'TOGGLE_DAMAGE' })} 
            />
            Damage Physics
          </label>
          <button 
            className="tb-btn" 
            onClick={() => dispatch({ type: 'TOGGLE_VIZ_MODE' })}
            style={{ minWidth: '100px', background: state.vizMode === 'analog' ? 'rgba(96,165,250,0.1)' : 'transparent' }}
          >
            {state.vizMode === 'analog' ? '📈 Analog Mode' : '🔢 Digital Mode'}
          </button>
          <button className="tb-btn" onClick={() => setShowExamples(true)}>🔬 Examples</button>
          <button
            className="tb-btn"
            style={showDebugger ? { borderColor: 'rgba(96,165,250,0.5)', color: '#60a5fa' } : {}}
            onClick={() => setShowDebugger(d => !d)}
          >
            {showDebugger ? '⚙ Debugger ON' : '⚙ Debugger'}
          </button>
          <button className="tb-btn" onClick={handleSave}>Save</button>
          <button className="tb-btn" onClick={handleLoad}>Load</button>
          <button className="tb-btn sim-btn" onClick={() => dispatch({ type: 'TOGGLE_SIMULATION' })}>
            {state.isSimulating ? 'Stop Simulation' : 'Start Simulation'}
            {state.isSimulating ? <span className="pulse-dot"></span> : null}
          </button>
        </div>

        {/* Mobile Only Actions Toggle */}
        <button className="tb-btn mobile-only" onClick={() => setShowActionSheet(true)} style={{ padding: '8px' }}>⚙️</button>
      </div>
      <div className="main-content">
        <Sidebar 
          isOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          onAddComponent={(type) => {
            if (state.isSimulating) {
               alert("Cannot add components while simulation is running.");
               return;
            }
            const newComponent = createComponent(type, 400, 300);
            dispatch({ type: 'ADD_COMPONENT', payload: newComponent });
            dispatch({ type: 'SET_SELECTED', payload: newComponent.id });
            setMobileSidebarOpen(false); // Close drawer on mobile after adding
          }} 
        />
        <Canvas 
          components={state.components}
          wires={state.wires}
          dispatch={dispatch}
          selectedElementId={state.selectedElementId}
          isSimulating={state.isSimulating}
          renderComponent={(comp, wiringHandlers, zoom) => (
            <ComponentNode 
              key={comp.id}
              component={comp}
              isSelected={state.selectedElementId === comp.id}
              onSelect={(id) => dispatch({ type: 'SET_SELECTED', payload: id })}
              onMove={(id, x, y) => dispatch({ type: 'MOVE_COMPONENT', payload: { id, x, y } })}
              onMoveEnd={() => dispatch({ type: 'COMMIT_HISTORY' })}
              onRotate={(id) => dispatch({ type: 'ROTATE_COMPONENT', payload: id })}
              onInteract={(id) => dispatch({ type: 'TOGGLE_SWITCH', payload: id })}
              onPress={(id) => dispatch({ type: 'SET_SWITCH_STATE', payload: { id, closed: true } })}
              onRelease={(id) => dispatch({ type: 'SET_SWITCH_STATE', payload: { id, closed: false } })}
              wiringHandlers={wiringHandlers}
              simulationCurrent={state.simulationResults.branchCurrents[comp.id] || 0}
              isSimulating={state.isSimulating}
              zoom={zoom}
              showProbes={showDebugger}
              vizMode={state.vizMode}
              nodeVoltages={state.simulationResults.nodeVoltages}
            />
          )}
          renderWire={(wire, zoom) => (
            <WireNode 
              key={wire.id}
              wire={wire}
              components={state.components}
              isSelected={state.selectedElementId === wire.id}
              onSelect={(id) => dispatch({ type: 'SET_SELECTED', payload: id })}
              simulationCurrent={state.simulationResults.branchCurrents[wire.id] || 0}
              isSimulating={state.isSimulating}
              dispatch={dispatch}
              zoom={zoom}
            />
          )}
        />
        {state.selectedElementId && (
          <PropertiesPanel
            elementId={state.selectedElementId}
            components={state.components}
            wires={state.wires}
            dispatch={dispatch}
          />
        )}

        {showDebugger && (
          <DebugPanel
            components={state.components}
            nodeVoltages={state.simulationResults.nodeVoltages}
            branchCurrents={state.simulationResults.branchCurrents}
            historyRef={debugHistoryRef}
            watchedPins={watchedPins}
            onTogglePin={handleTogglePin}
            simTime={simTimeRef.current}
          />
        )}
      </div>

      {showExamples && (
        <ExamplesGallery
          onLoad={(circuit) => {
            dispatch({ type: 'LOAD_CIRCUIT', payload: circuit });
            setWatchedPins([]);
            localStorage.removeItem('debug_watched_pins');
            setShowExamples(false);
          }}
          onClose={() => setShowExamples(false)}
        />
      )}

      {/* Mobile Action Sheet */}
      {showActionSheet && <div className="action-sheet-overlay" onClick={() => setShowActionSheet(false)} />}
      <div className={`mobile-action-sheet ${showActionSheet ? 'open' : ''}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontWeight: 'bold' }}>Simulation Actions</span>
          <button onClick={() => setShowActionSheet(false)} style={{ background: 'transparent', border: 'none', color: '#64748b' }}>×</button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button className="tb-btn" onClick={() => { dispatch({ type: 'UNDO' }); setShowActionSheet(false); }}>↩️ Deshacer</button>
          <button className="tb-btn" onClick={() => { dispatch({ type: 'REDO' }); setShowActionSheet(false); }}>↪️ Rehacer</button>
        </div>

        <button className="tb-btn sim-btn" onClick={() => { dispatch({ type: 'TOGGLE_SIMULATION' }); setShowActionSheet(false); }}>
            {state.isSimulating ? 'Stop Simulation' : 'Start Simulation'}
        </button>

        <button className="tb-btn" onClick={() => { setShowDebugger(d => !d); setShowActionSheet(false); }}>
            {showDebugger ? '⚙ Disable Probes' : '⚙ Enable Probes'}
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button className="tb-btn" onClick={() => { setShowExamples(true); setShowActionSheet(false); }}>🔬 Examples</button>
          <button className="tb-btn" onClick={() => { dispatch({ type: 'TOGGLE_VIZ_MODE' }); setShowActionSheet(false); }}>
            {state.vizMode === 'analog' ? '📈 Analog' : '🔢 Digital'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <button className="tb-btn" onClick={() => { handleSave(); setShowActionSheet(false); }}>💾 Save</button>
          <button className="tb-btn" onClick={() => { handleLoad(); setShowActionSheet(false); }}>📁 Load</button>
        </div>
        
        <label style={{ display: 'flex', padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', alignItems: 'center', gap: '10px', fontSize: '0.9rem' }}>
          <input type="checkbox" checked={state.enableDamage} onChange={() => dispatch({ type: 'TOGGLE_DAMAGE' })} />
          Enable Damage Physics
        </label>
      </div>

      {/* Mobile Floating Action Button */}
      <button className="mobile-fab mobile-only" onClick={() => setMobileSidebarOpen(true)}>
        +
      </button>
    </div>
  );
}

export default App;
