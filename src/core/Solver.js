import { registry } from './ComponentRegistry';

export function solveLinearSystem(A, B) {
  const n = A.length;
  // Augment matrix
  const M = A.map((row, i) => [...row, B[i]]);

  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxEl = Math.abs(M[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > maxEl) {
        maxEl = Math.abs(M[k][i]);
        maxRow = k;
      }
    }

    // Swap maximum row with current row
    [M[maxRow], M[i]] = [M[i], M[maxRow]];

    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      // Guard against div by zero if singular A
      if (Math.abs(M[i][i]) < 1e-12) continue; 
      const c = -M[k][i] / M[i][i];
      for (let j = i; j < n + 1; j++) {
        if (i === j) {
          M[k][j] = 0;
        } else {
          M[k][j] += c * M[i][j];
        }
      }
    }
  }

  // Solve equation Ax=B for an upper triangular matrix
  const x = new Array(n).fill(0);
  for (let i = n - 1; i > -1; i--) {
    if (Math.abs(M[i][i]) < 1e-12) {
      x[i] = 0; // Floating / unconnected node
    } else {
      x[i] = M[i][n] / M[i][i];
      for (let k = i - 1; k > -1; k--) {
        M[k][n] -= M[k][i] * x[i];
      }
    }
  }
  return x;
}

export function simulateCircuit(components, wires, dt = 0.005) {
  const pinToNode = new Map();
  let nodeCount = 0;

  const getOrAssignNode = (pinId) => {
    if (!pinToNode.has(pinId)) {
      pinToNode.set(pinId, ++nodeCount);
    }
    return pinToNode.get(pinId);
  };

  const mergeNodes = (nodeA, nodeB) => {
    if (nodeA === nodeB) return nodeA;
    for (const [pinId, n] of pinToNode.entries()) {
      if (n === nodeB) pinToNode.set(pinId, nodeA);
    }
    return nodeA;
  };

  components.forEach(c => {
    c.pins.forEach(p => getOrAssignNode(p.id));
  });

  // Virtually connect all GROUND components together
  const groundPins = [];
  components.forEach(c => {
    if (c.type === 'GROUND' && c.pins.length > 0) {
      groundPins.push(c.pins[0].id);
    }
  });

  if (groundPins.length > 1) {
    const firstGroundNode = getOrAssignNode(groundPins[0]);
    for (let i = 1; i < groundPins.length; i++) {
      mergeNodes(firstGroundNode, getOrAssignNode(groundPins[i]));
    }
  }

  const uniqueNodes = Array.from(new Set(pinToNode.values()));
  
  let groundOriginalNode = null;
  const grounds = components.filter(c => c.type === 'GROUND');
  if (grounds.length > 0) {
    groundOriginalNode = pinToNode.get(grounds[0].pins[0].id);
  }

  if (groundOriginalNode === null && uniqueNodes.length > 0) {
    groundOriginalNode = uniqueNodes[0];
  }

  if (uniqueNodes.length <= 1) {
    return { nodeVoltages: {}, branchCurrents: {}, updatedComponentProperties: {} };
  }

  const finalNodeMap = new Map();
  let mnaNodeIndex = 1;

  uniqueNodes.forEach(node => {
    if (node === groundOriginalNode) {
      finalNodeMap.set(node, 0);
    } else {
      finalNodeMap.set(node, mnaNodeIndex++);
    }
  });

  const numNodes = mnaNodeIndex - 1;
  let totalExtraVars = 0;
  const extraVarMap = new Map(); // comp.id -> array of indices

  components.forEach(c => {
    const model = registry.get(c.type);
    if (!model) return;
    const count = model.getExtraVariablesCount();
    if (count > 0) {
      const indices = [];
      for (let i = 0; i < count; i++) {
        indices.push(numNodes + totalExtraVars++);
      }
      extraVarMap.set(c.id, indices);
    }
  });

  const mnaSize = numNodes + totalExtraVars;
  if (mnaSize === 0) return { nodeVoltages: {}, branchCurrents: {}, updatedComponentProperties: {} };

  const resolvedNodeMap = new Map();
  pinToNode.forEach((originalNode, pinId) => {
    resolvedNodeMap.set(pinId, finalNodeMap.get(originalNode));
  });

  let X = new Array(mnaSize).fill(0);
  
  for (let iter = 0; iter < 20; iter++) {
    const A = Array.from({ length: mnaSize }, () => new Array(mnaSize).fill(0));
    const Z = new Array(mnaSize).fill(0);

    const tempNodeVoltages = {};
    pinToNode.forEach((originalNode, pinId) => {
      const mnaNode = finalNodeMap.get(originalNode);
      if (mnaNode === 0) tempNodeVoltages[pinId] = 0;
      else tempNodeVoltages[pinId] = X[mnaNode - 1] || 0;
    });

    components.forEach(c => {
      const model = registry.get(c.type);
      if (model) {
        model.applyMNA(A, Z, c, resolvedNodeMap, extraVarMap.get(c.id) || [], tempNodeVoltages, dt);
      }
    });

    const G_wire = 1e3; // 1 mOhm
    wires.forEach(w => {
      const n1 = resolvedNodeMap.get(w.startPinId) || 0;
      const n2 = resolvedNodeMap.get(w.endPinId) || 0;
      if (n1 > 0) A[n1 - 1][n1 - 1] += G_wire;
      if (n2 > 0) A[n2 - 1][n2 - 1] += G_wire;
      if (n1 > 0 && n2 > 0) {
        A[n1 - 1][n2 - 1] -= G_wire;
        A[n2 - 1][n1 - 1] -= G_wire;
      }
    });

    const newX = solveLinearSystem(A, Z);
    
    let diff = 0;
    let hasNaN = false;
    for (let i = 0; i < mnaSize; i++) {
        if (isNaN(newX[i])) hasNaN = true;
        diff += Math.abs(newX[i] - X[i]);
    }
    
    X = newX;
    if (hasNaN || diff < 1e-7) break;
  }

  const nodeVoltages = {};
  pinToNode.forEach((originalNode, pinId) => {
    const mnaNode = finalNodeMap.get(originalNode);
    if (mnaNode === 0) {
      nodeVoltages[pinId] = 0;
    } else {
      nodeVoltages[pinId] = X[mnaNode - 1];
    }
  });

  const branchCurrents = {};
  const updatedComponentProperties = {}; // compId -> properties object

  components.forEach(c => {
    const model = registry.get(c.type);
    if (model) {
      const extraVars = (extraVarMap.get(c.id) || []).map(idx => X[idx]);
      const current = model.extractCurrent(c, nodeVoltages, extraVars, dt);
      branchCurrents[c.id] = current;
      
      // Update internal state
      const updates = model.getUpdatedProperties(c, nodeVoltages, extraVars, dt);
      if (updates) {
        updatedComponentProperties[c.id] = updates;
      }
    }
  });

  // Calculate actual current through wires physically using their 1mOhm resistance
  wires.forEach(w => {
    const vStart = nodeVoltages[w.startPinId] || 0;
    const vEnd = nodeVoltages[w.endPinId] || 0;
    branchCurrents[w.id] = (vStart - vEnd) * 1e3; 
  });

  return { nodeVoltages, branchCurrents, updatedComponentProperties };
}
