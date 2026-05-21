import { useEffect, useState, useCallback } from 'react';
import ReactFlow, {
  Background, Controls, MarkerType,
  useNodesState, useEdgesState,
  type Node, type Edge,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import { getCirculars, getObligationGraph } from '../services/api';
import {
  GitBranch, AlertTriangle, CheckCircle2, Clock,
  Building2, Loader2, ChevronDown, Info
} from 'lucide-react';

// ── Dagre auto-layout helper ─────────────────────────────────
const NODE_W = 240;
const NODE_H = 110;

function layoutGraph(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));
  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return {
    nodes: nodes.map(n => {
      const pos = g.node(n.id);
      return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
    }),
    edges,
  };
}

// ── Department colour map ────────────────────────────────────
const DEPT_COLORS: Record<string, string> = {
  'IT Dept':        'from-blue-600 to-blue-800',
  'Retail Banking': 'from-orange-600 to-orange-800',
  'Legal Dept':     'from-violet-600 to-violet-800',
  'Operations':     'from-teal-600 to-teal-800',
  'Risk':           'from-rose-600 to-rose-800',
  'Finance':        'from-amber-600 to-amber-800',
};
const fallbackColor = 'from-gray-600 to-gray-800';

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-red-400',
  medium: 'bg-amber-400',
  low:    'bg-emerald-400',
};

const STATUS_ICON: Record<string, React.ReactNode> = {
  verified:    <CheckCircle2 size={12} className="text-emerald-400" />,
  pending:     <Clock size={12} className="text-gray-400" />,
  in_progress: <Loader2 size={12} className="text-blue-400 animate-spin" />,
  submitted:   <Clock size={12} className="text-amber-400" />,
  rejected:    <AlertTriangle size={12} className="text-red-400" />,
};

// ── Custom MAP Node ──────────────────────────────────────────
function MAPNode({ data }: { data: any }) {
  const color = DEPT_COLORS[data.department] || fallbackColor;
  return (
    <div className={`relative w-60 rounded-2xl border overflow-hidden shadow-xl ${
      data.blocked
        ? 'border-red-500/50 bg-gray-950'
        : data.status === 'verified'
        ? 'border-emerald-500/40 bg-gray-900'
        : 'border-gray-700 bg-gray-900'
    }`}>
      {/* Coloured department header */}
      <div className={`bg-gradient-to-r ${color} px-3 py-2 flex items-center justify-between`}>
        <div className="flex items-center space-x-1.5">
          <Building2 size={12} className="text-white/80" />
          <span className="text-xs font-bold text-white/90 truncate">{data.department}</span>
        </div>
        <div className="flex items-center space-x-1">
          <div className={`w-2 h-2 rounded-full ${PRIORITY_DOT[data.priority] || 'bg-gray-400'}`} />
          <span className="text-[10px] text-white/70 font-medium uppercase">{data.priority}</span>
        </div>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-start justify-between space-x-1">
          <p className="text-xs font-semibold text-white leading-snug line-clamp-3">{data.action_title}</p>
          <span className="text-[10px] text-gray-600 flex-shrink-0">{data.id}</span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <div className="flex items-center space-x-1 text-gray-500">
            <Clock size={10} />
            <span>{data.deadline || 'No deadline'}</span>
          </div>
          <div className="flex items-center space-x-1 text-gray-400">
            {STATUS_ICON[data.status]}
            <span className="capitalize">{data.status?.replace('_', ' ')}</span>
          </div>
        </div>
      </div>

      {/* Blocked Banner */}
      {data.blocked && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center space-x-1 bg-red-500/15 border-t border-red-500/30 py-1">
          <AlertTriangle size={10} className="text-red-400" />
          <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Blocked</span>
        </div>
      )}
    </div>
  );
}

const nodeTypes = { mapNode: MAPNode };

// ── Main Component ───────────────────────────────────────────
export default function ObligationGraph() {
  const [circulars, setCirculars] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [graphData, setGraphData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Load circular list
  useEffect(() => {
    getCirculars().then((data: any[]) => {
      const parsed = data.filter(c => c.status === 'parsed' || c.maps?.length > 0);
      setCirculars(parsed);
      if (parsed.length > 0) setSelectedId(parsed[0]._id);
    }).catch(() => setError('Failed to load circulars.'));
  }, []);

  // Load graph for selected circular
  const loadGraph = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const data = await getObligationGraph(id);
      setGraphData(data);

      // Build React Flow nodes
      const rfNodes: Node[] = data.nodes.map((n: any) => ({
        id: n.id,
        type: 'mapNode',
        position: { x: 0, y: 0 }, // dagre will override
        data: { ...n },
      }));

      // Build React Flow edges
      const rfEdges: Edge[] = data.edges.map((e: any) => ({
        id: e.id,
        source: e.from_map_id,
        target: e.to_map_id,
        label: e.constraint,
        labelStyle: { fill: '#94a3b8', fontSize: 10, fontWeight: 500 },
        labelBgStyle: { fill: '#0f172a', fillOpacity: 0.85 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1', width: 16, height: 16 },
        style: { stroke: '#6366f1', strokeWidth: 2 },
        animated: true,
      }));

      // Apply auto-layout
      const laid = layoutGraph(rfNodes, rfEdges);
      setNodes(laid.nodes);
      setEdges(laid.edges);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load obligation graph.');
    } finally {
      setLoading(false);
    }
  }, [setNodes, setEdges]);

  useEffect(() => {
    if (selectedId) loadGraph(selectedId);
  }, [selectedId, loadGraph]);

  const blockedCount = graphData?.nodes?.filter((n: any) => n.blocked).length ?? 0;
  const edgeCount = graphData?.edges?.length ?? 0;
  const verifiedCount = graphData?.nodes?.filter((n: any) => n.status === 'verified').length ?? 0;
  const totalCount = graphData?.nodes?.length ?? 0;

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Header Bar */}
      <div className="flex-shrink-0 border-b border-gray-800 bg-gray-900/60 backdrop-blur-sm px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
              <GitBranch size={20} className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Obligation Graph</h1>
              <p className="text-xs text-gray-500">Inter-department compliance sequencing constraints</p>
            </div>
          </div>

          {/* Circular Selector */}
          <div className="flex items-center space-x-3">
            {circulars.length > 0 && (
              <div className="relative">
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  className="appearance-none bg-gray-800 border border-gray-700 text-white text-sm rounded-lg pl-4 pr-10 py-2 outline-none hover:border-gray-600 transition-colors cursor-pointer"
                >
                  {circulars.map(c => (
                    <option key={c._id} value={c._id}>{c.title}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {/* Stats Row */}
        {graphData && !loading && (
          <div className="flex items-center space-x-6 mt-3 pt-3 border-t border-gray-800/60">
            <Stat label="Total MAPs" value={totalCount} color="text-white" />
            <Stat label="Dependency Edges" value={edgeCount} color="text-indigo-400" />
            <Stat label="Verified" value={verifiedCount} color="text-emerald-400" />
            {blockedCount > 0 && (
              <Stat label="Blocked" value={blockedCount} color="text-red-400" />
            )}
            {edgeCount === 0 && (
              <div className="flex items-center space-x-1.5 text-xs text-gray-500">
                <Info size={12} />
                <span>No sequencing dependencies detected in this circular — all MAPs can run in parallel.</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Graph Canvas */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-950/60">
            <div className="flex flex-col items-center space-y-3 text-gray-400">
              <Loader2 size={36} className="animate-spin text-indigo-400" />
              <p className="text-sm">Calculating obligation graph...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm max-w-sm text-center">
              <AlertTriangle size={24} className="mx-auto mb-2" />
              {error}
            </div>
          </div>
        )}

        {!loading && !error && graphData?.nodes?.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center text-gray-600 space-y-2">
              <GitBranch size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-white/60 font-medium">No MAPs found in this circular.</p>
              <p className="text-sm">Ingest a circular first to build its obligation graph.</p>
            </div>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          className="bg-gray-950"
        >
          <Background color="#1e293b" gap={24} size={1} />
          <Controls className="!bg-gray-800 !border-gray-700 !fill-gray-300" />
        </ReactFlow>
      </div>

      {/* Legend */}
      <div className="flex-shrink-0 border-t border-gray-800 bg-gray-900/40 px-6 py-2.5 flex items-center space-x-6 text-xs text-gray-500 flex-wrap gap-y-1">
        <div className="flex items-center space-x-1.5"><div className="w-2 h-2 rounded-full bg-red-400" /><span>High</span></div>
        <div className="flex items-center space-x-1.5"><div className="w-2 h-2 rounded-full bg-amber-400" /><span>Medium</span></div>
        <div className="flex items-center space-x-1.5"><div className="w-2 h-2 rounded-full bg-emerald-400" /><span>Low Priority</span></div>
        <div className="w-px h-3 bg-gray-700" />
        <div className="flex items-center space-x-1.5"><AlertTriangle size={10} className="text-red-400" /><span>Blocked (predecessor unverified)</span></div>
        <div className="flex items-center space-x-1.5"><CheckCircle2 size={10} className="text-emerald-400" /><span>Verified</span></div>
        <div className="flex items-center space-x-1.5">
          <div className="w-6 h-px bg-indigo-500" />
          <span>Sequencing constraint (animated)</span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center space-x-2">
      <span className={`text-xl font-bold ${color}`}>{value}</span>
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}
