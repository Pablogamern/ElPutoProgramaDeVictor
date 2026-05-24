export interface IntersectionNode {
  id: string;
  name: string;
  x: number; // canvas coordinate X (0-1000)
  y: number; // canvas coordinate Y (0-1000)
  lat: number; // simulated geographical latitude
  lng: number; // simulated geographical longitude
  isHistoricCenter: boolean;
}

export type StreetDirection = 'E_TO_W' | 'W_TO_E' | 'N_TO_S' | 'S_TO_N' | 'BIDIRECTIONAL';

export interface StreetEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  streetName: string;
  direction: StreetDirection;
  maxWeightTons: number; // restriction for heavy trucks
  maxHeightMeters: number; // restriction for high trucks
  isCobblestone: boolean; // slow down factor
  baseDistanceMeters: number;
}

export type TruckId = 'TURBO' | 'SENCILLO' | 'DOBLE_TROQUE' | 'TRACTOMULA';

export interface TruckConfig {
  id: TruckId;
  name: string;
  description: string;
  maxWeightTons: number; // physical weight
  heightMeters: number; // physical height
  lengthMeters: number;
  averageSpeedKmh: number;
  color: string;
  capacityLabel: string;
}

export interface RouteResult {
  nodeIds: string[];
  edges: StreetEdge[];
  totalDistanceMeters: number;
  totalTimeSeconds: number;
  instructions: TurnInstruction[];
  highFidelityPath?: { lat: number; lng: number }[];
  gScores?: Record<string, number>;
  hScores?: Record<string, number>;
  fScores?: Record<string, number>;
  expandedNodesCount?: number;
}

export interface TurnInstruction {
  action: 'START' | 'STRAIGHT' | 'LEFT' | 'RIGHT' | 'ARRIVE';
  streetName: string;
  description: string;
  distance: number;
}

export interface SimulationState {
  currentPosition: { x: number; y: number };
  currentNodeIndex: number;
  headingAngle: number; // in degrees, for truck rotation
  speedKmh: number;
  isBlinkingLeft: boolean;
  isBlinkingRight: boolean;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'ARRIVED' | 'WARNING';
  warningMessage?: string;
  progressPercent: number; // 0 to 100
}

export interface TrafficConfig {
  multiplier: number; // 1.0 = normal, 1.5 = high traffic, 0.8 = low traffic
  level: 'LOW' | 'MEDIUM' | 'HIGH';
}
