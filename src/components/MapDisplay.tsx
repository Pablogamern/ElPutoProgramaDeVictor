import { useState, useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  INTERSECTION_NODES, 
  STREET_EDGES, 
  POPAYAN_LANDMARKS, 
  CARRERA_MAP, 
  CALLE_MAP,
  HISTORIC_CENTER_BOUNDS
} from '../data/streets';
import { RouteResult, TruckConfig, StreetEdge } from '../types';
import { 
  Compass, 
  Flag, 
  MapPin, 
  HelpCircle, 
  AlertTriangle, 
  Activity, 
  Volume2, 
  VolumeX 
} from 'lucide-react';

interface MapDisplayProps {
  startNodeId: string | null;
  endNodeId: string | null;
  onNodeSelect: (nodeId: string, role: 'START' | 'END') => void;
  route: RouteResult | null;
  truck: TruckConfig;
  isSimulating: boolean;
  onSimulationFinished: () => void;
  trafficLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  playbackSpeed: number; // 1x, 2x, 4x
}

export default function MapDisplay({
  startNodeId,
  endNodeId,
  onNodeSelect,
  route,
  truck,
  isSimulating,
  onSimulationFinished,
  trafficLevel,
  playbackSpeed
}: MapDisplayProps) {
  // Blinker sound state
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Simulation position states in Cartesian (for backward compatibility / references)
  const [truckPos, setTruckPos] = useState<{ x: number; y: number } | null>(null);
  // Real GPS coordinate state for the Leaflet Marker
  const [truckLatLng, setTruckLatLng] = useState<{ lat: number; lng: number } | null>(null);

  const [nodeIndex, setNodeIndex] = useState(0); // Index of segment in route
  const [progressT, setProgressT] = useState(0); // Progress along current segment (0 to 1)
  const [heading, setHeading] = useState(0); // Degrees of rotation

  // Blinker states
  const [isBlinkingLeft, setIsBlinkingLeft] = useState(false);
  const [isBlinkingRight, setIsBlinkingRight] = useState(false);
  const [blinkerPhase, setBlinkerPhase] = useState(false);

  // Log notifications for dashboard feed
  const [logs, setLogs] = useState<string[]>([]);

  // Keep references to prevent out of sync effects
  const soundRef = useRef(soundEnabled);
  useEffect(() => {
    soundRef.current = soundEnabled;
  }, [soundEnabled]);

  // Handle sound generation for turn signals
  const playBlinkerClick = () => {
    if (!soundRef.current) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(650, audioCtx.currentTime); // Blinker frequency
      
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } catch {
      // Audio engine not allowed or failed, ignore gracefully
    }
  };

  // Add a message to dispatch logs
  const addLog = (message: string) => {
    setLogs(prev => [
      `[${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}] ${message}`, 
      ...prev.slice(0, 5)
    ]);
  };

  // Blink indicator phase effect
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isSimulating && (isBlinkingLeft || isBlinkingRight)) {
      interval = setInterval(() => {
        setBlinkerPhase(p => {
          const next = !p;
          if (next) {
            playBlinkerClick();
          }
          return next;
        });
      }, 350); // Blink rhythm (~140 blinks/min)
    } else {
      setBlinkerPhase(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isSimulating, isBlinkingLeft, isBlinkingRight]);

  // Restart positioning when route or start node changes or simulation ends
  useEffect(() => {
    if (!isSimulating) {
      if (startNodeId) {
        const startNode = INTERSECTION_NODES.find(n => n.id === startNodeId);
        if (startNode) {
          setTruckPos({ x: startNode.x, y: startNode.y });
          setTruckLatLng({ lat: startNode.lat, lng: startNode.lng });
          setNodeIndex(0);
          setProgressT(0);
          setHeading(0);
          setIsBlinkingLeft(false);
          setIsBlinkingRight(false);
        }
      } else {
        setTruckPos(null);
        setTruckLatLng(null);
      }
    }
  }, [startNodeId, route, isSimulating]);

  // Active Simulation Loop
  useEffect(() => {
    if (!isSimulating || !route) return;

    // Build the high fidelity coordinates array to traverse. Use OSRM path or build fallback Dijkstra sequence
    const pathPoints: { lat: number; lng: number }[] = [];
    if (route.highFidelityPath && route.highFidelityPath.length > 0) {
      route.highFidelityPath.forEach(pt => {
        pathPoints.push({ lat: pt.lat, lng: pt.lng });
      });
    } else {
      route.nodeIds.forEach(id => {
        const node = INTERSECTION_NODES.find(n => n.id === id);
        if (node) {
          pathPoints.push({ lat: node.lat, lng: node.lng });
        }
      });
    }

    if (pathPoints.length < 2) return;

    let animFrameId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const deltaMs = now - lastTime;
      lastTime = now;

      // Safe bounds check
      if (nodeIndex >= pathPoints.length - 1) {
        onSimulationFinished();
        addLog(`🚚 Entrega exitosa. El camión ha estacionado en el destino.`);
        return;
      }

      const fromPt = pathPoints[nodeIndex];
      const toPt = pathPoints[nodeIndex + 1];

      // Calculate travel constants
      let speedKmh = truck.averageSpeedKmh;

      // Dynamic historic center slow-down detection
      const inHistoric = (fromPt.lat >= HISTORIC_CENTER_BOUNDS.minLat && fromPt.lat <= HISTORIC_CENTER_BOUNDS.maxLat &&
                          fromPt.lng >= HISTORIC_CENTER_BOUNDS.minLng && fromPt.lng <= HISTORIC_CENTER_BOUNDS.maxLng) ||
                         (toPt.lat >= HISTORIC_CENTER_BOUNDS.minLat && toPt.lat <= HISTORIC_CENTER_BOUNDS.maxLat &&
                          toPt.lng >= HISTORIC_CENTER_BOUNDS.minLng && toPt.lng <= HISTORIC_CENTER_BOUNDS.maxLng);

      if (inHistoric) {
        speedKmh *= 0.65;
      }

      const trafficFactors = { LOW: 1.15, MEDIUM: 0.8, HIGH: 0.5 };
      speedKmh *= trafficFactors[trafficLevel];

      // Coordinate distance
      const dLat = toPt.lat - fromPt.lat;
      const dLng = toPt.lng - fromPt.lng;
      const segmentGeoDist = Math.sqrt(dLat * dLat + dLng * dLng);

      // If coordinates are essentially identical, proceed to next step
      if (segmentGeoDist < 0.000005) {
        setNodeIndex(prev => prev + 1);
        setProgressT(0);
        animFrameId = requestAnimationFrame(tick);
        return;
      }

      // Speed in coordinate degrees per millisecond for translation
      const speedMperS = (speedKmh * 1000) / 3600;
      const degPerSec = speedMperS / 111111;
      const degPerMs = degPerSec / 1000;

      // Calculate delta t progress step
      const dt = (degPerMs * deltaMs * playbackSpeed) / segmentGeoDist;

      setProgressT(prev => {
        let nextT = prev + dt;

        if (nextT >= 1.0) {
          // Progressed fully through this segment
          const nextIndex = nodeIndex + 1;
          if (nextIndex >= pathPoints.length - 1) {
            // Reached destination!
            setNodeIndex(nextIndex);
            setTruckLatLng({ lat: toPt.lat, lng: toPt.lng });
            return 1.0;
          } else {
            // Move to next segment
            setNodeIndex(nextIndex);
            
            // Periodically log updates on street trancit using closest landmark node matches
            const currentPosition = pathPoints[nextIndex];
            const closeNode = INTERSECTION_NODES.find(n => {
              const dist = Math.sqrt((n.lat - currentPosition.lat) ** 2 + (n.lng - currentPosition.lng) ** 2);
              return dist < 0.00035; // approx 35 meters
            });

            if (closeNode) {
              const edgeForThisNode = route.edges.find(e => e.fromNodeId === closeNode.id);
              if (edgeForThisNode) {
                const cobbleText = edgeForThisNode.isCobblestone ? " [Acceso Histórico - Empedrado colonial, velocidad reducida]" : "";
                addLog(`Transitando por ${edgeForThisNode.streetName}${cobbleText}`);
              }
            }

            return 0.0;
          }
        }

        // Interpolate current real coordinates
        const curLat = fromPt.lat + dLat * nextT;
        const curLng = fromPt.lng + dLng * nextT;
        setTruckLatLng({ lat: curLat, lng: curLng });

        // Calculate heading degrees based on coordinate changes dLat and dLng
        // dx = dLng, dy = -dLat (accounting for Leaflet Y-axis screen directionality)
        const targetHeading = (Math.atan2(-dLat, dLng) * 180) / Math.PI;
        setHeading(targetHeading);

        // Turn Signal / Blinker Blinker phase controller
        if (nextT >= 0.7 && nodeIndex < pathPoints.length - 2) {
          const nextPt = pathPoints[nodeIndex + 1];
          const nextNextPt = pathPoints[nodeIndex + 2];
          
          const currentAngleRad = Math.atan2(-dLat, dLng);
          const nextAngleRad = Math.atan2(-(nextNextPt.lat - nextPt.lat), nextNextPt.lng - nextPt.lng);

          // Normalize delta angular deviation to (-PI, PI] to prevent indicator jitter
          let diffRad = nextAngleRad - currentAngleRad;
          while (diffRad <= -Math.PI) diffRad += 2 * Math.PI;
          while (diffRad > Math.PI) diffRad -= 2 * Math.PI;

          const diffDeg = (diffRad * 180) / Math.PI;

          if (diffDeg > 15) {
            setIsBlinkingRight(true);
            setIsBlinkingLeft(false);
          } else if (diffDeg < -15) {
            setIsBlinkingLeft(true);
            setIsBlinkingRight(false);
          } else {
            setIsBlinkingLeft(false);
            setIsBlinkingRight(false);
          }
        } else if (nextT < 0.20 && nodeIndex > 0) {
          // Keep active for visual continuity
        } else {
          setIsBlinkingLeft(false);
          setIsBlinkingRight(false);
        }

        return nextT;
      });

      animFrameId = requestAnimationFrame(tick);
    };

    animFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameId);
  }, [isSimulating, route, nodeIndex, trafficLevel, playbackSpeed, truck]);

  // Initial dispatcher welcome log
  useEffect(() => {
    addLog(`Sistema de Gestión de Carga Activo en el Mapa Real de Popayán.`);
    addLog(`Sugerencia: Haz clic en las esquinas o iconos del mapa real para trazar rutas.`);
  }, []);

  // Update logs when route changes
  useEffect(() => {
    if (route) {
      const isBanned = route.nodeIds.some(id => {
        const node = INTERSECTION_NODES.find(n => n.id === id);
        return node?.isHistoricCenter;
      });
      if (truck.id === 'TRACTOMULA' || truck.id === 'DOBLE_TROQUE') {
        addLog(`Ruta óptima trazada bordeando el Centro Histórico para evitar multas de ordenamiento municipal.`);
      } else {
        const routeMsg = `Ruta calculada: ${route.edges[0]?.streetName || ''} hasta ${route.edges[route.edges.length - 1]?.streetName || ''}.`;
        addLog(routeMsg);
      }
    }
  }, [route, truck]);

  // Handle quick selections
  const handleLandmarkClick = (nodeId: string, name: string) => {
    if (isSimulating) return;
    if (!startNodeId || (startNodeId && endNodeId)) {
      onNodeSelect(nodeId, 'START');
      addLog(`Punto de Inicio fijado en landmark: ${name}`);
    } else {
      if (nodeId === startNodeId) return;
      onNodeSelect(nodeId, 'END');
      addLog(`Punto de Destino fijado en landmark: ${name}`);
    }
  };

  // -------------------------------------------------------------
  // LEAFLET MAP INTEGRATION & INTERACTIVITY
  // -------------------------------------------------------------
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const roadNetworkLayerRef = useRef<L.LayerGroup | null>(null);
  const clicksNetworkLayerRef = useRef<L.LayerGroup | null>(null);
  const restrictedAreaPolygonRef = useRef<L.Polygon | null>(null);
  const activeRoutePolylineRef = useRef<L.Polyline | null>(null);
  
  // Marker Refs
  const startMarkerRef = useRef<L.Marker | null>(null);
  const endMarkerRef = useRef<L.Marker | null>(null);
  const truckMarkerRef = useRef<L.Marker | null>(null);
  const landmarksLayerRef = useRef<L.LayerGroup | null>(null);

  // Sync state with mutable refs to keep event listeners fresh
  const reactiveStateRef = useRef({ startNodeId, endNodeId, isSimulating });
  useEffect(() => {
    reactiveStateRef.current = { startNodeId, endNodeId, isSimulating };
  }, [startNodeId, endNodeId, isSimulating]);

  // Map Initialization Effect
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Instantiate map
    const map = L.map(mapContainerRef.current, {
      center: [2.4418, -76.6063], // Popayán central coordinates
      zoom: 15,
      zoomControl: true,
      minZoom: 13,
      maxZoom: 18,
    });

    // High-contrast clean minimalist base layer (CartoDB Positron style)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    mapInstanceRef.current = map;

    // Draw Popayán historic center cargo restriction area polygon:
    // Defined roughly as bounded by Carreras 3 to 8, Calles 3 to 8
    const latlngsHistoric: L.LatLngTuple[] = [
      [HISTORIC_CENTER_BOUNDS.maxLat, HISTORIC_CENTER_BOUNDS.minLng], // Northwest (Carrera 8, Calle 3)
      [HISTORIC_CENTER_BOUNDS.maxLat, HISTORIC_CENTER_BOUNDS.maxLng], // Northeast (Carrera 3, Calle 3)
      [HISTORIC_CENTER_BOUNDS.minLat, HISTORIC_CENTER_BOUNDS.maxLng], // Southeast (Carrera 3, Calle 8)
      [HISTORIC_CENTER_BOUNDS.minLat, HISTORIC_CENTER_BOUNDS.minLng], // Southwest (Carrera 8, Calle 8)
    ];
    
    const restrictedAreaGeo = L.polygon(latlngsHistoric, {
      color: '#f87171',
      weight: 1.5,
      dashArray: '4, 4',
      fillColor: '#ef4444',
      fillOpacity: 0.12,
      interactive: false
    }).addTo(map);
    restrictedAreaPolygonRef.current = restrictedAreaGeo;

    // Create interactive click targets layer for intersection nodes
    const clicksNetworkLayer = L.layerGroup().addTo(map);
    INTERSECTION_NODES.forEach(node => {
      const circleMarker = L.circleMarker([node.lat, node.lng], {
        radius: 12, // generous clicking radius
        fillColor: '#3b82f6',
        fillOpacity: 0.0, // completely transparent by default
        color: 'transparent',
        weight: 1,
        interactive: true
      });

      circleMarker.on('click', () => {
        const { startNodeId: curStart, endNodeId: curEnd, isSimulating: curSim } = reactiveStateRef.current;
        if (curSim) return;

        if (!curStart || (curStart && curEnd)) {
          onNodeSelect(node.id, 'START');
          addLog(`Conductor situado en: ${node.name}`);
        } else {
          if (node.id === curStart) {
            addLog(`¡El destino no puede ser igual al punto de partida!`);
            return;
          }
          onNodeSelect(node.id, 'END');
          addLog(`Punto de entrega trazado: ${node.name}`);
        }
      });

      // Smooth custom visual animations on hover/unhover
      circleMarker.on('mouseover', function() {
        this.setStyle({
          fillColor: '#3b82f6',
          fillOpacity: 0.75,
          color: '#ffffff',
          weight: 2,
          radius: 7
        });
      });

      circleMarker.on('mouseout', function() {
        this.setStyle({
          fillColor: '#3b82f6',
          fillOpacity: 0.0,
          color: 'transparent',
          weight: 1,
          radius: 12
        });
      });

      // Simple hover tip
      circleMarker.bindTooltip(node.name, {
        direction: 'top',
        className: 'bg-slate-900 border-none text-white text-[9.5px] px-1.5 py-0.5 rounded shadow'
      });

      circleMarker.addTo(clicksNetworkLayer);
    });
    clicksNetworkLayerRef.current = clicksNetworkLayer;

    // Add Landmarks Layer with nice Emojis!
    const landmarksLayer = L.layerGroup().addTo(map);
    POPAYAN_LANDMARKS.forEach(land => {
      const node = INTERSECTION_NODES.find(n => n.id === land.nodeId);
      if (node) {
        const lmIcon = L.divIcon({
          html: `
            <div class="hover:scale-115 transition-transform duration-200 cursor-pointer flex flex-col items-center">
              <div class="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-md text-sm">
                ${land.emoji}
              </div>
            </div>
          `,
          className: '',
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const lmMarker = L.marker([node.lat, node.lng], { icon: lmIcon }).addTo(landmarksLayer);
        lmMarker.bindTooltip(`<strong>${land.name}</strong><br/><span style="font-size: 9px; color: #475569;">${land.description.slice(0, 50)}...</span>`, {
          direction: 'top',
          className: 'bg-white border border-slate-100 shadow-lg text-[10.5px] px-2 py-1 rounded max-w-xs'
        });

        lmMarker.on('click', () => {
          handleLandmarkClick(land.nodeId, land.name);
        });
      }
    });
    landmarksLayerRef.current = landmarksLayer;

    // Handle generic map click to fallback locate if near a node
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { startNodeId: curStart, endNodeId: curEnd, isSimulating: curSim } = reactiveStateRef.current;
      if (curSim) return;

      const clickLat = e.latlng.lat;
      const clickLng = e.latlng.lng;

      // Find closest node within generous threshold (~350 meters)
      let closestNode = null;
      let minDistance = 0.0035; // degrees offset

      INTERSECTION_NODES.forEach(node => {
        const dist = Math.sqrt((node.lat - clickLat) ** 2 + (node.lng - clickLng) ** 2);
        if (dist < minDistance) {
          minDistance = dist;
          closestNode = node;
        }
      });

      if (closestNode) {
        const node = closestNode;
        if (!curStart || (curStart && curEnd)) {
          onNodeSelect(node.id, 'START');
          addLog(`Conductor situado en: ${node.name}`);
        } else {
          if (node.id === curStart) {
            addLog(`¡El destino no puede ser igual al punto de partida!`);
            return;
          }
          onNodeSelect(node.id, 'END');
          addLog(`Punto de entrega trazado: ${node.name}`);
        }
      }
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update starting, ending marker and route overlay dynamically on state change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // 1. START MARKER
    if (startNodeId) {
      const node = INTERSECTION_NODES.find(n => n.id === startNodeId);
      if (node) {
        if (!startMarkerRef.current) {
          const sIcon = L.divIcon({
            html: `
              <div class="relative flex items-center justify-center">
                <span class="absolute w-7 h-7 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-xs shadow shadow-emerald-500/50">C</span>
                <span class="absolute w-8 h-8 rounded-full border border-emerald-400 bg-emerald-300/20 animate-ping" style="animation-duration: 2s;"></span>
              </div>
            `,
            className: '',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          startMarkerRef.current = L.marker([node.lat, node.lng], { icon: sIcon, zIndexOffset: 120 }).addTo(map);
        } else {
          startMarkerRef.current.setLatLng([node.lat, node.lng]);
        }
      }
    } else {
      if (startMarkerRef.current) {
        startMarkerRef.current.remove();
        startMarkerRef.current = null;
      }
    }

    // 2. END MARKER
    if (endNodeId) {
      const node = INTERSECTION_NODES.find(n => n.id === endNodeId);
      if (node) {
        if (!endMarkerRef.current) {
          const eIcon = L.divIcon({
            html: `
              <div class="relative flex items-center justify-center">
                <span class="absolute w-7 h-7 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-xs shadow shadow-red-500/50">D</span>
                <span class="absolute w-8 h-8 rounded-full border border-red-400 bg-red-300/20 animate-ping" style="animation-duration: 2s;"></span>
              </div>
            `,
            className: '',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });
          endMarkerRef.current = L.marker([node.lat, node.lng], { icon: eIcon, zIndexOffset: 110 }).addTo(map);
        } else {
          endMarkerRef.current.setLatLng([node.lat, node.lng]);
        }
      }
    } else {
      if (endMarkerRef.current) {
        endMarkerRef.current.remove();
        endMarkerRef.current = null;
      }
    }

    // 3. VEHICLE PATH LINE OVERLAY
    if (route) {
      const coords: L.LatLngTuple[] = [];
      if (route.highFidelityPath && route.highFidelityPath.length > 0) {
        route.highFidelityPath.forEach(pt => {
          coords.push([pt.lat, pt.lng]);
        });
      } else {
        route.nodeIds.forEach(id => {
          const node = INTERSECTION_NODES.find(n => n.id === id);
          if (node) {
            coords.push([node.lat, node.lng]);
          }
        });
      }

      if (coords.length > 0) {
        if (!activeRoutePolylineRef.current) {
          activeRoutePolylineRef.current = L.polyline(coords, {
            color: truck.color,
            weight: 6.5,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round',
          }).addTo(map);
        } else {
          activeRoutePolylineRef.current.setLatLngs(coords);
          activeRoutePolylineRef.current.setStyle({ color: truck.color });
        }
      } else {
        if (activeRoutePolylineRef.current) {
          activeRoutePolylineRef.current.remove();
          activeRoutePolylineRef.current = null;
        }
      }
    } else {
      if (activeRoutePolylineRef.current) {
        activeRoutePolylineRef.current.remove();
        activeRoutePolylineRef.current = null;
      }
    }

    // 4. MOVING TRUCK TELEMETRY TARGET
    if (truckLatLng && isSimulating) {
      const renderBlinkerLeft = isBlinkingLeft && blinkerPhase;
      const renderBlinkerRight = isBlinkingRight && blinkerPhase;

      const truckHtml = `
        <div class="relative w-12 h-8 flex items-center justify-center" style="transform: rotate(${heading}deg); transition: transform 0.1s ease-out;">
          <!-- Wheels -->
          <span class="absolute w-[6px] h-[3.5px] bg-slate-900 rounded-[1px]" style="left: 6px; top: -3px;"></span>
          <span class="absolute w-[6px] h-[3.5px] bg-slate-900 rounded-[1px]" style="left: 6px; bottom: -3px;"></span>
          <span class="absolute w-[6px] h-[3.5px] bg-slate-900 rounded-[1px]" style="right: 6px; top: -3px;"></span>
          <span class="absolute w-[6px] h-[3.5px] bg-slate-900 rounded-[1px]" style="right: 6px; bottom: -3px;"></span>
          
          <!-- Truck Body -->
          <div class="w-10 h-6 rounded bg-slate-800 border-[1.5px] border-white flex items-center relative shadow-lg">
            <!-- Cargo Box with specific color -->
            <div class="w-[20px] h-[16px] rounded-xs" style="background-color: ${truck.color}; margin-left: 2px;"></div>
            <!-- Glass Cabin -->
            <div class="w-[8px] h-[16px] bg-sky-200 rounded-r-xs border-l border-white/20" style="margin-left: 1.5px;"></div>
            
            <!-- Turn indicator lights flashes dynamically on map -->
            ${renderBlinkerLeft ? `<span class="absolute w-2.5 h-2.5 bg-amber-500 rounded-full border border-white shadow shadow-amber-400 animate-ping" style="left: -1px; top: -5px; animation-duration: 0.5s;"></span>` : ''}
            ${renderBlinkerRight ? `<span class="absolute w-2.5 h-2.5 bg-amber-500 rounded-full border border-white shadow shadow-amber-400 animate-ping" style="left: -1px; bottom: -5px; animation-duration: 0.5s;"></span>` : ''}
          </div>
        </div>
      `;

      const tIcon = L.divIcon({
        html: truckHtml,
        className: '',
        iconSize: [48, 32],
        iconAnchor: [24, 16]
      });

      if (!truckMarkerRef.current) {
        truckMarkerRef.current = L.marker([truckLatLng.lat, truckLatLng.lng], { icon: tIcon, zIndexOffset: 250 }).addTo(map);
      } else {
        truckMarkerRef.current.setLatLng([truckLatLng.lat, truckLatLng.lng]);
        truckMarkerRef.current.setIcon(tIcon);
      }
    } else {
      if (truckMarkerRef.current) {
        truckMarkerRef.current.remove();
        truckMarkerRef.current = null;
      }
    }

  }, [
    startNodeId, 
    endNodeId, 
    route, 
    truckLatLng, 
    heading, 
    isBlinkingLeft, 
    isBlinkingRight, 
    blinkerPhase, 
    isSimulating, 
    truck.color
  ]);

  // Handle map auto pan and fitting bounds
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (route) {
      const boundsCoords: L.LatLngTuple[] = [];
      if (route.highFidelityPath && route.highFidelityPath.length > 0) {
        route.highFidelityPath.forEach(pt => {
          boundsCoords.push([pt.lat, pt.lng]);
        });
      } else {
        route.nodeIds.forEach(id => {
          const node = INTERSECTION_NODES.find(n => n.id === id);
          if (node) {
            boundsCoords.push([node.lat, node.lng]);
          }
        });
      }
      if (boundsCoords.length > 0) {
        map.fitBounds(L.latLngBounds(boundsCoords), { padding: [50, 50], maxZoom: 16 });
      }
    } else if (startNodeId) {
      const node = INTERSECTION_NODES.find(n => n.id === startNodeId);
      if (node) {
        map.setView([node.lat, node.lng], 16);
      }
    }
  }, [route, startNodeId]);

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Simulation Map Header with Mute */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50 border-b border-slate-200 z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-1 px-2.5 bg-emerald-50 rounded border border-emerald-150 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[9.5px] font-mono text-emerald-700 font-semibold tracking-wide uppercase">Rastreador GPS</span>
          </div>
          <span className="text-slate-300 hidden sm:inline">|</span>
          <span className="text-xs text-slate-500 font-mono hidden sm:inline">Río Molino &amp; Casco Patrimonial</span>
        </div>

        <button 
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all duration-200 cursor-pointer ${
            soundEnabled 
              ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' 
              : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
          }`}
          title="Alternar sonido de luces direccionales en esquinas"
        >
          {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
          <span className="hidden xs:inline">Sonido Direccionales</span>
        </button>
      </div>

      {/* Map Division containing Leaflet Container & Overlays */}
      <div className="relative flex-1 bg-slate-100 overflow-hidden flex items-center justify-center min-h-[480px]">
        {/* Leaflet instance mount target */}
        <div id="popayan-leaflet-map" ref={mapContainerRef} className="w-full h-full z-0" style={{ height: '540px', minHeight: '480px' }} />

        {/* Floating Quick Landmarks Selection Bar */}
        <div className="absolute top-4 left-4 right-4 flex flex-wrap gap-2 pointer-events-none z-[400]">
          <div className="bg-white/95 border border-slate-200 p-2.5 rounded-lg pointer-events-auto shadow-md backdrop-blur-sm max-w-sm">
            <h4 className="text-[9.5px] font-sans font-bold text-slate-450 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <Compass size={11} className="text-blue-600 animate-spin" style={{ animationDuration: '6s' }} />
              Puntos Rápidos de Interés
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {POPAYAN_LANDMARKS.slice(0, 4).map(lm => (
                <button
                  key={lm.name}
                  onClick={() => handleLandmarkClick(lm.nodeId, lm.name)}
                  disabled={isSimulating}
                  className="flex items-center gap-1 text-[10px] bg-slate-50 text-slate-600 px-2 py-1 rounded hover:bg-slate-100 hover:text-slate-950 transition border border-slate-200 cursor-pointer disabled:opacity-40 disabled:pointer-events-none font-medium"
                >
                  <span>{lm.emoji}</span>
                  <span>{lm.name.slice(0, 16)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Map Guidelines Banner for Clicks */}
        {!startNodeId && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 border border-slate-200 px-4 py-2.5 rounded-lg shadow-md backdrop-blur-sm flex items-center gap-2.5 pointer-events-none z-[400]">
            <div className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] animate-bounce">1</div>
            <p className="text-[11px] text-slate-700">
              Haz clic en cualquier <strong className="text-blue-600 font-bold">intersección</strong> para situar el <strong className="text-blue-600">Camión Conductor (C)</strong>.
            </p>
          </div>
        )}

        {startNodeId && !endNodeId && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 border border-slate-200 px-4 py-2.5 rounded-lg shadow-md backdrop-blur-sm flex items-center gap-2.5 pointer-events-none z-[400]">
            <div className="w-5 h-5 rounded-md bg-red-500 text-white flex items-center justify-center font-bold text-[10px] animate-bounce">2</div>
            <p className="text-[11px] text-slate-700">
              Haz clic en otra intersección para situar el <strong className="text-red-500 font-bold">Punto de Entrega (D)</strong>.
            </p>
          </div>
        )}
      </div>

      {/* Dispatch Terminal Dashboard Logs Footer */}
      <div className="bg-slate-50 border-t border-slate-200 px-4 py-3">
        <h3 className="text-[10px] font-sans text-slate-400 font-bold mb-1.5 uppercase tracking-widest flex items-center gap-1.5">
          <Activity size={12} className="text-blue-600 animate-pulse" />
          Consola Telemétrica de Tránsito &amp; Despacho
        </h3>
        <div className="space-y-1.5 max-h-[85px] overflow-y-auto font-mono text-[10.5px] text-slate-600 leading-normal scrollbar-thin scrollbar-thumb-slate-200">
          {logs.map((log, idx) => (
            <div key={idx} className={`border-l-2 pl-2.5 ${idx === 0 ? 'border-blue-500 text-blue-800 font-medium' : 'border-slate-200 text-slate-400'}`}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
