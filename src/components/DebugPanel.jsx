import React, { useState, useEffect, useRef, useCallback } from 'react';
import { registry } from '../core/ComponentDefs';

const COLORS = ['#f87171', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f472b6'];
const SCOPE_W = 500;
const MAX_HISTORY = 800;

function fmtV(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return v.toFixed(2);
}

function fmtI(i) {
  if (i === null || i === undefined || isNaN(i)) return '—';
  const ma = Math.abs(i * 1000);
  if (ma >= 1000) return `${(i).toFixed(2)}A`;
  if (ma >= 1) return `${(i * 1000).toFixed(1)}mA`;
  return `${(i * 1e6).toFixed(0)}µA`;
}

function hexToRgb(hex) {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '255,255,255';
  return `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

/**
 * Intelligent pin selector: Picks the pin with most "potential" (non-ground)
 */
/**
 * Intelligent pin selector: Picks the most "significant" pin for monitoring.
 * Uses rules based on component type and activity.
 */
function selectSmartPin(comp, nodeVoltages) {
  if (!comp.pins || comp.pins.length === 0) return null;

  // 1. Rule-based selection for complex components
  switch (comp.type) {
    case 'DC_VOLTAGE_SOURCE':
      return comp.pins[0]?.id; // Prefer + terminal
    case 'AC_VOLTAGE_SOURCE':
    case 'CLOCK_SOURCE':
      return comp.pins[1]?.id; // Prefer Signal OUT
    case 'VOLTAGE_REGULATOR':
      return comp.pins[1]?.id; // Always prefer OUT
    case 'AND_GATE':
    case 'OR_GATE':
    case 'XOR_GATE':
    case 'NAND_GATE':
    case 'NOR_GATE':
    case 'NOT_GATE':
    case 'COUNTER_4BIT':
      return comp.pins[comp.pins.length - 1]?.id; // Usually the primary Output or Overflow
    case '7447_DECODER':
      return comp.pins[4]?.id; // Prefer segment 'a' output over BCD inputs
    case 'NPN':
    case 'PNP':
      // Prefer Collector over Base/Emitter
      return comp.pins[1]?.id;
  }

  // 2. Default heuristic: Pick the pin with the highest absolute voltage (likely the "hot" side)
  let best = comp.pins[0].id;
  let maxV = Math.abs(nodeVoltages?.[best] || 0);

  for (let i = 1; i < comp.pins.length; i++) {
    const pid = comp.pins[i].id;
    const v = Math.abs(nodeVoltages?.[pid] || 0);
    if (v > maxV) {
      best = pid;
      maxV = v;
    }
  }
  return best;
}

function VBtn({ pinId, label, nodeVoltages, watchedPins, onTogglePin }) {
  if (!pinId) return <span style={{ color: '#1e293b' }}>—</span>;
  const v = nodeVoltages?.[pinId];
  const watchIdx = watchedPins.indexOf(pinId);
  const watched = watchIdx >= 0;
  const color = watched ? COLORS[watchIdx % COLORS.length] : null;

  return (
    <button
      onClick={() => onTogglePin(pinId)}
      title={`Watch: ${pinId}`}
      style={{
        background: watched ? `rgba(${hexToRgb(color)},0.15)` : 'rgba(255,255,255,0.04)',
        border: `1px solid ${watched ? color : 'rgba(255,255,255,0.08)'}`,
        color: watched ? color : '#64748b',
        borderRadius: '3px',
        padding: '1px 5px',
        fontSize: '0.7rem',
        cursor: 'pointer',
        fontFamily: 'monospace',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {label && <span style={{ color: 'rgba(255,255,255,0.25)', marginRight: '2px' }}>{label}:</span>}
      {fmtV(v)}V
    </button>
  );
}

export default function DebugPanel({
  components,
  nodeVoltages,
  branchCurrents,
  historyRef,
  watchedPins,
  onTogglePin,
  simTime,
}) {
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('debug_view_mode') || 'dashboard'); 
  const [panelHeight, setPanelHeight] = useState(() => parseFloat(localStorage.getItem('debug_panel_h')) || window.innerHeight * 0.3);
  const [scopeWidth, setScopeWidth] = useState(() => parseFloat(localStorage.getItem('debug_scope_w')) || window.innerWidth * 0.4);
  const [timeScale, setTimeScale] = useState(1); 
  const [vScale, setVScale] = useState(1);
  const resizeModeRef = useRef(null); // 'height' | 'width'
  const scopeRef = useRef(null);

  // Persistence Effects
  useEffect(() => { localStorage.setItem('debug_view_mode', viewMode); }, [viewMode]);
  useEffect(() => { localStorage.setItem('debug_panel_h', panelHeight); }, [panelHeight]);
  useEffect(() => { localStorage.setItem('debug_scope_w', scopeWidth); }, [scopeWidth]);

  // Sync default width on first mount if not set
  useEffect(() => {
    if (!localStorage.getItem('debug_scope_w')) {
      setScopeWidth(window.innerWidth * 0.5 - 250);
    }
  }, []);

  // Smooth values for Dashboard 
  const smoothValuesRef = useRef(new Map());

  useEffect(() => {
    components.forEach(c => {
      const v0 = nodeVoltages?.[c.pins[0]?.id] ?? 0;
      const v1 = nodeVoltages?.[c.pins[1]?.id] ?? 0;
      const curV = v0 - v1;
      const curI = branchCurrents?.[c.id] ?? 0;
      const prev = smoothValuesRef.current.get(c.id) || { v: curV, i: curI };
      smoothValuesRef.current.set(c.id, {
        v: prev.v * 0.9 + curV * 0.1,
        i: prev.i * 0.9 + curI * 0.1
      });
    });
  }, [nodeVoltages, branchCurrents, components]);

  const handleResizeStart = useCallback((mode, e) => {
    resizeModeRef.current = mode;
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    e.preventDefault();
  }, []);

  const handleResizeMove = useCallback((e) => {
    if (resizeModeRef.current === 'height') {
      const newHeight = window.innerHeight - e.clientY;
      if (newHeight > 100 && newHeight < window.innerHeight * 0.7) setPanelHeight(newHeight);
    } else if (resizeModeRef.current === 'width') {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 300 && newWidth < window.innerWidth * 0.6) setScopeWidth(newWidth);
    }
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizeModeRef.current = null;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  // Calculate dynamic SCOPE_H based on panel height and header/controls
  // panelHeight - header(35) - body_padding(2) - controls(35) - legend(30)
  const dynamicScopeH = Math.max(80, panelHeight - 110);

  // --- Smart Auto-Scaling Logic ---
  const autoAdjustScales = useCallback(() => {
    const hist = historyRef?.current || [];
    if (hist.length < 5 || watchedPins.length === 0) return;

    // 1. Vertical Scaling (Volt)
    let maxV = 0.5; // default min peak to avoid infinity
    watchedPins.forEach(pid => {
      hist.slice(-100).forEach(h => {
        const v = Math.abs(h.nodeVoltages?.[pid] || 0);
        if (v > maxV) maxV = v;
      });
    });

    // We want the peak to be at ~70% of the half-height
    // y = v * vScale * 5.  Target y = dynamicScopeH / 2 * 0.7
    const targetVScale = (dynamicScopeH / 2 * 0.7) / (5 * maxV);
    setVScale(parseFloat(Math.max(0.1, Math.min(50, targetVScale)).toFixed(1)));

    // 2. Horizontal Scaling (Time) - Detect edges/frequency
    // Count transitions in the last signal to guess period
    const lastPin = watchedPins[watchedPins.length - 1];
    let transitions = 0;
    let lastVal = hist[0]?.nodeVoltages?.[lastPin] || 0;
    hist.slice(-200).forEach(h => {
      const v = h.nodeVoltages?.[lastPin] || 0;
      if ((lastVal <= 0 && v > 0) || (lastVal >= 0 && v < 0)) transitions++;
      lastVal = v;
    });

    // If we have transitions, aim to show ~3-4 periods
    if (transitions >= 2) {
       const samplesPerPeriod = 200 / (transitions / 2);
       const desiredSamples = samplesPerPeriod * 3.5;
       const newTimeScale = Math.max(1, hist.length / desiredSamples);
       setTimeScale(Math.round(newTimeScale));
    } else {
       // If signal is flat or slow DC, show a medium window
       setTimeScale(Math.max(1, Math.round(hist.length / 150)));
    }
  }, [watchedPins, dynamicScopeH, historyRef]);

  // Trigger auto-adjust when signals are first added
  const lastProbedRef = useRef("");
  useEffect(() => {
    const sig = watchedPins.join(",");
    if (sig && sig !== lastProbedRef.current) {
      lastProbedRef.current = sig;
      // Wait for simulation to collect some samples
      setTimeout(autoAdjustScales, 300);
    }
  }, [watchedPins, autoAdjustScales]);

  const history = historyRef?.current ?? [];

  // Oscilloscope calculation - Scale based on real volts
  const getScaleFactor = () => vScale * 5; 

  // Calculate dynamic SCOPE_H based on panel height and header/controls
  // Moved up to avoid ReferenceError

  const scopeChannels = watchedPins.map((pinId, ci) => {
    if (history.length < 2) return null;
    const color = COLORS[ci % COLORS.length];

    const sliceCount = Math.max(10, Math.floor(history.length / timeScale));
    const slicedHistory = history.slice(-sliceCount);
    
    const factor = getScaleFactor();
    const pts = slicedHistory.map((h, i) => {
      const x = (i / Math.max(slicedHistory.length - 1, 1)) * SCOPE_W;
      const v = h.nodeVoltages?.[pinId] ?? 0;
      const y = (dynamicScopeH / 2) - (v * factor);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return { pinId, color, pts, current: nodeVoltages?.[pinId] };
  }).filter(Boolean);

  return (
    <div className="debug-panel" style={{ height: panelHeight }}>
      <div className="debug-resize-handle" onMouseDown={(e) => handleResizeStart('height', e)} />
      
      <div className="debug-header">
        <span style={{ fontWeight: 700, color: '#60a5fa', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
          DEBUGGER
        </span>
        
        <div className="debug-view-tabs">
          <div className={`debug-tab ${viewMode === 'expert' ? 'active' : ''}`} onClick={() => setViewMode('expert')}>
             Expert
          </div>
          <div className={`debug-tab ${viewMode === 'dashboard' ? 'active' : ''}`} onClick={() => setViewMode('dashboard')}>
             Dashboard
          </div>
        </div>

        <span style={{ fontSize: '0.7rem', color: '#475569', marginLeft: 'auto' }}>
          t = {simTime.toFixed(3)}s • {history.length} samples
        </span>
      </div>

      <div className="debug-body">
        <div className="debug-panel-main">
          {viewMode === 'expert' ? (
            <div className="debug-table-wrap">
              <table className="debug-table">
                <thead>
                  <tr>
                    {['Type', 'ID (Short)', 'Pin A', 'Pin B', 'Pin C', 'ΔV', 'Current', 'State'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {components.filter(c => c.type !== 'GROUND').map(comp => {
                    const p0 = comp.pins[0]?.id;
                    const p1 = comp.pins[1]?.id;
                    const p2 = comp.pins[2]?.id;
                    const v0 = nodeVoltages?.[p0];
                    const v1 = nodeVoltages?.[p1];
                    const dv = (v0 !== undefined && v1 !== undefined) ? v0 - v1 : null;
                    const ic = branchCurrents?.[comp.id];
                    const damaged = comp.properties.damaged;
                    const is3pin = comp.pins.length >= 3;

                    const model = registry.get(comp.type);
                    let stateEl;
                    if (damaged) stateEl = <span style={{ color: '#f87171' }}>DAMAGED</span>;
                    else if (model && model.getDebugState) stateEl = <span style={{ color: '#60a5fa' }}>{model.getDebugState(comp, nodeVoltages, branchCurrents)}</span>;
                    else {
                      const i = Math.abs(ic || 0);
                      stateEl = <span style={{ color: i > 0.001 ? '#34d399' : '#334155' }}>{i > 0.001 ? 'ACTIVE' : 'IDLE'}</span>;
                    }

                    return (
                      <tr key={comp.id} style={{ background: damaged ? 'rgba(239,68,68,0.06)' : 'transparent' }}>
                        <td style={{ color: '#94a3b8', fontWeight: 500 }}>{comp.type}</td>
                        <td style={{ fontFamily: 'monospace', color: '#334155', fontSize: '0.65rem' }}>{comp.id.substring(0, 8)}</td>
                        <td><VBtn pinId={p0} label={is3pin ? 'B' : null} nodeVoltages={nodeVoltages} watchedPins={watchedPins} onTogglePin={onTogglePin} /></td>
                        <td><VBtn pinId={p1} label={is3pin ? 'C' : null} nodeVoltages={nodeVoltages} watchedPins={watchedPins} onTogglePin={onTogglePin} /></td>
                        <td>{p2 ? <VBtn pinId={p2} label="E" nodeVoltages={nodeVoltages} watchedPins={watchedPins} onTogglePin={onTogglePin} /> : <span style={{ color: '#1e293b' }}>—</span>}</td>
                        <td style={{ fontFamily: 'monospace', color: dv !== null && Math.abs(dv) > 0.05 ? '#cbd5e1' : '#334155' }}>{dv !== null ? `${dv.toFixed(2)}V` : '—'}</td>
                        <td style={{ fontFamily: 'monospace', color: Math.abs(ic || 0) > 0.001 ? '#fbbf24' : '#334155' }}>{ic !== undefined ? fmtI(ic) : '—'}</td>
                        <td>{stateEl}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="debug-dashboard">
              {components.filter(c => c.type !== 'GROUND' && c.type !== 'WIRE').map(comp => {
                const sm = smoothValuesRef.current.get(comp.id) || { v: 0, i: 0 };
                const damaged = comp.properties.damaged;
                const isSource = comp.category === 'Sources';
                const isWatched = comp.pins.some(p => watchedPins.includes(p.id));

                return (
                  <div 
                    key={comp.id} 
                    className={`insight-card ${isWatched ? 'watched' : ''}`} 
                    onClick={() => {
                      const bestPin = selectSmartPin(comp, nodeVoltages);
                      if (bestPin) onTogglePin(bestPin);
                    }}
                    style={damaged ? { borderColor: '#f87171', background: 'rgba(239,68,68,0.05)' } : {}}
                  >
                    <div className="insight-header">
                       <span className="insight-title">{comp.type.replace(/_/g, ' ')}</span>
                       {isWatched && <span className="probe-indicator">● PROBE</span>}
                       {damaged && <span style={{ color: '#f87171', fontSize: '0.55rem', fontWeight: 'bold' }}>✖ FAIL</span>}
                    </div>
                    <div className="insight-value" style={{ color: damaged ? '#f87171' : (isSource ? '#60a5fa' : 'inherit') }}>
                      {Math.abs(sm.v) > 0.1 ? `${sm.v.toFixed(2)}V` : fmtI(sm.i)}
                    </div>
                    <div className="insight-sub">{comp.properties.label || comp.id.substring(0, 5)} {isSource ? '' : `• ${Math.abs(sm.i * sm.v).toFixed(2)}W`}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Horizontal Resize handle - Desktop Only */}
        <div className="debug-h-resize-handle desktop-only-flex" onMouseDown={(e) => handleResizeStart('width', e)} />

        {/* ── Oscilloscope ── */}
        <div className="debug-scope" style={{ width: scopeWidth }}>
          <div className="scope-controls">
            <div className="scope-control-group">
               <span>TIME</span>
               <button className="sc-btn" onClick={() => setTimeScale(Math.max(1, timeScale - 1))}>-</button>
               <input type="number" className="sc-input" value={timeScale} onChange={e => setTimeScale(Math.max(1, parseInt(e.target.value)||1))} />
               <button className="sc-btn" onClick={() => setTimeScale(timeScale + 1)}>+</button>
            </div>
            <div className="scope-control-group">
               <span>VOLT</span>
               <button className="sc-btn" onClick={() => setVScale(parseFloat((vScale - 0.2).toFixed(1)) || 0.1)}>-</button>
               <input type="number" className="sc-input" step="0.1" value={vScale} onChange={e => setVScale(parseFloat(e.target.value)||1)} />
               <button className="sc-btn" onClick={() => setVScale(parseFloat((vScale + 0.2).toFixed(1)))}>+</button>
            </div>
            <button className="magic-btn" onClick={autoAdjustScales} title="Auto-Scale Signals">
              ✨ AUTO SETUP
            </button>
            <span style={{ fontSize: '0.6rem', color: '#1e293b', fontStyle: 'italic', marginLeft: 'auto' }}>Drag border to resize width</span>
          </div>
          
          <div style={{ flex: 1, position: 'relative', background: '#040a14', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.04)', overflow: 'hidden' }}>
            <svg className="debug-scope-svg" width="100%" height={dynamicScopeH} viewBox={`0 0 ${SCOPE_W} ${dynamicScopeH}`} preserveAspectRatio="none" style={{ background: 'transparent' }}>
              {/* Dynamic Grid based on VScale */}
              {[1, 2, 3, 4].map(vLine => {
                const factor = getScaleFactor();
                const stepV = vScale > 2 ? 10 : 5;
                const yPos = (dynamicScopeH / 2) - (vLine * stepV * factor);
                const yNeg = (dynamicScopeH / 2) + (vLine * stepV * factor);
                return (
                  <React.Fragment key={vLine}>
                    {yPos > 0 && <line x1="0" y1={yPos} x2={SCOPE_W} y2={yPos} className="scope-grid-line" strokeWidth="0.5" strokeDasharray="2 2" />}
                    {yNeg < dynamicScopeH && <line x1="0" y1={yNeg} x2={SCOPE_W} y2={yNeg} className="scope-grid-line" strokeWidth="0.5" strokeDasharray="2 2" />}
                  </React.Fragment>
                );
              })}
              
              {/* Vertical Grid */}
              {[SCOPE_W/4, SCOPE_W/2, 3*SCOPE_W/4].map(x => (
                <line key={`x${x}`} x1={x} y1="0" x2={x} y2={dynamicScopeH} className="scope-grid-line" strokeWidth="1" />
              ))}
              
              {/* Cartesian 0V Axis */}
              <line x1="0" y1={dynamicScopeH/2} x2={SCOPE_W} y2={dynamicScopeH/2} className="cartesian-axis" strokeWidth="1.5" />

              {scopeChannels.map(ch => (
                <polyline key={ch.pinId} points={ch.pts} fill="none" stroke={ch.color} strokeWidth="2" opacity="1" style={{ transition: 'all 0.1s' }} />
              ))}
            </svg>

            {/* Non-distorted Overlay Labels */}
            <div className="scope-overlay" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', top: dynamicScopeH/2 - 7, left: 5, color: 'rgba(96, 165, 250, 0.6)', fontSize: '9px', fontWeight: '800' }}>
                0V REF
              </div>
              
              {scopeChannels.length === 0 && (
                 <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#1e293b', fontSize: '10px', fontWeight: 'bold' }}>
                   SELECT PIN TO PROBE
                 </div>
              )}

              {/* Dynamic Voltage Markers */}
              {scopeChannels.length > 0 && [15, 10, 5, -5, -10, -15].map(v => {
                 const factor = getScaleFactor();
                 const y = (dynamicScopeH / 2) - (v * factor);
                 if (y < 10 || y > dynamicScopeH - 10) return null;
                 return (
                   <div key={v} style={{ position: 'absolute', top: y - 6, left: 5, color: 'rgba(255,255,255,0.15)', fontSize: '8px', fontFamily: 'monospace' }}>
                     {v > 0 ? `+${v}` : v}V
                   </div>
                 );
              })}
            </div>
          </div>

          <div className="debug-scope-legend">
            {scopeChannels.map(ch => (
              <div key={ch.pinId} className="debug-scope-channel">
                <span style={{ color: ch.color, fontSize: '0.8rem' }}>⬤</span>
                <span className="debug-scope-pin">{ch.pinId.split('_').pop()}</span>
                <span style={{ color: ch.color, fontFamily: 'monospace', fontWeight: 'bold' }}>{(ch.current ?? 0).toFixed(2)}V</span>
                <button className="debug-scope-remove" onClick={() => onTogglePin(ch.pinId)}>×</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}