import React from 'react';
import { COMPONENT_DEFINITIONS, registry } from '../core/ComponentDefs';

const renderIcon = (type) => {
  const model = registry.get(type);
  if (model) {
    return (
      <svg width="24" height="24" viewBox="-40 -40 80 80">
        {model.renderIcon()}
      </svg>
    );
  }
  return null;
};

export default function Sidebar({ onAddComponent, isOpen, onClose }) {
  const handleDragStart = (e, type) => {
    e.dataTransfer.setData('componentType', type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const groupedComponents = Object.values(COMPONENT_DEFINITIONS).reduce((acc, def) => {
    if (!acc[def.category]) acc[def.category] = [];
    acc[def.category].push(def);
    return acc;
  }, {});

  return (
    <div className={`sidebar glass-panel ${isOpen ? 'mobile-open' : ''}`} style={{ userSelect: 'none', overflowY: 'auto', padding: '15px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ 
          fontSize: '0.9rem', margin: 0, 
          color: '#60a5fa', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em' 
        }}>
          Components
        </h2>
        {/* Mobile close button */}
        <button onClick={onClose} className="mobile-only" style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}>×</button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {Object.entries(groupedComponents).map(([category, defs]) => (
          <div key={category}>
            <h3 style={{ 
              fontSize: '0.65rem', color: '#475569', textTransform: 'uppercase', 
              marginBottom: '10px', fontWeight: '700', borderBottom: '1px solid rgba(255,255,255,0.03)',
              paddingBottom: '4px', letterSpacing: '0.05em' 
            }}>
              {category}
            </h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', 
              gap: '8px' 
            }}>
              {defs.map(def => (
                <div 
                  key={def.type}
                  draggable
                  onDragStart={(e) => handleDragStart(e, def.type)}
                  onClick={() => onAddComponent(def.type)} // Click to add for mobile
                  className="sidebar-item"
                  title={def.label}
                  style={{
                    padding: '10px',
                    backgroundColor: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    aspectRatio: '1'
                  }}
                >
                  <div style={{ 
                    width: '32px', height: '32px', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '8px',
                    padding: '4px'
                  }}>
                    {renderIcon(def.type)}
                  </div>
                  <span style={{ 
                    fontWeight: '700', fontSize: '0.6rem', color: '#94a3b8', 
                    textAlign: 'center', whiteSpace: 'nowrap', width: '100%', 
                    overflow: 'hidden', textOverflow: 'ellipsis' 
                  }}>
                    {def.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div style={{ marginTop: 'auto', paddingTop: '30px' }}>
        <p style={{ 
          fontSize: '0.65rem', color: '#334155', margin: 0, 
          borderTop: '1px solid rgba(255,255,255,0.03)', paddingTop: '15px',
          fontStyle: 'italic', textAlign: 'center'
        }}>
          Tap or drag to add
        </p>
      </div>
    </div>
  );
}
