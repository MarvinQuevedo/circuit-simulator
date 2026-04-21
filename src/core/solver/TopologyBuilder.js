/**
 * TopologyBuilder.js — Extracted from Solver.js lines 52-140.
 *
 * Responsible for:
 *   - Assigning MNA node indices to component pins
 *   - Merging ground nodes
 *   - Wiring wire connections (merging nodes connected by wires)
 *   - Allocating extra variable slots for components (voltage sources, etc.)
 *
 * Returns: { resolvedNodeMap, numNodes, extraVarMap, mnaSize, groundExists }
 */

import { registry } from '../ComponentRegistry.js';

/**
 * Build the topology from components and wires.
 *
 * @param {object[]} components — array of component state objects
 * @param {object[]} wires — array of wire objects {startPinId, endPinId}
 * @returns {{ resolvedNodeMap: Map, numNodes: number, extraVarMap: Map, mnaSize: number, groundExists: boolean }}
 */
export function buildTopology(components, wires) {
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
    // Merge nodeB into nodeA: remap all pins that had nodeB
    for (const [pinId, n] of pinToNode.entries()) {
      if (n === nodeB) pinToNode.set(pinId, nodeA);
    }
    return nodeA;
  };

  // Assign a node to every pin
  components.forEach(c => {
    c.pins.forEach(p => getOrAssignNode(p.id));
  });

  // Merge nodes connected by wires
  wires.forEach(w => {
    const nStart = getOrAssignNode(w.startPinId);
    const nEnd = getOrAssignNode(w.endPinId);
    mergeNodes(nStart, nEnd);
  });

  // Merge all GROUND component pins into a single ground node
  const groundPins = [];
  components.forEach(c => {
    if (c.type === 'GROUND' && c.pins.length > 0) {
      groundPins.push(c.pins[0].id);
    }
  });

  let groundOriginalNode = null;
  if (groundPins.length > 0) {
    groundOriginalNode = getOrAssignNode(groundPins[0]);
    for (let i = 1; i < groundPins.length; i++) {
      mergeNodes(groundOriginalNode, getOrAssignNode(groundPins[i]));
    }
  }

  const uniqueNodes = Array.from(new Set(pinToNode.values()));

  // If no explicit ground, use first node
  if (groundOriginalNode === null && uniqueNodes.length > 0) {
    groundOriginalNode = uniqueNodes[0];
  }

  const groundExists = groundOriginalNode !== null;

  // Build final MNA node index map: ground → 0, others → 1..numNodes
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

  // Allocate extra variable slots (e.g., voltage source branch currents)
  let totalExtraVars = 0;
  const extraVarMap = new Map(); // comp.id → array of MNA indices

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

  // Build resolved node map: pinId → MNA index (0 = ground)
  const resolvedNodeMap = new Map();
  pinToNode.forEach((originalNode, pinId) => {
    resolvedNodeMap.set(pinId, finalNodeMap.get(originalNode));
  });

  return { resolvedNodeMap, numNodes, extraVarMap, mnaSize, groundExists };
}
