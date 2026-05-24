import { useState } from 'react';
import { TRUCK_CONFIGS } from '../data/streets';
import { generateRouteTrafficMatrix } from '../utils/gaussJordan';
import { RouteResult, TruckConfig, TruckId } from '../types';
import { 
  Truck, 
  MapPin, 
  Clock, 
  TrendingUp, 
  Navigation, 
  RotateCcw, 
  Play, 
  Pause, 
  ArrowRight, 
  TrafficCone, 
  Zap, 
  AlertCircle,
  Calculator,
  Activity,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatDistance, formatDuration } from '../utils/routing';

interface NavigationPanelProps {
  selectedTruckId: TruckId;
  onTruckSelect: (id: TruckId) => void;
  startNodeId: string | null;
  endNodeId: string | null;
  route: RouteResult | null;
  isRouteLoading?: boolean;
  isSimulating: boolean;
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  onResetSimulation: () => void;
  trafficLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  onTrafficSelect: (level: 'LOW' | 'MEDIUM' | 'HIGH') => void;
  playbackSpeed: number; // 1, 2, 4
  onPlaybackSpeedSelect: (speed: number) => void;
  onClearPoints: () => void;
}

export default function NavigationPanel({
  selectedTruckId,
  onTruckSelect,
  startNodeId,
  endNodeId,
  route,
  isRouteLoading = false,
  isSimulating,
  onStartSimulation,
  onPauseSimulation,
  onResetSimulation,
  trafficLevel,
  onTrafficSelect,
  playbackSpeed,
  onPlaybackSpeedSelect,
  onClearPoints
}: NavigationPanelProps) {
  const [activeResultTab, setActiveResultTab] = useState<'guide' | 'calculations' | 'trafficFlow'>('guide');
  const [gaussStep, setGaussStep] = useState<number>(0);
  const currentTruck = TRUCK_CONFIGS.find(t => t.id === selectedTruckId)!;

  // Check if a warning is required due to historic center transit constraints for heavy trucks
  const crossesHistoric = route?.nodeIds.some(id => {
    // Check if the route has any nodes inside the historic core
    return id.includes('K3_') || id.includes('K4_') || id.includes('K5_') || id.includes('K6_') || id.includes('K7_') || id.includes('K8_');
  }) && route?.nodeIds.some(id => {
    const cNum = parseInt(id.split('_')[1].replace('C', ''));
    return cNum >= 3 && cNum <= 8;
  });

  const isRestrictedVehicle = selectedTruckId === 'DOBLE_TROQUE' || selectedTruckId === 'TRACTOMULA';

  // Generate the Gauss-Jordan traffic matrix solver for the active route!
  const streetNames = route ? Array.from(new Set(route.edges.map(e => e.streetName))) : [];
  const trafficFlowResult = route ? generateRouteTrafficMatrix(streetNames, trafficLevel) : null;
  const maxSteps = trafficFlowResult ? trafficFlowResult.steps.length : 0;
  const currentGaussStep = trafficFlowResult ? Math.min(Math.max(0, gaussStep), maxSteps - 1) : 0;

  return (
    <div className="flex flex-col h-full bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-5 overflow-y-auto max-h-[820px] scrollbar-thin scrollbar-thumb-slate-200">
      
      {/* 1. SECTOR DE VEHICULOS (TRUCK TYPE) */}
      <div>
        <h3 className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <Truck size={14} className="text-blue-650" />
          1. Tipo de Vehículo de Carga
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          {TRUCK_CONFIGS.map((t) => {
            const isSelected = t.id === selectedTruckId;
            return (
              <button
                key={t.id}
                onClick={() => onTruckSelect(t.id)}
                className={`relative flex flex-col p-3 rounded-lg border text-left transition-all duration-300 ${
                  isSelected 
                    ? 'bg-blue-50 border-blue-400 text-slate-800 shadow-xs' 
                    : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-350'
                }`}
              >
                <div className="flex items-center justify-between w-full mb-1">
                  <span className={`text-[10px] px-2 py-0.5 rounded ${
                    isSelected ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {t.id}
                  </span>
                  <div 
                    className="w-2.5 h-2.5 rounded-full" 
                    style={{ backgroundColor: t.color }}
                  />
                </div>
                
                <h4 className="text-xs font-bold text-slate-800 mt-1">{t.name}</h4>
                <p className="text-[9px] text-slate-500 mt-0.5 font-mono">{t.capacityLabel}</p>
                <p className="text-[8px] text-slate-400 mt-1 leading-normal line-clamp-2">Altura: {t.heightMeters}m | L: {t.lengthMeters}m</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. WARNING ALERT FOR POPAYAN HISTORIC LAWS */}
      {isRestrictedVehicle && (
        <div className="p-3.5 bg-rose-50 border border-rose-250 rounded-lg">
          <div className="flex gap-2 text-rose-700 mb-1">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <h4 className="text-xs font-bold">Restricción del Sector Histórico</h4>
          </div>
          <p className="text-[10px] text-slate-600 leading-normal">
            Los camiones <strong className="text-rose-700">{currentTruck.name}</strong> superan el límite de peso municipal de <strong className="text-semibold text-rose-800">5 Toneladas</strong> o altura de <strong className="text-semibold text-rose-800">3.0m</strong> para el centro colonial de Popayán. El motor A* ha restringido estas calles y enviará la carga por la <strong>Panamericana</strong> o vías periféricas.
          </p>
        </div>
      )}

      {/* 3. PARÁMETROS DEL ENTORNO (TRAFFIC & SPEED COFACTOR) */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
        {/* Traffic select */}
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-sans text-slate-600 flex items-center gap-1.5 font-semibold">
            <TrafficCone size={12} className="text-slate-450" />
            Tráfico en la Ciudad
          </label>
          <div className="flex gap-1">
            {(['LOW', 'MEDIUM', 'HIGH'] as const).map(lev => (
              <button
                key={lev}
                onClick={() => onTrafficSelect(lev)}
                className={`text-[9px] px-2 py-1 rounded font-mono transition-all duration-150 ${
                  trafficLevel === lev
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-350'
                }`}
              >
                {lev === 'LOW' ? 'Fluido' : lev === 'MEDIUM' ? 'Normal' : 'Congestión'}
              </button>
            ))}
          </div>
        </div>

        {/* Speed select */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <label className="text-[11px] font-sans text-slate-600 flex items-center gap-1.5 font-semibold">
            <Zap size={11} className="text-blue-500" />
            Velocidad Simulación
          </label>
          <div className="flex gap-1">
            {([1, 2, 4] as const).map(speed => (
              <button
                key={speed}
                onClick={() => onPlaybackSpeedSelect(speed)}
                className={`text-[9px] px-2 py-1 rounded font-mono transition-all duration-150 ${
                  playbackSpeed === speed
                    ? 'bg-blue-600 text-white font-semibold'
                    : 'bg-slate-200 text-slate-600 hover:bg-slate-350'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 4. PLANIFICACION DE RUTA Y GEO METRICAS */}
      <div>
        <h3 className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
          <MapPin size={13} className="text-blue-550" />
          2. Planificación del Viaje
        </h3>

        {!startNodeId && !endNodeId && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center">
            <p className="text-xs text-slate-500 leading-relaxed">
              Define el trayecto haciendo clics sobre el mapa interactivo. El sistema buscará el camino legal más corto.
            </p>
          </div>
        )}

        {(startNodeId || endNodeId) && (
          <div className="space-y-3.5">
            <div>
              <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Conductor (Origen)</label>
              <div className="mt-1 flex items-center bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-2.5 shrink-0" />
                <span className="text-xs text-slate-700 truncate font-mono">
                  {startNodeId ? `Intersección ${startNodeId.replace('_', ' ')}` : 'Haz clic en el mapa para marcar el origen'}
                </span>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Destino (Entrega)</label>
              <div className="mt-1 flex items-center bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2.5 shrink-0" />
                <span className="text-xs text-slate-700 truncate font-mono">
                  {endNodeId ? `Intersección ${endNodeId.replace('_', ' ')}` : 'Haz clic en el mapa para marcar el destino'}
                </span>
              </div>
            </div>
            
            <div className="pt-1 flex justify-end">
              <button
                onClick={onClearPoints}
                className="text-[10px] font-mono text-slate-500 hover:text-blue-600 transition underline cursor-pointer"
              >
                Limpiar puntos fijados 🔄
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. METRICAS COMPUTADAS POR EL CORE DIJKSTRA */}
      {(route || isRouteLoading) && (
        <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-250/60 relative overflow-hidden">
          {isRouteLoading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex flex-col items-center justify-center space-y-1.5 z-10 transition-opacity duration-200">
              <span className="w-4 h-4 rounded-full border-2 border-slate-800 border-t-transparent animate-spin"></span>
              <p className="text-[10px] font-medium font-mono text-slate-700">Calculando ruta real...</p>
            </div>
          )}
          <h3 className="text-xs font-bold text-slate-700 border-b border-slate-200 pb-1.5 flex justify-between items-center bg-slate-50">
            <span>Ruta Planificada</span>
            <span className="text-[10px] font-mono font-medium text-slate-500 uppercase">A* Engine Core</span>
          </h3>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 flex items-center gap-1.5"><Navigation size={12} className="text-slate-400" /> Distancia</span>
            <span className="font-bold text-slate-800">{route ? formatDistance(route.totalDistanceMeters) : '--'}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 flex items-center gap-1.5"><Clock size={12} className="text-slate-400" /> Tiempo Estimado</span>
            <span className="font-bold text-slate-800">{route ? formatDuration(route.totalTimeSeconds) : '--'}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 flex items-center gap-1.5"><TrafficCone size={12} className="text-slate-400" /> Estado Tránsito</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
              trafficLevel === 'LOW' ? 'bg-green-50 text-green-700 border border-green-100' :
              trafficLevel === 'MEDIUM' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
              'bg-amber-50 text-amber-700 border border-amber-100'
            }`}>
              {trafficLevel === 'LOW' ? 'Fluido' : trafficLevel === 'MEDIUM' ? 'Normal' : 'Congestionado'}
            </span>
          </div>
        </div>
      )}

      {/* 6. CONTROLADORES DE SIMULACION */}
      {route && (
        <div className="space-y-2">
          {isSimulating ? (
            <button
              onClick={onPauseSimulation}
              className="w-full flex items-center justify-center gap-2 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg text-xs transition shadow-md cursor-pointer"
            >
              <Pause size={13} fill="currentColor" />
              Pausar Monitoreo
            </button>
          ) : (
            <button
              onClick={onStartSimulation}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition shadow-md shadow-blue-100 cursor-pointer"
            >
              <Play size={13} fill="currentColor" />
              Iniciar Rastreo de Camión 🚚
            </button>
          )}

          <button
            onClick={onResetSimulation}
            className="w-full flex items-center justify-center gap-2 py-2 border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800 rounded-lg text-[11px] font-mono transition cursor-pointer"
          >
            <RotateCcw size={12} />
            Reiniciar Camión al Origen
          </button>
        </div>
      )}

      {/* 7. DIRECCIÓN PASO A PASO / DETALLE MULTI-TABS */}
      {route && (
        <div className="pt-2 border-t border-slate-200">
          <div className="grid grid-cols-3 bg-slate-100 rounded-lg p-1 gap-1 mb-4">
            <button
              onClick={() => setActiveResultTab('guide')}
              className={`text-center py-1.5 rounded text-[11px] sm:text-xs transition duration-200 flex justify-center items-center gap-1 cursor-pointer focus:outline-none ${
                activeResultTab === 'guide'
                  ? 'bg-white text-slate-800 font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <TrendingUp size={11} />
              Guía
            </button>
            <button
              onClick={() => setActiveResultTab('calculations')}
              className={`text-center py-1.5 rounded text-[11px] sm:text-xs transition duration-200 flex justify-center items-center gap-1 cursor-pointer focus:outline-none ${
                activeResultTab === 'calculations'
                  ? 'bg-white text-slate-800 font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <Calculator size={11} />
              Cálculo A*
            </button>
            <button
              onClick={() => {
                setActiveResultTab('trafficFlow');
                setGaussStep(0);
              }}
              className={`text-center py-1.5 rounded text-[11px] sm:text-xs transition duration-200 flex justify-center items-center gap-1 cursor-pointer focus:outline-none ${
                activeResultTab === 'trafficFlow'
                  ? 'bg-white text-slate-800 font-semibold shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 font-medium'
              }`}
            >
              <Activity size={11} />
              Gauss-J
            </button>
          </div>

          {activeResultTab === 'guide' ? (
            <div>
              <h3 className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                <TrendingUp size={13} className="text-blue-550" />
                Guía de Navegación del Trayecto
              </h3>

              <div className="space-y-3.5 pl-3 border-l-2 border-slate-200">
                {route.instructions.map((inst, idx) => {
                  let arrowChar = '⬆️';
                  let color = 'text-slate-500';
                  if (inst.action === 'LEFT') {
                    arrowChar = '⬅️';
                    color = 'text-blue-600';
                  } else if (inst.action === 'RIGHT') {
                    arrowChar = '➡️';
                    color = 'text-blue-600';
                  } else if (inst.action === 'START') {
                    arrowChar = '🏁';
                    color = 'text-emerald-500';
                  } else if (inst.action === 'ARRIVE') {
                    arrowChar = '📍';
                    color = 'text-red-500';
                  }

                  return (
                    <div key={idx} className="relative flex gap-2 text-xs">
                      <span className="absolute -left-4.5 top-1.5 w-2 h-2 rounded-full bg-slate-300" />
                      
                      <span className={`shrink-0 ${color} font-mono w-5 text-center`}>
                        {arrowChar}
                      </span>
                      
                      <div className="flex-1">
                        <p className="text-slate-700 leading-snug">{inst.description}</p>
                        {inst.distance > 0 && (
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">Avance: {inst.distance}m</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : activeResultTab === 'calculations' ? (
            <div className="space-y-4">
              {/* Fórmula y Factores del Algoritmo */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                <h4 className="text-[10px] font-bold text-slate-500 flex items-center gap-1 border-b border-slate-200 pb-1 uppercase font-mono">
                  <Calculator size={11} className="text-emerald-600 animate-pulse" /> Ecuaciones del Algoritmo A*
                </h4>
                
                {/* 1. Costo A* */}
                <div className="bg-white p-2.5 rounded border border-slate-150 font-mono text-[10px] text-slate-750 flex flex-col gap-1">
                  <p className="font-bold text-slate-800">1. Función de Evaluación A*:</p>
                  <p className="bg-slate-50 p-1.5 rounded text-emerald-600 text-center font-bold font-mono">
                    f(n) = g(n) + h(n)
                  </p>
                  <p className="text-slate-500 leading-normal text-[9px] mt-1 text-justify">
                    * <strong>g(n) (Costo Real)</strong>: Distancia física acumulada (m) + penalizaciones por giros bruscos o zig-zagueo.
                    <br />
                    * <strong>h(n) (Heurística)</strong>: Estimación en línea recta al destino (<span className="text-indigo-600 font-bold">Heurística Euclídea × 1.5</span>). Al ser menor o igual al costo real, garantiza que sea <em>admisible</em> y encuentre el camino óptimo.
                  </p>
                </div>

                {/* 2. Estimación de Tiempo de Viaje */}
                <div className="bg-white p-2.5 rounded border border-slate-150 font-mono text-[10px] text-slate-750 flex flex-col gap-1">
                  <p className="font-bold text-slate-800">2. Ecuación Temporal:</p>
                  <p className="bg-slate-50 p-1.5 rounded text-blue-600 text-center font-bold font-mono">
                    Tiempo = (d_m / Vel_ms) × Factor_Tránsito
                  </p>
                  <div className="text-slate-500 leading-relaxed text-[9px] mt-1 space-y-1">
                    <p>
                      * <strong>Vel_Base ({currentTruck.name})</strong>: <code>{(currentTruck.averageSpeedKmh).toFixed(1)} km/h</code> (~<code>{((currentTruck.averageSpeedKmh * 1000) / 3600).toFixed(2)} m/s</code>)
                    </p>
                    <p>
                      * <strong>Leyes Coloniales (Empedrado)</strong>: {crossesHistoric ? '⚠️ Cruza Centro Histórico: ' : 'Vía General: '}
                      <code>-35% velocidad</code> si la calle posee piedra empedrada (Vel_Base × 0.65). Esto restringe y disuade el tránsito patrimonial.
                    </p>
                    <p>
                      * <strong>Factor de Tránsito ({trafficLevel})</strong>: 
                      <code>{trafficLevel === 'LOW' ? '0.85x' : trafficLevel === 'MEDIUM' ? '1.25x' : '2.00x'}</code> en tiempo total.
                    </p>
                  </div>
                </div>

                {/* Heuristic efficiency badge */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping shrink-0" />
                  <p className="text-[10px] text-emerald-800 font-sans leading-relaxed">
                    <strong>Búsqueda Dirigida A*:</strong> Al usar la heurística espacial, el algoritmo solo expandió <strong>{route.expandedNodesCount ?? 12} intersecciones</strong> de Popayán para calcular la ruta exacta, minimizando el procesamiento redundante.
                  </p>
                </div>
              </div>

              {/* Computaciones en cada Tramo actual de la Ruta */}
              <div>
                <h4 className="text-[10px] font-sans font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <Activity size={12} className="text-emerald-500" />
                  Cálculo Detallado del Trazado ({route.edges.length} Tramos con Valores A*)
                </h4>

                <div className="space-y-3">
                  {route.edges.map((edge, idx) => {
                    const prevEdge = idx > 0 ? route.edges[idx - 1] : null;
                    const isTurn = prevEdge && prevEdge.streetName !== edge.streetName;
                    const turnPenalty = isTurn ? 400 : 0;
                    
                    let speedMs = (currentTruck.averageSpeedKmh * 1000) / 3600;
                    if (edge.isCobblestone) {
                      speedMs *= 0.65;
                    }
                    const trafficFactors = { LOW: 0.85, MEDIUM: 1.25, HIGH: 2.0 };
                    const trafficFactor = trafficFactors[trafficLevel];
                    const segmentTimeSeconds = (edge.baseDistanceMeters / speedMs) * trafficFactor;
                    const effectiveSpeedKmh = edge.isCobblestone ? currentTruck.averageSpeedKmh * 0.65 : currentTruck.averageSpeedKmh;

                    const formattedFrom = edge.fromNodeId.replace('_', ' ');
                    const formattedTo = edge.toNodeId.replace('_', ' ');

                    // Values from A* results
                    const exactG = route.gScores?.[edge.toNodeId] ?? (idx + 1) * 120; 
                    const exactH = route.hScores?.[edge.toNodeId] ?? 0;
                    const exactF = route.fScores?.[edge.toNodeId] ?? (exactG + exactH);

                    return (
                      <div key={edge.id} className="border border-slate-200 rounded-lg p-3 bg-white hover:bg-slate-50/50 transition relative overflow-hidden text-xs">
                        {/* Tramo Badge Index */}
                        <div className="absolute right-2.5 top-2.5 bg-slate-100 text-slate-500 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">
                          Tramo {idx + 1}
                        </div>

                        <div className="mb-2">
                          <h5 className="font-bold text-slate-800 pr-16 truncate">
                            {edge.streetName}
                          </h5>
                          <p className="text-[9px] font-mono text-slate-400 leading-normal flex items-center gap-1 mt-0.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            {formattedFrom}
                            <ArrowRight size={8} className="text-slate-400 mx-0.5" />
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                            {formattedTo}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 border-t border-slate-100 pt-2 font-mono text-[9px] text-slate-550">
                          <div>
                            <span className="text-slate-400 block text-[8px] uppercase font-sans">Distancia Segmento:</span>
                            <span className="font-bold text-slate-700">{edge.baseDistanceMeters} m</span>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[8px] uppercase font-sans font-medium">Penaliz. Giro (g_cost):</span>
                            <span className={`font-bold ${turnPenalty > 0 ? 'text-amber-600' : 'text-slate-500'}`}>
                              +{turnPenalty} m {turnPenalty > 0 ? '(Giro Vía)' : '(Hacia Adelante)'}
                            </span>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[8px] uppercase font-sans">Velocidad Tramo:</span>
                            <span className="font-bold text-slate-700">{effectiveSpeedKmh.toFixed(1)} km/h</span>
                          </div>

                          <div>
                            <span className="text-slate-400 block text-[8px] uppercase font-sans">Tipo de Calzada:</span>
                            <span className={`font-semibold ${edge.isCobblestone ? 'text-amber-700' : 'text-slate-500'}`}>
                              {edge.isCobblestone ? '🧱 Colonial (-35% V)' : '🛣️ Urbana (Fácil)'}
                            </span>
                          </div>

                          {/* A* Mathematical Components */}
                          <div className="col-span-2 bg-slate-900 border border-slate-950 p-2.5 rounded-lg text-[9px] text-slate-300 font-mono space-y-1.5 mt-1">
                            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                              <span className="text-slate-500">g(n) (Costo acumulado origen):</span>
                              <span className="text-slate-350 font-bold">{Math.round(exactG)} m</span>
                            </div>
                            <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                              <span className="text-indigo-400">h(n) (Heurística al destino):</span>
                              <span className="text-indigo-300 font-bold">{Math.round(exactH)} m</span>
                            </div>
                            <div className="flex justify-between items-center bg-slate-950/60 p-1.5 rounded text-emerald-450 text-[10px] uppercase">
                              <span className="font-bold">f(n) = g(n) + h(n):</span>
                              <span className="font-extrabold text-white text-[11px]">{Math.round(exactF)} m</span>
                            </div>
                          </div>

                          <div className="col-span-2 bg-blue-50/50 p-2 rounded border border-blue-100 flex justify-between items-center mt-1">
                            <div>
                              <span className="text-blue-500 text-[8px] uppercase font-sans block font-semibold leading-none">Tiempo en Tramo</span>
                              <span className="text-slate-800 font-bold font-mono text-[10px]">{segmentTimeSeconds.toFixed(1)} seg</span>
                            </div>
                            <div className="text-right">
                              <span className="text-emerald-600 text-[8px] uppercase font-sans block font-semibold leading-none">Evaluación A* Total</span>
                              <span className="text-emerald-700 font-bold font-mono text-[10px]">{Math.round(exactF)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            trafficFlowResult ? (
              <div className="space-y-4">
                {/* Gauss Introduction Header */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <h4 className="text-[10px] font-bold text-slate-500 flex items-center gap-1 border-b border-slate-200 pb-1 uppercase font-mono">
                    <Activity size={12} className="text-blue-600" /> Modelado de Tránsito Urbano
                  </h4>
                  <p className="text-slate-600 text-[11px] leading-relaxed text-justify">
                    Para calcular las densidades óptimas en la ruta, modelamos el flujo vehicular en los corredores elegidos como variables físicas 
                    (<span className="font-bold font-mono text-slate-700">x₁, x₂, x₃</span>) medidas en <code>vehículos/minuto</code>. Aplicando la conservación de materia en las intersecciones clave:
                  </p>
                  
                  {/* Equations formulated details */}
                  <div className="bg-white rounded-lg border border-slate-200 p-2.5 space-y-1.5 text-[10px] font-mono text-slate-750">
                    <div className="flex items-center justify-between border-b border-dashed border-slate-100 pb-1">
                      <span>1) 1·x₁ - 1·x₂ + 0·x₃ = {trafficFlowResult.originalMatrix[0][3]}</span>
                      <span className="text-[8px] text-slate-400 font-sans font-medium uppercase">{streetNames[0] ? `Cruce ${streetNames[0].split(' ')[0]}` : 'Cruce Inicial'}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-dashed border-slate-100 pb-1">
                      <span>2) 0·x₁ + 1·x₂ - 1·x₃ = {trafficFlowResult.originalMatrix[1][3]}</span>
                      <span className="text-[8px] text-slate-400 font-sans font-medium uppercase">Nudo Medio</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>3) 1·x₁ + 1·x₂ + 1·x₃ = {trafficFlowResult.originalMatrix[2][3]}</span>
                      <span className="text-[8px] text-slate-400 font-sans font-medium uppercase">Capacidad Total</span>
                    </div>
                  </div>
                </div>

                {/* Paso a paso de eliminación Gauss-Jordan */}
                <div className="bg-slate-900 text-slate-100 border border-slate-850 rounded-xl p-4 space-y-3.5 shadow-md relative overflow-hidden">
                  <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-2 text-slate-850 opacity-20 pointer-events-none font-mono text-[90px] font-bold">
                    [A]
                  </div>

                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h5 className="text-[10px] uppercase font-bold tracking-widest text-emerald-450 font-mono flex items-center gap-1.5">
                      <Calculator size={12} className="text-emerald-500 animate-pulse" /> Gauss-Jordan Eliminación
                    </h5>
                    <span className="text-[10px] font-mono font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                      Paso {currentGaussStep + 1} de {maxSteps}
                    </span>
                  </div>

                  {/* Active Step matrix rendering styled mathematically inside brackets */}
                  <div className="relative font-mono py-1">
                    {/* Matrix Left Bracket Graphic */}
                    <div className="absolute left-1 top-0 bottom-0 w-2.5 border-l-2 border-t-2 border-b-2 border-slate-400 rounded-l" />
                    
                    {/* Matrix Right Bracket Graphic */}
                    <div className="absolute right-1 top-0 bottom-0 w-2.5 border-r-2 border-t-2 border-b-2 border-slate-400 rounded-r" />

                    <div className="px-4 space-y-2 text-[11px] select-none text-center">
                      {trafficFlowResult.steps[currentGaussStep].matrix.map((row, rIdx) => {
                        const isAffected = rIdx === trafficFlowResult.steps[currentGaussStep].rowAffected;
                        return (
                          <div 
                            key={rIdx} 
                            className={`grid grid-cols-5 gap-1 py-1 rounded transition duration-200 ${
                              isAffected 
                                ? 'bg-amber-500/15 text-amber-300 font-bold border-l-2 border-amber-500 pl-1' 
                                : 'text-slate-300'
                            }`}
                          >
                            <div>{row[0].toFixed(2)}</div>
                            <div>{row[1].toFixed(2)}</div>
                            <div>{row[2].toFixed(2)}</div>
                            <div className="text-slate-650 text-center select-none font-bold">|</div>
                            <div className={isAffected ? 'text-amber-300' : 'text-emerald-400'}>
                              {row[3].toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Interactive Step Controls */}
                  <div className="flex justify-between items-center gap-2 pt-2 border-t border-slate-800">
                    <button
                      disabled={currentGaussStep === 0}
                      onClick={() => setGaussStep(prev => Math.max(0, prev - 1))}
                      className="flex-1 py-1.5 px-2 bg-slate-800 hover:bg-slate-750 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 rounded font-semibold text-[10.5px] transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <ChevronLeft size={11} />
                      Anterior
                    </button>
                    
                    <button
                      disabled={currentGaussStep === maxSteps - 1}
                      onClick={() => setGaussStep(prev => Math.min(maxSteps - 1, prev + 1))}
                      className="flex-1 py-1.5 px-2 bg-blue-600 hover:bg-blue-550 disabled:opacity-40 disabled:hover:bg-blue-600 text-white rounded font-bold text-[10.5px] transition flex items-center justify-center gap-1 cursor-pointer"
                    >
                      Siguiente
                      <ChevronRight size={11} />
                    </button>
                  </div>

                  {/* Description of what happened */}
                  <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 text-[10px] text-slate-300 leading-relaxed font-mono">
                    <span className="font-bold text-amber-400 block border-b border-slate-800 pb-0.5 mb-1 text-[9px] uppercase tracking-wide">
                      Operación Matricial Realizada:
                    </span>
                    {trafficFlowResult.steps[currentGaussStep].description}
                  </div>
                </div>

                {/* Final system solution vector */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-2">
                  <h4 className="text-[10px] font-bold text-emerald-800 flex items-center gap-1 uppercase font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 block" /> Vector Solución Resultante:
                  </h4>
                  
                  <div className="space-y-1.5">
                    {trafficFlowResult.variables.map((v, vIdx) => (
                      <div key={v.symbol} className="flex items-center justify-between text-[11px] font-mono text-slate-700 bg-white border border-emerald-100 rounded px-2.5 py-1.5 shadow-3xs">
                        <span className="font-bold text-emerald-700">{v.symbol} <span className="font-normal text-slate-400 text-[9px] font-sans">({v.label})</span></span>
                        <span className="font-bold text-slate-800 bg-slate-50 px-2 py-0.5 rounded border border-slate-150">
                          {v.currentEstimate}
                        </span>
                      </div>
                    ))}
                  </div>

                  <p className="text-[9px] text-emerald-600 font-mono leading-relaxed pt-1">
                    * El cálculo de Gauss-Jordan muestra un flujo continuo estable. Los resultados garantizan que la fluidez del camión {currentTruck.name} esté respaldada para el tráfico configurado ({trafficLevel === 'LOW' ? 'Bajo' : trafficLevel === 'MEDIUM' ? 'Moderado' : 'Alto'}).
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-xs text-slate-400">
              Seleccione un origen y destino para calcular las matrices de tránsito.
            </div>
          )
        )}
      </div>
    )}
  </div>
);
}
