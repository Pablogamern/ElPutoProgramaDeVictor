import { IntersectionNode, StreetEdge, RouteResult, TurnInstruction, TruckConfig } from '../types';
import { INTERSECTION_NODES, STREET_EDGES } from '../data/streets';

/**
 * Normalizes an angle in radians to [-PI, PI]
 */
function normalizeAngle(angle: number): number {
  while (angle <= -Math.PI) angle += 2 * Math.PI;
  while (angle > Math.PI) angle -= 2 * Math.PI;
  return angle;
}

/**
 * Calculates absolute heading change in degrees between three consecutive intersection points.
 * 0 deg means moving perfectly straight. 90 deg means a perpendicular turn.
 * 180 deg means a complete U-turn or backward double-track.
 */
function getTurnAngleDeg(fromNode: IntersectionNode, midNode: IntersectionNode, toNode: IntersectionNode): number {
  const v1x = midNode.x - fromNode.x;
  const v1y = midNode.y - fromNode.y;
  const v2x = toNode.x - midNode.x;
  const v2y = toNode.y - midNode.y;

  const angle1 = Math.atan2(v1y, v1x);
  const angle2 = Math.atan2(v2y, v2x);

  const diff = normalizeAngle(angle2 - angle1);
  return Math.abs((diff * 180) / Math.PI);
}

/**
 * Calculates Euclidean Heuristic distance in meters between two node IDs.
 */
function getAStarHeuristic(fromNodeId: string, toNodeId: string): number {
  const fromNode = INTERSECTION_NODES.find(n => n.id === fromNodeId);
  const toNode = INTERSECTION_NODES.find(n => n.id === toNodeId);
  if (!fromNode || !toNode) return 0;
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  return Math.sqrt(dx * dx + dy * dy) * 1.5; // Scale match to real-world block sizes
}

/**
 * Calculates the legal shortest path for a truck in Popayán using the A* (A-Star) Algorithm.
 * Returns null if no legal route exists (due to constraints or disconnected nodes).
 */
export function calculateTruckRoute(
  startNodeId: string,
  endNodeId: string,
  truck: TruckConfig,
  trafficLevel: 'LOW' | 'MEDIUM' | 'HIGH'
): RouteResult | null {
  if (startNodeId === endNodeId) {
    return {
      nodeIds: [startNodeId],
      edges: [],
      totalDistanceMeters: 0,
      totalTimeSeconds: 0,
      instructions: [{ action: 'ARRIVE', streetName: 'Destino', description: 'Has llegado a tu destino.', distance: 0 }]
    };
  }

  // 1. Initialize A* structures
  const gScores: Record<string, number> = {};
  const hScores: Record<string, number> = {};
  const fScores: Record<string, number> = {};
  const prevNodes: Record<string, string | null> = {};
  const prevEdges: Record<string, StreetEdge | null> = {};

  INTERSECTION_NODES.forEach(node => {
    gScores[node.id] = Infinity;
    hScores[node.id] = getAStarHeuristic(node.id, endNodeId);
    fScores[node.id] = Infinity;
    prevNodes[node.id] = null;
    prevEdges[node.id] = null;
  });

  gScores[startNodeId] = 0;
  fScores[startNodeId] = hScores[startNodeId];

  const openSet = new Set<string>([startNodeId]);
  const closedSet = new Set<string>();

  while (openSet.size > 0) {
    // Extract node with smallest fScore
    let currentId = '';
    let minF = Infinity;
    for (const nodeId of openSet) {
      if (fScores[nodeId] < minF) {
        minF = fScores[nodeId];
        currentId = nodeId;
      }
    }

    if (currentId === '') break; // Unreachable

    if (currentId === endNodeId) break; // Reached goal!

    openSet.delete(currentId);
    closedSet.add(currentId);

    const uNode = INTERSECTION_NODES.find(n => n.id === currentId)!;

    // Explore neighbors of currentId
    const outEdges = STREET_EDGES.filter(e => e.fromNodeId === currentId);

    for (const edge of outEdges) {
      const neighborId = edge.toNodeId;
      if (closedSet.has(neighborId)) continue;

      // RULE ENFORCEMENT: Check if the truck can legally traverse this edge
      if (truck.maxWeightTons > edge.maxWeightTons) {
        continue; // BLOCKED: Weight limit exceeded
      }
      if (truck.heightMeters > edge.maxHeightMeters) {
        continue; // BLOCKED: Height clearance insufficient
      }

      let turnPenalty = 0;
      const incomingEdge = prevEdges[currentId];
      const prevNodeId = prevNodes[currentId];

      // 1. Street name change penalty
      if (incomingEdge && incomingEdge.streetName !== edge.streetName) {
        // Keeps the truck driving consistently on the same street unless turning is required
        turnPenalty += 250;
      }

      // 2. Physical, geometric turn penalty based on heading angles
      if (prevNodeId && incomingEdge) {
        const fromNode = INTERSECTION_NODES.find(n => n.id === prevNodeId);
        const toNode = INTERSECTION_NODES.find(n => n.id === neighborId);
        if (fromNode && toNode) {
          const angleDiff = getTurnAngleDeg(fromNode, uNode, toNode);

          if (angleDiff > 30) {
            // Scale turning difficulty with truck size
            let baseTurnCost = 400;
            if (truck.id === 'TURBO') baseTurnCost = 300;
            else if (truck.id === 'SENCILLO') baseTurnCost = 650;
            else if (truck.id === 'DOBLE_TROQUE') baseTurnCost = 1500;
            else if (truck.id === 'TRACTOMULA') baseTurnCost = 3000;

            if (angleDiff > 110) {
              // Extremely sharp turn / backtrack / U-turn is highly prohibited!
              turnPenalty += 40000;
            } else {
              // Normal turn proportional to the angle severity
              turnPenalty += baseTurnCost * (angleDiff / 90.0);
            }

            // 3. Winding / Zig-Zag Detector:
            // Checks if a turn was also made on the preceding intersection.
            const firstPrevNodeId = prevNodes[prevNodeId];
            if (firstPrevNodeId) {
              const firstPrevNode = INTERSECTION_NODES.find(n => n.id === firstPrevNodeId);
              const secondPrevNode = INTERSECTION_NODES.find(n => n.id === prevNodeId);
              if (firstPrevNode && secondPrevNode) {
                const prevAngleDiff = getTurnAngleDeg(firstPrevNode, secondPrevNode, uNode);
                if (prevAngleDiff > 30) {
                  // Heavy penalty for winding left-right-left turns consecutively
                  turnPenalty += 2500;
                }
              }
            }
          }
        }
      }

      const tentativeG = gScores[currentId] + edge.baseDistanceMeters + turnPenalty;
      if (tentativeG < gScores[neighborId]) {
        prevNodes[neighborId] = currentId;
        prevEdges[neighborId] = edge;
        gScores[neighborId] = tentativeG;
        fScores[neighborId] = tentativeG + hScores[neighborId];
        openSet.add(neighborId);
      }
    }
  }

  // If destination remains Infinity, there is no legal path
  if (gScores[endNodeId] === Infinity) {
    return null;
  }

  // 2. Reconstruct path
  const pathNodeIds: string[] = [];
  const pathEdges: StreetEdge[] = [];
  
  let currNodeId: string | null = endNodeId;
  while (currNodeId !== null) {
    pathNodeIds.unshift(currNodeId);
    const edge = prevEdges[currNodeId];
    if (edge) {
      pathEdges.unshift(edge);
    }
    currNodeId = prevNodes[currNodeId];
  }

  // 3. Calculate distance and estimated travel time with local and traffic factors
  let totalDistanceMeters = 0;
  let totalTimeSeconds = 0;

  // Let's configure traffic and road speed modifiers:
  const trafficFactors = { LOW: 0.85, MEDIUM: 1.25, HIGH: 2.0 };
  const trafficFactor = trafficFactors[trafficLevel];

  pathEdges.forEach(edge => {
    totalDistanceMeters += edge.baseDistanceMeters;

    // Speeds are in km/h. Convert to m/s.
    let speedMs = (truck.averageSpeedKmh * 1000) / 3600;

    // Popayán factors:
    // Historic cobblestones reduce speed by 35% for trucks!
    if (edge.isCobblestone) {
      speedMs *= 0.65;
    }

    // App traffic multiplier factor
    const segmentTime = (edge.baseDistanceMeters / speedMs) * trafficFactor;
    totalTimeSeconds += segmentTime;
  });

  // Round results
  totalTimeSeconds = Math.round(totalTimeSeconds);

  // 4. Generate Google Maps-style turn-by-turn navigation instructions
  const instructions: TurnInstruction[] = [];
  
  if (pathEdges.length > 0) {
    instructions.push({
      action: 'START',
      streetName: pathEdges[0].streetName,
      description: `Inicia convoy por ${pathEdges[0].streetName} con rumbo a tu destino.`,
      distance: pathEdges[0].baseDistanceMeters
    });

    for (let i = 0; i < pathEdges.length - 1; i++) {
      const edgeCurrent = pathEdges[i];
      const edgeNext = pathEdges[i + 1];

      // Grab node positions to find angles
      const nodeA = INTERSECTION_NODES.find(n => n.id === edgeCurrent.fromNodeId)!;
      const nodeB = INTERSECTION_NODES.find(n => n.id === edgeCurrent.toNodeId)!;
      const nodeC = INTERSECTION_NODES.find(n => n.id === edgeNext.toNodeId)!;

      // Find current heading vector
      const vCurrentX = nodeB.x - nodeA.x;
      const vCurrentY = nodeB.y - nodeA.y;
      const angleCurrent = Math.atan2(vCurrentY, vCurrentX);

      // Find next heading vector
      const vNextX = nodeC.x - nodeB.x;
      const vNextY = nodeC.y - nodeB.y;
      const angleNext = Math.atan2(vNextY, vNextX);

      // Delta angle
      const deltaRad = normalizeAngle(angleNext - angleCurrent);
      const deltaDeg = (deltaRad * 180) / Math.PI;

      let action: 'STRAIGHT' | 'LEFT' | 'RIGHT' = 'STRAIGHT';
      let description = '';

      if (Math.abs(deltaDeg) < 25) {
        // Just straight
        action = 'STRAIGHT';
        description = `Continúa derecho por ${edgeNext.streetName}.`;
      } else if (deltaDeg > 0) {
        // Positive angle difference means curving clockwise -> since down-y is positive, this is a right turn!
        action = 'RIGHT';
        description = `Gira a la derecha en la esquina hacia la ${edgeNext.streetName}.`;
      } else {
        // Negative angle difference -> left turn!
        action = 'LEFT';
        description = `Gira a la izquierda en la esquina hacia la ${edgeNext.streetName}.`;
      }

      instructions.push({
        action,
        streetName: edgeNext.streetName,
        description,
        distance: edgeNext.baseDistanceMeters
      });
    }

    instructions.push({
      action: 'ARRIVE',
      streetName: pathEdges[pathEdges.length - 1].streetName,
      description: 'Has llegado de forma segura al punto de entrega.',
      distance: 0
    });
  }

  return {
    nodeIds: pathNodeIds,
    edges: pathEdges,
    totalDistanceMeters,
    totalTimeSeconds,
    instructions,
    gScores,
    hScores,
    fScores,
    expandedNodesCount: closedSet.size
  };
}

/**
 * Returns a readable string for distances (e.g. "1.2 km" or "320 m")
 */
export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${meters} m`;
}

/**
 * Returns a readable string for times (e.g. "15 min 20 s")
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins} min ${secs} s`;
  }
  return `${secs} s`;
}
