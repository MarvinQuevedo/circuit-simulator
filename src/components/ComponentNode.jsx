import React, { useState } from 'react';
import { COMPONENT_DEFINITIONS, registry } from '../core/ComponentDefs';

export default function ComponentNode({ 
  component, 
  isSelected, 
  onSelect, 
  onMove, 
  onRotate,
  onInteract,
  onPress,
  onRelease,
  onMoveEnd,
  wiringHandlers,
  simulationCurrent,
  isSimulating,
  zoom = 1,
  showProbes = false,
  vizMode = 'digital',
  nodeVoltages = {}
}) {
  const { id, type, x, y, rotation, pins } = component;
  const def = COMPONENT_DEFINITIONS[type];
  const { startWiring, finishWiring, wiringStartPin } = wiringHandlers;

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handlePointerDown = (e) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    onSelect(id);
    setDragOffset({ x: e.clientX, y: e.clientY });

    if (isSimulating && type === 'PUSH_BUTTON') {
      if (onPress) onPress(id);
      e.target.setPointerCapture(e.pointerId);
    } else if (!isSimulating) {
      setIsDragging(true);
      e.target.setPointerCapture(e.pointerId);
    }
  };

  const handlePointerMove = (e) => {
    if (isDragging && !isSimulating) {
      e.stopPropagation();
      const dx = (e.clientX - dragOffset.x) / zoom;
      const dy = (e.clientY - dragOffset.y) / zoom;
      
      const snappedX = Math.round((x + dx) / 20) * 20;
      const snappedY = Math.round((y + dy) / 20) * 20;
      
      if (snappedX !== x || snappedY !== y) {
        onMove(id, snappedX, snappedY);
        setDragOffset({ x: e.clientX, y: e.clientY });
      }
    }
  };

  const handlePointerUp = (e) => {
    if (isSimulating && type === 'PUSH_BUTTON') {
      if (onRelease) onRelease(id);
      try { e.target.releasePointerCapture(e.pointerId); } catch(e) {}
    }

    if (!isSimulating) {
      if (isDragging && onMoveEnd) onMoveEnd();
      setIsDragging(false);
      try { e.target.releasePointerCapture(e.pointerId); } catch(e) {}
    }

    const dx = e.clientX - dragOffset.x;
    const dy = e.clientY - dragOffset.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // For PUSH_BUTTON in simulation, we don't want to toggle (onInteract)
    const isMomentarySim = isSimulating && type === 'PUSH_BUTTON';
    if (dist < 5 && onInteract && !isMomentarySim) {
      onInteract(id);
    }
  };

  const renderShape = () => {
    const model = registry.get(type);
    if (!model) return null;

    return (
      <g>
        {model.renderShape(component, simulationCurrent, nodeVoltages)}
        {component.properties.damaged && model.renderDamageOverlay && model.renderDamageOverlay()}
      </g>
    );
  };

  let tooltipText = def ? def.label : 'Component';
  if (component.properties.damaged) {
    tooltipText += '\n[DAMAGED/BLOWN]';
    if (component.properties.damageReason) {
      tooltipText += `\n${component.properties.damageReason}`;
    }
  } else if (isSimulating && simulationCurrent !== undefined) {
    const i = Math.abs(simulationCurrent);
    if (i < 0.001) tooltipText += `\nCurrent: ${(i * 1000000).toFixed(2)} µA`;
    else if (i < 1) tooltipText += `\nCurrent: ${(i * 1000).toFixed(2)} mA`;
    else tooltipText += `\nCurrent: ${(i).toFixed(3)} A`;
  }

  const model = registry.get(type);
  const bounds = model ? model.getBounds() : { minX: -40, minY: -30, maxX: 40, maxY: 30 };

  return (
    <g 
      transform={`translate(${x}, ${y}) rotate(${rotation})`}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <rect 
        x={bounds.minX} y={bounds.minY} width={bounds.maxX - bounds.minX} height={bounds.maxY - bounds.minY} 
        fill="transparent" 
      >
        <title>{tooltipText}</title>
      </rect>
      {isSelected && (
        <g>
          <rect 
            x={bounds.minX + 5} y={bounds.minY} 
            width={bounds.maxX - bounds.minX - 10} height={bounds.maxY - bounds.minY} 
            fill="none" stroke="var(--accent-color)" strokeWidth="1" strokeDasharray="4 2" 
          />
          {/* Quick rotate button rendered above bounding box, scale down since it's SVG */}
          {!isSimulating && (
            <g 
              transform={`translate(${bounds.maxX - 10}, ${bounds.minY - 15})`} 
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.button === 0 && onRotate) onRotate(id);
              }}
            >
              <circle cx="0" cy="0" r="10" fill="var(--panel-bg)" stroke="var(--accent-color)" strokeWidth="2" />
              <path d="M -4 0 A 4 4 0 1 1 0 -4 L 0 -6 L 4 -2 L 0 2 L 0 0 A 2 2 0 1 0 2 2 L 4 2 A 4 4 0 0 1 -4 0 Z" fill="var(--accent-color)" />
            </g>
          )}
        </g>
      )}
      {renderShape()}
      {component.properties.label && (
        <text
          x="0" y={bounds.maxY + 15}
          fill="var(--text-secondary)"
          fontSize="10"
          textAnchor="middle"
          style={{ pointerEvents: 'none', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em' }}
        >
          {component.properties.label}
        </text>
      )}
      {pins.map((pin) => {
        const v = nodeVoltages[pin.id] || 0;
        const isAnalog = vizMode === 'analog';
        const probeText = isAnalog ? `${v.toFixed(1)}V` : (v > 2.0 ? '1' : '0');
        const probeWidth = isAnalog ? 32 : 12;
        
        const getProbeColor = (val) => {
          if (!isAnalog) return val > 2.0 ? "#ef4444" : "#1e40af";
          if (val > 0.1) return "#ef4444"; // Hot
          if (val < -0.1) return "#3b82f6"; // Negative
          return "#4b5563"; // Groundish/neutral
        };

        return (
          <g key={pin.id}>
            <circle 
              cx={pin.offsetX} 
              cy={pin.offsetY} 
              r="6" 
              fill={wiringStartPin?.pinId === pin.id ? "var(--wire-active)" : "var(--wire-color)"}
              stroke="var(--bg-color)"
              strokeWidth="2"
              className="component-pin"
              style={{ cursor: isSimulating ? 'not-allowed' : 'crosshair', transition: 'fill 0.2s', opacity: (isSimulating && !pin.label) ? 0 : 1 }}
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.button !== 0 || isSimulating) return;
                const rad = rotation * Math.PI / 180;
                const absX = x + pin.offsetX * Math.cos(rad) - pin.offsetY * Math.sin(rad);
                const absY = y + pin.offsetX * Math.sin(rad) + pin.offsetY * Math.cos(rad);
                startWiring(pin.id, absX, absY);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (wiringStartPin) finishWiring(pin.id);
              }}
            />
            {pin.label && (
              <text 
                x={pin.offsetX} 
                y={pin.offsetY + (pin.offsetY > 0 ? 12 : -8)} 
                fill="var(--text-secondary)" 
                fontSize="8" 
                textAnchor="middle"
                style={{ pointerEvents: 'none', opacity: isSimulating ? 0.4 : 1 }}
              >
                {pin.label}
              </text>
            )}
            {showProbes && nodeVoltages && (
              <g transform={`translate(${pin.offsetX + (pin.offsetX > 0 ? (isAnalog ? 20 : 10) : (isAnalog ? -20 : -10))}, ${pin.offsetY})`}>
                 <rect x={-probeWidth/2} y="-6" width={probeWidth} height={12} rx="2" fill={getProbeColor(v)} opacity="0.9" />
                 <text y="3" textAnchor="middle" fill="white" fontSize={isAnalog ? "7" : "9"} fontWeight="bold">{probeText}</text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}
