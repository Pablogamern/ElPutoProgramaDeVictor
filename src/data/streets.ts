import { IntersectionNode, StreetEdge, TruckConfig } from '../types';

// Popayán Grid Layout:
// X Coordinate maps to Carreras (East to West - Carrera 3 is East, Carrera 15 is West)
// Y Coordinate maps to Calles (North to South - Calle 2 is North, Calle 10 is South)
//
// Carreras (X coordinate anchors):
// K3  = 100  (Zona de Belén/Oriente)
// K4  = 180
// K5  = 260
// K6  = 340  (Borde Oriental del Parque Caldas)
// K7  = 420  (Borde Occidental del Parque Caldas)
// K8  = 500
// K9  = 580
// K10 = 660  (Límite Occidente del Centro Histórico)
// K11 = 740  (Zona de Transición)
// K15 = 880  (Avenida Panamericana - Autopista Principal)
//
// Calles (Y coordinate anchors):
// C2  = 100  (Norte - Cerca al Puente del Humilladero / El Morro)
// C3  = 180
// C4  = 260
// C5  = 340  (Eje Principal - Calle 5)
// C6  = 420
// C7  = 500
// C8  = 580  (Eje Secundario - Calle 8)
// C9  = 660
// C10 = 740  (Sur - Salida al Tambo / Huila)

export const CARRERA_MAP: Record<string, number> = {
  'K1': 20,
  'K2': 60,
  'K3': 100,
  'K4': 180,
  'K5': 260,
  'K6': 340,
  'K7': 420,
  'K8': 500,
  'K9': 580,
  'K10': 660,
  'K11': 740,
  'K12': 820,
  'K13': 900,
  'K14': 980,
  'K15': 1060, // Avenida Panamericana
  'K16': 1140,
  'K17': 1220,
  'K18': 1300,
  'K19': 1380,
  'K20': 1460,
  'K21': 1540,
  'K22': 1620,
  'K23': 1700,
  'K24': 1780,
  'K25': 1860,
};

export const CALLE_MAP: Record<string, number> = {
  'C1': 40,
  'C2': 100,
  'C3': 180,
  'C4': 260,
  'C5': 340,
  'C6': 420,
  'C7': 500,
  'C8': 580,
  'C9': 660,
  'C10': 740,
  'C11': 820,
  'C12': 900,
  'C13': 980,
  'C14': 1060,
  'C15': 1140,
  'C16': 1220,
  'C17': 1300,
  'C18': 1380,
  'C19': 1460,
  'C20': 1540,
};

// Map real coordinate bounds of Popayán for realism:
// Popayán Center (Parque Caldas): ~2.44185° N, -76.60638° W
const BASE_LAT = 2.44185;
const BASE_LNG = -76.60638;

export const SPACING_LAT = 0.0016;
export const SPACING_LNG = 0.0014;

export const INTERSECTION_NODES: IntersectionNode[] = [];

// Generate grid nodes
Object.entries(CARRERA_MAP).forEach(([kKey, xVal]) => {
  Object.entries(CALLE_MAP).forEach(([cKey, yVal]) => {
    // Determine if it is in the Historic Center:
    // Defined as Carreras 3 to 8, Calles 3 to 8
    const kNum = parseInt(kKey.replace('K', ''));
    const cNum = parseInt(cKey.replace('C', ''));
    
    // Check if the node is part of the historic grid
    const isHistoricCenter = kNum >= 3 && kNum <= 8 && cNum >= 3 && cNum <= 8;

    // Align the virtual space to real-world GPS coordinates
    const lat = BASE_LAT - (cNum - 5) * SPACING_LAT;
    const lng = BASE_LNG - (kNum - 6) * SPACING_LNG;

    INTERSECTION_NODES.push({
      id: `${kKey}_${cKey}`,
      name: `Carrera ${kNum} con Calle ${cNum}`,
      x: xVal,
      y: yVal,
      lat,
      lng,
      isHistoricCenter,
    });
  });
});

// Export historic center bounds dynamically
const hLats = INTERSECTION_NODES.filter(n => n.isHistoricCenter).map(n => n.lat);
const hLngs = INTERSECTION_NODES.filter(n => n.isHistoricCenter).map(n => n.lng);
export const HISTORIC_CENTER_BOUNDS = {
  minLat: Math.min(...hLats),
  maxLat: Math.max(...hLats),
  minLng: Math.min(...hLngs),
  maxLng: Math.max(...hLngs)
};

// Define key landmarks in Popayán with their nearest node or custom map coordinates
export interface Landmark {
  name: string;
  description: string;
  x: number;
  y: number;
  emoji: string;
  nodeId: string;
}

export const POPAYAN_LANDMARKS: Landmark[] = [
  {
    name: "Parque Caldas",
    description: "Parque principal de la ciudad de Popayán, rodeado de templos coloniales, la Catedral y la emblemática Torre del Reloj.",
    x: (CARRERA_MAP['K6'] + CARRERA_MAP['K7']) / 2,
    y: (CALLE_MAP['C4'] + CALLE_MAP['C5']) / 2,
    emoji: "⛪",
    nodeId: "K6_C4",
  },
  {
    name: "Puente del Humilladero",
    description: "Monumento histórico construido en ladrillo y calicanto para facilitar el acceso de cargueros y bueyes sobre el Río Molino.",
    x: CARRERA_MAP['K3'] - 20,
    y: CALLE_MAP['C2'] - 30,
    emoji: "🌉",
    nodeId: "K3_C2",
  },
  {
    name: "El Morro de Tulcán",
    description: "Sitio arqueológico sagrado, antigua pirámide truncada construida por indígenas precolombinos. Excelente vista de Popayán.",
    x: CARRERA_MAP['K4'],
    y: CALLE_MAP['C2'] - 50,
    emoji: "⛰️",
    nodeId: "K4_C2",
  },
  {
    name: "Terminal de Transportes",
    description: "Terminal de buses y centro de acopio de carga principal en el occidente de Popayán, junto a la Vía Panamericana.",
    x: CARRERA_MAP['K15'] + 40,
    y: CALLE_MAP['C5'],
    emoji: "🛞",
    nodeId: "K15_C5",
  },
  {
    name: "Templo de San Francisco",
    description: "La iglesia más grande de Popayán, famosa por albergar el campanario con la campana de San Antonio y sus bellas tallas.",
    x: CARRERA_MAP['K9'],
    y: CALLE_MAP['C4'],
    emoji: "⛪",
    nodeId: "K9_C4",
  },
  {
    name: "Santuario de Belén",
    description: "Iglesia ubicada en la cima del cerro tutelar de Belén, al oriente. Punto de devoción del Santo Ecce Homo.",
    x: CARRERA_MAP['K3'] - 65,
    y: CALLE_MAP['C5'],
    emoji: "⛪",
    nodeId: "K3_C5",
  },
  {
    name: "Centro Comercial Campanario",
    description: "El centro comercial principal de la ciudad, ubicado de manera estratégica sobre la Avenida Panamericana al norte.",
    x: CARRERA_MAP['K15'] + 30,
    y: CALLE_MAP['C1'] - 10,
    emoji: "🏢",
    nodeId: "K15_C1",
  },
  {
    name: "Hospital San José",
    description: "Hospital Universitario principal del Cauca de alta complejidad sanitaria, al norte de la urbe.",
    x: CARRERA_MAP['K11'] - 10,
    y: CALLE_MAP['C3'],
    emoji: "🏥",
    nodeId: "K11_C3",
  },
  {
    name: "Universidad del Cauca (Santo Domingo)",
    description: "Claustro histórico principal y centro académico de gran prestigio nacional fundado en 1827.",
    x: CARRERA_MAP['K5'] + 10,
    y: CALLE_MAP['C4'] + 20,
    emoji: "🎓",
    nodeId: "K5_C4",
  }
];

export const TRUCK_CONFIGS: TruckConfig[] = [
  {
    id: 'TURBO',
    name: 'Camión Turbo',
    description: 'Camión ligero de reparto urbano. Ideal para el centro histórico. Acceso permitido.',
    maxWeightTons: 4.5,
    heightMeters: 2.7,
    lengthMeters: 5.5,
    averageSpeedKmh: 35,
    color: '#4ade80', // green
    capacityLabel: 'Hasta 3.5 Toneladas',
  },
  {
    id: 'SENCILLO',
    name: 'Camión Sencillo',
    description: 'Camión mediano de un eje. Tiene restricciones parciales en el Centro Histórico en horas pico.',
    maxWeightTons: 9.0,
    heightMeters: 3.1,
    lengthMeters: 8.5,
    averageSpeedKmh: 28,
    color: '#3b82f6', // blue
    capacityLabel: 'Hasta 8 Toneladas',
  },
  {
    id: 'DOBLE_TROQUE',
    name: 'Doble Troque',
    description: 'Camión pesado de dos ejes traseros. PROHIBIDO entrar al Centro Histórico (Límite 5 Toneladas).',
    maxWeightTons: 18.0,
    heightMeters: 3.6,
    lengthMeters: 10.0,
    averageSpeedKmh: 22,
    color: '#f59e0b', // amber
    capacityLabel: 'Hasta 16 Toneladas',
  },
  {
    id: 'TRACTOMULA',
    name: 'Tractomula / Camión Articulado',
    description: 'Vehículo articulado de carga nacional. PROHIBIDO en Centro Histórico. Altura máxima restringida.',
    maxWeightTons: 35.0,
    heightMeters: 4.2,
    lengthMeters: 16.5,
    averageSpeedKmh: 18,
    color: '#ef4444', // red
    capacityLabel: 'Hasta 32 Toneladas',
  }
];

// Generate Directed Street Edges
// Respecting layout flow (sentido de las vías)
const edgesList: StreetEdge[] = [];
let edgeCounter = 1;

// Define helper to get names
function getStreetName(cNum: number): string {
  if (cNum === 5) return 'Calle 5 (Eje Principal)';
  if (cNum === 8) return 'Calle 8 (Av. del Libertador)';
  if (cNum === 15) return 'Calle 15 (Av. de la Independencia)';
  return `Calle ${cNum}`;
}

function getCarreraName(kNum: number): string {
  if (kNum === 15) return 'Avenida Panamericana (Carrera 15)';
  if (kNum === 9) return 'Avenida Belalcázar (Carrera 9)';
  if (kNum === 11) return 'Avenida del Tolima (Carrera 11)';
  if (kNum === 6) return 'Carrera 6 (Parque Caldas)';
  return `Carrera ${kNum}`;
}

// Define helper to add edges
function addEdge(
  fromNodeId: string, 
  toNodeId: string, 
  streetName: string, 
  direction: 'E_TO_W' | 'W_TO_E' | 'N_TO_S' | 'S_TO_N' | 'BIDIRECTIONAL'
) {
  const fromNode = INTERSECTION_NODES.find(n => n.id === fromNodeId);
  const toNode = INTERSECTION_NODES.find(n => n.id === toNodeId);
  if (!fromNode || !toNode) return;

  // Calculate distance based on coordinate differences (scaled space to meters)
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const pixelDist = Math.sqrt(dx * dx + dy * dy);
  const baseDistanceMeters = Math.round(pixelDist * 1.5); // scale factor for realistic block lengths (80-120m)

  const isEdgeInHistoric = fromNode.isHistoricCenter && toNode.isHistoricCenter;
  
  // Set restrictions for historic center:
  // Height: 3.0m in historic center (cables, colonial roofs), 5.0m elsewhere
  // Weight: 5.0T in historic center, 40.0T elsewhere
  const maxWeightTons = isEdgeInHistoric ? 5.0 : 40.0;
  const maxHeightMeters = isEdgeInHistoric ? 3.0 : 5.0;
  const isCobblestone = isEdgeInHistoric; // historic center streets have cobblestones (empedradas)

  if (direction === 'BIDIRECTIONAL') {
    edgesList.push({
      id: `E_${edgeCounter++}`,
      fromNodeId,
      toNodeId,
      streetName,
      direction: 'BIDIRECTIONAL',
      maxWeightTons,
      maxHeightMeters,
      isCobblestone,
      baseDistanceMeters,
    });
    edgesList.push({
      id: `E_${edgeCounter++}`,
      fromNodeId: toNodeId,
      toNodeId: fromNodeId,
      streetName,
      direction: 'BIDIRECTIONAL',
      maxWeightTons,
      maxHeightMeters,
      isCobblestone,
      baseDistanceMeters,
    });
  } else {
    // Correct one-way flow mapping
    let startId = fromNodeId;
    let endId = toNodeId;

    if (direction === 'W_TO_E' || direction === 'S_TO_N') {
      // Flip edge flow direction because the loops move in ascending order (E to W or N to S)
      startId = toNodeId;
      endId = fromNodeId;
    }

    edgesList.push({
      id: `E_${edgeCounter++}`,
      fromNodeId: startId,
      toNodeId: endId,
      streetName,
      direction,
      maxWeightTons,
      maxHeightMeters,
      isCobblestone,
      baseDistanceMeters,
    });
  }
}

// 1. Create Horizontal Calles (East to West)
const carrerasKeys = [
  'K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7', 'K8', 'K9', 'K10', 
  'K11', 'K12', 'K13', 'K14', 'K15', 'K16', 'K17', 'K18', 'K19', 'K20',
  'K21', 'K22', 'K23', 'K24', 'K25'
];
const callesKeys = [
  'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10',
  'C11', 'C12', 'C13', 'C14', 'C15', 'C16', 'C17', 'C18', 'C19', 'C20'
];

callesKeys.forEach(cKey => {
  const cNum = parseInt(cKey.replace('C', ''));
  let direction: 'E_TO_W' | 'W_TO_E' | 'BIDIRECTIONAL' = 'BIDIRECTIONAL';

  if (cNum === 5 || cNum === 8 || cNum === 10 || cNum === 15 || cNum === 20) {
    // Major bidirectional arterials
    direction = 'BIDIRECTIONAL';
  } else if (cNum % 2 === 1) {
    // Odd calles go East-to-West
    direction = 'E_TO_W';
  } else {
    // Even calles go West-to-East
    direction = 'W_TO_E';
  }

  // Connect along Carrera grid keys
  for (let i = 0; i < carrerasKeys.length - 1; i++) {
    const fromK = carrerasKeys[i];
    const toK = carrerasKeys[i+1];
    
    const nodeA = `${fromK}_${cKey}`;
    const nodeB = `${toK}_${cKey}`;
    
    addEdge(nodeA, nodeB, getStreetName(cNum), direction);
  }
});

// 2. Create Vertical Carreras (North to South)
carrerasKeys.forEach(kKey => {
  const kNum = parseInt(kKey.replace('K', ''));
  let direction: 'N_TO_S' | 'S_TO_N' | 'BIDIRECTIONAL' = 'BIDIRECTIONAL';

  if (kNum === 15 || kNum === 11 || kNum === 9 || kNum === 1) {
    // Major bidirectional avenues
    direction = 'BIDIRECTIONAL';
  } else if (kNum % 2 === 1) {
    // Odd Carreras go North-to-South
    direction = 'N_TO_S';
  } else {
    // Even Carreras go South-to-North
    direction = 'S_TO_N';
  }

  // Connect along Calle grid keys
  for (let j = 0; j < callesKeys.length - 1; j++) {
    const fromC = callesKeys[j];
    const toC = callesKeys[j+1];

    const nodeA = `${kKey}_${fromC}`;
    const nodeB = `${kKey}_${toC}`;

    addEdge(nodeA, nodeB, getCarreraName(kNum), direction);
  }
});

export const STREET_EDGES = edgesList;
