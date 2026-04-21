import React, { useState } from 'react';
import { EXAMPLE_CIRCUITS } from '../data/exampleCircuits';

const TAG_COLORS = {
  'LED':         { bg: 'rgba(239,68,68,0.15)',   border: 'rgba(239,68,68,0.3)',   text: '#fca5a5' },
  'Resistor':    { bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.3)',  text: '#fcd34d' },
  'Diode':       { bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.3)',  text: '#a5b4fc' },
  'Zener':       { bg: 'rgba(139,92,246,0.15)',  border: 'rgba(139,92,246,0.3)',  text: '#c4b5fd' },
  'NPN':         { bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.3)',  text: '#6ee7b7' },
  'PNP':         { bg: 'rgba(244,114,182,0.15)', border: 'rgba(244,114,182,0.3)', text: '#f9a8d4' },
  'Transistor':  { bg: 'rgba(52,211,153,0.15)',  border: 'rgba(52,211,153,0.3)',  text: '#6ee7b7' },
  'Switch':      { bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)', text: '#cbd5e1' },
  'Capacitor':   { bg: 'rgba(129,140,248,0.15)', border: 'rgba(129,140,248,0.3)', text: '#a5b4fc' },
  'RC':          { bg: 'rgba(129,140,248,0.15)', border: 'rgba(129,140,248,0.3)', text: '#a5b4fc' },
  'Rectifier':   { bg: 'rgba(251,113,133,0.15)', border: 'rgba(251,113,133,0.3)', text: '#fda4af' },
  'Regulator':   { bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.3)',   text: '#86efac' },
  'RGB':         { bg: 'rgba(168,85,247,0.15)',  border: 'rgba(168,85,247,0.3)',  text: '#d8b4fe' },
  'Parallel':    { bg: 'rgba(56,189,248,0.15)',  border: 'rgba(56,189,248,0.3)',  text: '#7dd3fc' },
  'Beginner':    { bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.3)',   text: '#86efac' },
  '1N4007':      { bg: 'rgba(99,102,241,0.15)',  border: 'rgba(99,102,241,0.3)',  text: '#a5b4fc' },
};

function Tag({ label }) {
  const style = TAG_COLORS[label] || TAG_COLORS['Resistor'];
  return (
    <span style={{
      fontSize: '0.72rem',
      padding: '2px 8px',
      borderRadius: '12px',
      background: style.bg,
      border: `1px solid ${style.border}`,
      color: style.text,
      fontWeight: 600,
      letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  );
}

export default function ExamplesGallery({ onLoad, onClose }) {
  const [hovered, setHovered] = useState(null);
  const [loading, setLoading] = useState(null);

  const handleLoad = (example) => {
    setLoading(example.id);
    setTimeout(() => {
      onLoad(example.circuit);
      setLoading(null);
      onClose();
    }, 250);
  };

  return (
    // Backdrop
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.15s ease-out',
      }}
    >
      <div style={{
        width: '820px',
        maxWidth: '95vw',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(15, 23, 42, 0.97)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '16px',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>🔬</span> Example Circuits
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              Load a pre-built circuit to explore and test components
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#94a3b8',
              borderRadius: '8px',
              width: '36px',
              height: '36px',
              fontSize: '1.1rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'white'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            ✕
          </button>
        </div>

        {/* Grid */}
        <div style={{
          padding: '20px 24px',
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
          gap: '14px',
        }}>
          {EXAMPLE_CIRCUITS.map(ex => {
            const isHovered = hovered === ex.id;
            const isLoading = loading === ex.id;
            return (
              <div
                key={ex.id}
                onMouseEnter={() => setHovered(ex.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: isHovered ? 'rgba(59,130,246,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isHovered ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: '12px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  cursor: 'pointer',
                  transition: 'all 0.18s ease',
                  transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                  boxShadow: isHovered ? '0 8px 24px rgba(59,130,246,0.12)' : 'none',
                }}
                onClick={() => handleLoad(ex)}
              >
                {/* Icon + title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{ex.icon}</span>
                  <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#e2e8f0', lineHeight: 1.2 }}>{ex.name}</span>
                </div>

                {/* Description */}
                <p style={{
                  margin: 0,
                  fontSize: '0.8rem',
                  color: '#64748b',
                  lineHeight: 1.5,
                  flexGrow: 1,
                }}>
                  {ex.description}
                </p>

                {/* Tags */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                  {ex.tags.map(t => <Tag key={t} label={t} />)}
                </div>

                {/* Load button */}
                <button
                  onClick={e => { e.stopPropagation(); handleLoad(ex); }}
                  style={{
                    marginTop: '4px',
                    padding: '7px 0',
                    borderRadius: '8px',
                    border: `1px solid ${isHovered ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                    background: isHovered ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.05)',
                    color: isHovered ? '#a5b4fc' : '#94a3b8',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.18s',
                    fontFamily: 'inherit',
                    letterSpacing: '0.02em',
                  }}
                >
                  {isLoading ? '⏳ Loading…' : '→ Load Circuit'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div style={{
          padding: '12px 28px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: '0.78rem',
          color: '#475569',
          flexShrink: 0,
        }}>
          💡 Tip: After loading, click <strong style={{ color: '#64748b' }}>Start Simulation</strong> to run the circuit. Use the switch components to interact.
        </div>
      </div>
    </div>
  );
}
