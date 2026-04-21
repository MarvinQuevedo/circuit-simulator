import React, { useRef, useState, useEffect } from 'react';

export default function Canvas({ 
  components, 
  wires, 
  dispatch, 
  selectedElementId,
  isSimulating,
  renderComponent,
  renderWire
}) {
  const containerRef = useRef(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // For wiring
  const [wiringStartPin, setWiringStartPin] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handlePointerDown = (e) => {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.target.tagName !== 'g' && e.target.tagName !== 'path' && e.target.tagName !== 'circle' && e.target.tagName !== 'rect')) {
      // Middle/Right click or clicking empty space -> Pan
      setIsPanning(true);
      setStartPan({ x: e.clientX, y: e.clientY });
      dispatch({ type: 'SET_SELECTED', payload: null });
      if (wiringStartPin) setWiringStartPin(null);
    }
  };

  const handlePointerMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - startPan.x;
      const dy = e.clientY - startPan.y;
      setPan({ x: pan.x + dx, y: pan.y + dy });
      setStartPan({ x: e.clientX, y: e.clientY });
    }
    
    if (wiringStartPin) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;
      setMousePos({ x, y });
    }
  };

  const handlePointerUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = -e.deltaY * 0.005;
      setZoom(z => Math.max(0.2, Math.min(z + zoomFactor, 3)));
    }
  };

  const startWiring = (pinId, x, y) => {
    if (isSimulating) return;
    setWiringStartPin({ pinId, x, y });
    setMousePos({ x, y });
  };

  const finishWiring = (endPinId) => {
    if (wiringStartPin && wiringStartPin.pinId !== endPinId) {
      dispatch({
        type: 'ADD_WIRE',
        payload: {
          id: `wire_${Date.now()}`,
          startPinId: wiringStartPin.pinId,
          endPinId: endPinId,
          path: []
        }
      });
    }
    setWiringStartPin(null);
  };

  // Grid background style dynamically offset by pan
  const gridStyle = {
    backgroundPosition: `${pan.x}px ${pan.y}px`,
    backgroundSize: `${20 * zoom}px ${20 * zoom}px`
  };

  return (
    <div 
      className="canvas-container" 
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
      style={gridStyle}
    >
      <svg 
        width="100%" 
        height="100%" 
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {wires.map(w => renderWire(w, zoom))}
          
          {wiringStartPin && (
            <line 
              x1={wiringStartPin.x} 
              y1={wiringStartPin.y} 
              x2={mousePos.x} 
              y2={mousePos.y} 
              stroke="var(--wire-color)" 
              strokeWidth="2" 
              opacity="0.5"
              strokeDasharray="4 4"
            />
          )}

          {components.map(c => renderComponent(c, { startWiring, finishWiring, wiringStartPin }, zoom))}
        </g>
      </svg>
    </div>
  );
}
