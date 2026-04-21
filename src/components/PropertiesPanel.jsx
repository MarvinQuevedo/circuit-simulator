import React from 'react';
import { COMPONENT_DEFINITIONS } from '../core/ComponentDefs';

// ─── Model-Select field ───────────────────────────────────────────────────────
// Renders: dropdown + read-only param chips + optional "Customize" toggle
function ModelSelectField({ meta, component, dispatch }) {
  const { modelId, useCustom } = component.properties;
  const library = meta.modelLibrary || {};
  const selectedPreset = library[modelId] || Object.values(library)[0];

  const setModelId = (newId) => {
    const preset = library[newId] || {};
    // When switching model, load preset values and keep useCustom state
    dispatch({
      type: 'UPDATE_PROPERTIES_BATCH',
      payload: {
        id: component.id,
        updates: {
          modelId: newId,
          useCustom: newId === 'CUSTOM' ? true : (component.properties.useCustom || false),
          ...Object.fromEntries(
            (meta.customFields || []).map(f => [f.key, preset[f.key]])
          ),
        }
      }
    });
  };

  const setUseCustom = (val) => {
    // When enabling custom, seed fields from current preset
    const patch = { useCustom: val };
    if (val) {
      (meta.customFields || []).forEach(f => {
        patch[f.key] = selectedPreset?.[f.key] ?? component.properties[f.key];
      });
    }
    dispatch({ type: 'UPDATE_PROPERTIES_BATCH', payload: { id: component.id, updates: patch } });
  };

  const setField = (key, value) =>
    dispatch({ type: 'UPDATE_PROPERTY', payload: { id: component.id, key, value } });

  const inputStyle = {
    background: 'rgba(0,0,0,0.25)',
    border: '1px solid var(--panel-border)',
    color: 'white',
    padding: '7px 10px',
    borderRadius: '6px',
    fontFamily: 'inherit',
    fontSize: '0.9rem',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* ── Model Selector ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {meta.label}
        </label>
        <select
          value={modelId || ''}
          onChange={e => setModelId(e.target.value)}
          style={inputStyle}
        >
          {meta.options.map(opt => (
            <option key={opt.value} value={opt.value} style={{ background: '#1e293b' }}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Preset parameter preview ── */}
      {selectedPreset && meta.customFields && (
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          padding: '10px 12px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 14px',
        }}>
          {meta.customFields.map(f => {
            const val = useCustom ? component.properties[f.key] : selectedPreset?.[f.key];
            return (
              <span key={f.key} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                <span style={{ color: 'rgba(255,255,255,0.35)', marginRight: '2px' }}>{f.label.split(' ')[0]}:</span>
                <span style={{ color: useCustom ? '#a5b4fc' : '#94a3b8', fontWeight: 600 }}>
                  {val !== undefined ? val : '—'}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {/* ── Customize toggle ── */}
      {meta.customFields && meta.customFields.length > 0 && (
        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '0.85rem',
          color: useCustom ? '#a5b4fc' : 'var(--text-secondary)',
          transition: 'color 0.2s',
        }}>
          {/* Custom toggle switch */}
          <span
            onClick={() => setUseCustom(!useCustom)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              width: '36px',
              height: '20px',
              borderRadius: '10px',
              background: useCustom ? 'rgba(165, 180, 252, 0.3)' : 'rgba(255,255,255,0.1)',
              border: `1px solid ${useCustom ? '#a5b4fc' : 'rgba(255,255,255,0.15)'}`,
              padding: '2px',
              transition: 'all 0.2s',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span style={{
              display: 'block',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: useCustom ? '#a5b4fc' : '#64748b',
              transform: useCustom ? 'translateX(16px)' : 'translateX(0)',
              transition: 'all 0.2s',
            }} />
          </span>
          <span onClick={() => setUseCustom(!useCustom)}>Customize values</span>
        </label>
      )}

      {/* ── Custom input fields (only when useCustom=true) ── */}
      {useCustom && meta.customFields && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          paddingLeft: '4px',
          borderLeft: '2px solid rgba(165, 180, 252, 0.25)',
          animation: 'fadeSlideIn 0.15s ease-out',
        }}>
          {meta.customFields.map(f => (
            <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{f.label}</label>
              <input
                type="number"
                step={f.step || 'any'}
                min={f.min}
                value={component.properties[f.key] ?? ''}
                onChange={e => setField(f.key, parseFloat(e.target.value) || 0)}
                style={inputStyle}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main PropertiesPanel ─────────────────────────────────────────────────────
export default function PropertiesPanel({ elementId, components, wires, dispatch }) {
  const component = components.find(c => c.id === elementId);
  const wire = wires?.find(w => w.id === elementId);

  if (!component && !wire) return null;

  if (wire) {
    return (
      <div className="properties-panel glass-panel">
        <h3 style={{ marginTop: 0, marginBottom: '15px', color: 'var(--text-primary)' }}>Wire Connection</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Connects two component pins.</p>
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--panel-border)', paddingTop: '15px' }}>
          <button
            className="tb-btn"
            style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', width: '100%' }}
            onClick={() => dispatch({ type: 'REMOVE_ELEMENT', payload: wire.id })}
          >
            Delete Wire
          </button>
        </div>
      </div>
    );
  }

  const def = COMPONENT_DEFINITIONS[component.type];

  const renderPropsForm = () => {
    if (!def || (!def.propertyMeta && (!def.propertyLabels || Object.keys(def.propertyLabels).length === 0))) {
      return <div style={{ color: 'var(--text-secondary)' }}>No properties to edit here.</div>;
    }

    const meta = def.propertyMeta || Object.keys(def.propertyLabels).reduce(
      (a, k) => ({ ...a, [k]: { label: def.propertyLabels[k], type: 'number' } }), {}
    );

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {Object.entries(meta).map(([key, fieldMeta]) => {
          // ── model-select type ──
          if (fieldMeta.type === 'model-select') {
            return (
              <ModelSelectField
                key={key}
                meta={fieldMeta}
                component={component}
                dispatch={dispatch}
              />
            );
          }

          // ── select type ──
          const val = component.properties[key];
          if (fieldMeta.type === 'select') {
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{fieldMeta.label || fieldMeta}</label>
                <select
                  value={val}
                  onChange={e => dispatch({ type: 'UPDATE_PROPERTY', payload: { id: component.id, key, value: e.target.value } })}
                  style={{
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--panel-border)',
                    color: 'white',
                    padding: '8px',
                    borderRadius: '4px',
                    fontFamily: 'inherit'
                  }}
                >
                  {fieldMeta.options.map(opt => (
                    <option key={opt.value} value={opt.value} style={{ background: '#1e293b' }}>{opt.label}</option>
                  ))}
                </select>
              </div>
            );
          }

          // ── boolean type ──
          if (fieldMeta.type === 'boolean' || typeof val === 'boolean') {
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={val}
                  onChange={e => dispatch({ type: 'UPDATE_PROPERTY', payload: { id: component.id, key, value: e.target.checked } })}
                  id={`prop-${key}`}
                />
                <label htmlFor={`prop-${key}`} style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  {fieldMeta.label || fieldMeta}
                </label>
              </div>
            );
          }

          // ── number / text type ──
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{fieldMeta.label || fieldMeta}</label>
              <input
                type="number"
                step={fieldMeta.step || 'any'}
                min={fieldMeta.min}
                value={val}
                onChange={e => dispatch({ type: 'UPDATE_PROPERTY', payload: { id: component.id, key, value: parseFloat(e.target.value) || 0 } })}
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid var(--panel-border)',
                  color: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  fontFamily: 'inherit'
                }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="properties-panel glass-panel" style={{
      position: 'absolute',
      right: '20px',
      top: '80px',
      width: '300px',
      padding: '20px',
      borderRadius: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '15px'
    }}>
      <h3 style={{ marginTop: 0, marginBottom: '5px', color: 'var(--text-primary)' }}>{def?.label || 'Component'}</h3>

      {component.properties.damaged && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '6px', padding: '10px', marginBottom: '10px' }}>
          <h4 style={{ margin: '0 0 5px 0', color: '#ef4444', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span>⚠️</span> Component Damaged
          </h4>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {component.properties.damageReason || 'Physical limits extremely exceeded.'}
          </p>
        </div>
      )}

      {renderPropsForm()}

      <div style={{ display: 'flex', gap: '10px', marginTop: '20px', borderTop: '1px solid var(--panel-border)', paddingTop: '15px' }}>
        {component.properties.damaged && (
          <button
            className="tb-btn"
            style={{ color: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.3)', flex: 1 }}
            onClick={() => dispatch({ type: 'REPAIR_COMPONENT', payload: component.id })}
            title="Repair Component"
          >
            🔧 Repair
          </button>
        )}
        <button
          className="tb-btn"
          onClick={() => dispatch({ type: 'ROTATE_COMPONENT', payload: component.id })}
          title="Rotate (R)"
          style={{ flex: 1 }}
        >
          ↻ Rotate
        </button>
        <button
          className="tb-btn"
          style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', flex: 1 }}
          onClick={() => dispatch({ type: 'REMOVE_ELEMENT', payload: component.id })}
          title="Delete (Del)"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
