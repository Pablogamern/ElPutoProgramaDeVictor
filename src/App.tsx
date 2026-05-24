import { useState, useMemo, useEffect } from 'react';
import { TruckId, RouteResult } from './types';
import { TRUCK_CONFIGS, INTERSECTION_NODES } from './data/streets';
import { calculateTruckRoute } from './utils/routing';
import MapDisplay from './components/MapDisplay';
import NavigationPanel from './components/NavigationPanel';
import { 
  Truck, 
  Map, 
  Settings2, 
  ShieldCheck, 
  Info,
  ExternalLink
} from 'lucide-react';

export default function App() {
  // Pre-configured starting points for an immediate, plug-and-play interactive experience:
  // Starts at the Terminal de Transportes (West edge)
  const [startNodeId, setStartNodeId] = useState<string | null>('K15_C5');
  // Destination near Parque Caldas (Historic core)
  const [endNodeId, setEndNodeId] = useState<string | null>('K6_C4');

  const [selectedTruckId, setSelectedTruckId] = useState<TruckId>('TURBO');
  const [isSimulating, setIsSimulating] = useState(false);
  const [trafficLevel, setTrafficLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(2); // 2x default for agile movement

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);

  // Retrieve current truck parameters
  const currentTruck = useMemo(() => {
    return TRUCK_CONFIGS.find(t => t.id === selectedTruckId)!;
  }, [selectedTruckId]);

  // Compute optimized legal path via A* Solver + Real OSRM highway alignment
  useEffect(() => {
    if (!startNodeId || !endNodeId) {
      setRoute(null);
      return;
    }

    const baseRoute = calculateTruckRoute(startNodeId, endNodeId, currentTruck, trafficLevel);
    if (!baseRoute) {
      setRoute(null);
      return;
    }

    let active = true;
    setIsRouteLoading(true);

    const coordsArray = baseRoute.nodeIds.map(id => {
      const node = INTERSECTION_NODES.find(n => n.id === id);
      return node ? `${node.lng},${node.lat}` : null;
    }).filter(Boolean);

    if (coordsArray.length < 2) {
      setRoute(baseRoute);
      setIsRouteLoading(false);
      return;
    }

    const coordsString = coordsArray.join(';');
    // Fetch high-fidelity route sequence from open source OSRM
    const url = `https://router.project-osrm.org/route/v1/driving/${coordsString}?overview=full&geometries=geojson&steps=true`;

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('OSRM service response was not ok');
        return res.json();
      })
      .then(data => {
        if (!active) return;
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const osrmRoute = data.routes[0];
          const coords = osrmRoute.geometry.coordinates.map((c: [number, number]) => ({
            lat: c[1],
            lng: c[0]
          }));

          setRoute({
            ...baseRoute,
            highFidelityPath: coords,
            totalDistanceMeters: osrmRoute.distance,
            totalTimeSeconds: Math.round(osrmRoute.duration * (trafficLevel === 'LOW' ? 0.85 : trafficLevel === 'MEDIUM' ? 1.25 : 2.0)),
          });
        } else {
          // Fallback
          const fallback = baseRoute.nodeIds.map(id => {
            const node = INTERSECTION_NODES.find(n => n.id === id)!;
            return { lat: node.lat, lng: node.lng };
          });
          setRoute({
            ...baseRoute,
            highFidelityPath: fallback
          });
        }
      })
      .catch(err => {
        console.warn('OSRM route integration failed, falling back to straight lines:', err);
        if (!active) return;
        const fallback = baseRoute.nodeIds.map(id => {
          const node = INTERSECTION_NODES.find(n => n.id === id)!;
          return { lat: node.lat, lng: node.lng };
        });
        setRoute({
          ...baseRoute,
          highFidelityPath: fallback
        });
      })
      .finally(() => {
        if (active) setIsRouteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [startNodeId, endNodeId, currentTruck, trafficLevel]);

  // Handler to selection points
  const handleNodeSelect = (nodeId: string, role: 'START' | 'END') => {
    if (role === 'START') {
      setStartNodeId(nodeId);
      // Reset active running simulation if start shifts
      setIsSimulating(false);
    } else {
      setEndNodeId(nodeId);
      setIsSimulating(false);
    }
  };

  // Simulation controls
  const handleStartSimulation = () => {
    if (!route) return;
    setIsSimulating(true);
  };

  const handlePauseSimulation = () => {
    setIsSimulating(false);
  };

  const handleResetSimulation = () => {
    setIsSimulating(false);
    // Setting back to 0 progress is triggered by resetting simulating to false
    // or shifting start point back. We toggle startNodeId briefly to force resetting progress
    const temp = startNodeId;
    setStartNodeId(null);
    setTimeout(() => setStartNodeId(temp), 50);
  };

  const handleClearPoints = () => {
    setIsSimulating(false);
    setStartNodeId(null);
    setEndNodeId(null);
  };

  return (
    <div id="popayan-app-container" className="min-h-screen bg-slate-100 text-slate-850 flex flex-col font-sans antialiased">
      
      {/* GLOBAL HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shadow-xs shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            {/* Minimalist Brand Icon */}
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-md shadow-blue-600/10 shrink-0">
              <Truck size={20} className="stroke-[2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-900 font-sans">
                  Popayán Logística
                </h1>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-mono font-semibold">
                  Cauca, Colombia
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Simulador logístico de carga pesada, control de sentido de vías y prevención de tránsito histórico
              </p>
            </div>
          </div>

          {/* Quick Context & City Label */}
          <div className="flex items-center gap-3 self-start md:self-auto bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-xs text-slate-600 font-mono flex items-center gap-1.5 leading-none">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              La Ciudad Blanca de Colombia
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-[11px] text-slate-600 font-mono">Preservación Colonial</span>
          </div>
        </div>
      </header>

      {/* DETAILED INFORMATION NOTE FOR COLONIAL RESTRICTIONS */}
      <div className="bg-blue-50 border-b border-blue-100 px-6 py-2.5 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center gap-2.5 text-xs text-blue-700 leading-relaxed font-sans">
          <Info size={14} className="shrink-0 text-blue-600" />
          <p>
            <strong>Simulación de Capacidad Logística:</strong> Popayán cuenta con un mosaico de calles estrechas y empedradas en su casco patrimonial. Selecciona la <strong className="text-blue-800 underline decoration-dotted cursor-help">Tractomula</strong> en el panel de control lateral para ver cómo el algoritmo A* recalcula automáticamente el paso bordeando el centro prohibido a través de la <strong>Av. Panamericana</strong>.
          </p>
        </div>
      </div>

      {/* CORE BENTO GRID LAYOUT */}
      <style>{`
        /* Quick scrollbar adjustments */
        .scrollbar-thin::-webkit-scrollbar {
          width: 5px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 99px;
        }
      `}</style>
      
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Controls & Navigation Turn-by-Turn Panel (Spans 4 columns) */}
        <section className="lg:col-span-4 h-full">
          <NavigationPanel
            selectedTruckId={selectedTruckId}
            onTruckSelect={setSelectedTruckId}
            startNodeId={startNodeId}
            endNodeId={endNodeId}
            route={route}
            isRouteLoading={isRouteLoading}
            isSimulating={isSimulating}
            onStartSimulation={handleStartSimulation}
            onPauseSimulation={handlePauseSimulation}
            onResetSimulation={handleResetSimulation}
            trafficLevel={trafficLevel}
            onTrafficSelect={setTrafficLevel}
            playbackSpeed={playbackSpeed}
            onPlaybackSpeedSelect={setPlaybackSpeed}
            onClearPoints={handleClearPoints}
          />
        </section>

        {/* RIGHT COLUMN: Interactive Map Display (Spans 8 columns) */}
        <section className="lg:col-span-8 h-full">
          <MapDisplay
            startNodeId={startNodeId}
            endNodeId={endNodeId}
            onNodeSelect={handleNodeSelect}
            route={route}
            truck={currentTruck}
            isSimulating={isSimulating}
            onSimulationFinished={() => setIsSimulating(false)}
            trafficLevel={trafficLevel}
            playbackSpeed={playbackSpeed}
          />
        </section>
      </main>

      {/* EMBEDDED PERSISTENCE / EXPLANATORY FOOTER */}
      <footer className="bg-white border-t border-slate-200 py-6 px-6 text-center shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Desarrollado bajo normativas municipales de Popayán para camiones pesados y rutas seguras.</span>
          </div>
          <div className="flex gap-3 text-slate-400">
            <span>Centro Histórico</span>
            <span>•</span>
            <span>Av. Panamericana</span>
            <span>•</span>
            <span>Río Molino</span>
            <span>•</span>
            <span>El Morro</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
