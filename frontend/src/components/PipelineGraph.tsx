import { useEffect, useCallback, useState, useRef } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type NodeProps,
  type Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import axios from 'axios';
import { getCirculars, getOverdueMAPs, getSources, addSource, scrapeSource } from '../services/api';
import { Database, Bot, ShieldCheck, Building2, Server, ShieldAlert, Plus, RefreshCw, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CustomNodeData extends Record<string, unknown> {
  label: string;
  icon?: React.ElementType;
  className?: string;
  handles?: string[];
  badge?: string;
  sourceId?: string;
  onScrape?: (id: string) => void;
  isScraping?: boolean;
}

type CustomNodeType = Node<CustomNodeData, 'customNode'>;

// Custom Node Component
const AgentNode = ({ data, isConnectable }: NodeProps<CustomNodeType>) => {
  const Icon = data.icon || Bot;
  return (
    <div className={`px-4 py-3 rounded-xl min-w-[180px] flex items-center space-x-3 ${data.className}`}>
      {data.handles?.includes('left') && <Handle id="left" type="target" position={Position.Left} isConnectable={isConnectable} className="!bg-blue-400 !border-2 !border-gray-900 !w-3 !h-3" />}
      {data.handles?.includes('top') && <Handle id="top" type="target" position={Position.Top} isConnectable={isConnectable} className="!bg-blue-400 !border-2 !border-gray-900 !w-3 !h-3" />}
      
      <div className="p-2 bg-black/20 rounded-lg">
        <Icon size={20} className="text-white/90" />
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold">{data.label}</div>
        {data.badge && (
          <div className="mt-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-black/30 w-max text-white/90">
            {data.badge}
          </div>
        )}
      </div>

      {data.onScrape && data.sourceId && (
        <button 
          onClick={() => data.onScrape!(data.sourceId!)}
          disabled={data.isScraping}
          title="Run Scraper"
          className="p-1.5 bg-black/20 hover:bg-black/40 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={data.isScraping ? "animate-spin text-blue-400" : "text-gray-300"} />
        </button>
      )}

      {data.handles?.includes('right') && <Handle id="right" type="source" position={Position.Right} isConnectable={isConnectable} className="!bg-blue-400 !border-2 !border-gray-900 !w-3 !h-3" />}
      {data.handles?.includes('bottom') && <Handle id="bottom" type="source" position={Position.Bottom} isConnectable={isConnectable} className="!bg-blue-400 !border-2 !border-gray-900 !w-3 !h-3" />}
    </div>
  );
};

const nodeTypes = {
  customNode: AgentNode,
};

// Base static nodes
const staticNodes: CustomNodeType[] = [
  { id: 'agent-monitor', type: 'customNode', position: { x: 300, y: 250 }, data: { label: 'Monitor Agent', icon: Bot, className: 'node-gradient-agent', handles: ['left', 'right'] } },
  { id: 'agent-parse', type: 'customNode', position: { x: 550, y: 250 }, data: { label: 'Parse Agent', badge: 'Idle', icon: Server, className: 'node-gradient-agent', handles: ['left', 'right'] } },
  { id: 'checkpoint', type: 'customNode', position: { x: 850, y: 250 }, data: { label: 'Compliance Officer', icon: ShieldCheck, className: 'node-gradient-human', handles: ['left', 'right', 'bottom'] } },
  { id: 'dept-it', type: 'customNode', position: { x: 1150, y: 100 }, data: { label: 'IT Dept', icon: Building2, className: 'node-gradient-dept', handles: ['left', 'bottom'] } },
  { id: 'dept-retail', type: 'customNode', position: { x: 1150, y: 250 }, data: { label: 'Retail Banking', icon: Building2, className: 'node-gradient-dept', handles: ['left', 'bottom'] } },
  { id: 'dept-legal', type: 'customNode', position: { x: 1150, y: 400 }, data: { label: 'Legal Dept', icon: Building2, className: 'node-gradient-dept', handles: ['left', 'bottom'] } },
  { id: 'agent-validate', type: 'customNode', position: { x: 850, y: 450 }, data: { label: 'Validate Agent', icon: Bot, className: 'node-gradient-agent', handles: ['left', 'top'] } },
];

const staticEdges: Edge[] = [
  { id: 'e3', source: 'agent-monitor', target: 'agent-parse', sourceHandle: 'right', targetHandle: 'left', animated: true, style: { stroke: '#8b5cf6', strokeWidth: 2 } },
  { id: 'e4', source: 'agent-parse', target: 'checkpoint', sourceHandle: 'right', targetHandle: 'left', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
  { id: 'e5', source: 'checkpoint', target: 'dept-it', sourceHandle: 'right', targetHandle: 'left', animated: false, style: { stroke: '#64748b', strokeWidth: 2 } },
  { id: 'e6', source: 'checkpoint', target: 'dept-retail', sourceHandle: 'right', targetHandle: 'left', animated: false, style: { stroke: '#64748b', strokeWidth: 2 } },
  { id: 'e7', source: 'checkpoint', target: 'dept-legal', sourceHandle: 'right', targetHandle: 'left', animated: false, style: { stroke: '#64748b', strokeWidth: 2 } },
  { id: 'e8', source: 'dept-it', target: 'agent-validate', sourceHandle: 'bottom', targetHandle: 'top', animated: false, style: { stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'e9', source: 'dept-retail', target: 'agent-validate', sourceHandle: 'bottom', targetHandle: 'top', animated: false, style: { stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'e10', source: 'dept-legal', target: 'agent-validate', sourceHandle: 'bottom', targetHandle: 'top', animated: false, style: { stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'e11', source: 'agent-validate', target: 'checkpoint', sourceHandle: 'left', targetHandle: 'bottom', animated: false, style: { stroke: '#f59e0b', strokeWidth: 2 } },
];

export default function PipelineGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomNodeType>(staticNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(staticEdges);
  const [overdueCount, setOverdueCount] = useState(0);
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  // BUG-FE2-005: In-component error state to replace blocking alert() calls
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const navigate = useNavigate();

  const isMountedRef = useRef(true);
  useEffect(() => {
    // BUG-FE2-040: Removed redundant isMountedRef.current = true
    return () => { isMountedRef.current = false; };
  }, []);

  // BUG-FE2-035: Add global escape key listener for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddSource(false);
    };
    if (showAddSource) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAddSource]);

  const fetchStatusRef = useRef<() => Promise<void>>(undefined);

  const handleScrape = useCallback(async (sourceId: string) => {
    // Set scraping state
    setNodes(nds => nds.map(n => 
      n.id === `src-${sourceId}` ? { ...n, data: { ...n.data, isScraping: true, badge: 'Scraping...' } } : n
    ));
    try {
      await scrapeSource(sourceId);
      // Success
      setNodes(nds => nds.map(n => 
        n.id === `src-${sourceId}` ? { ...n, data: { ...n.data, isScraping: false, badge: 'Scraped Just Now' } } : n
      ));
      fetchStatusRef.current?.(); // refresh dashboard
    } catch (err) {
      // BUG-FE2-005: Replace blocking alert() with in-component error state
      const msg = axios.isAxiosError(err)
        ? (err.response?.data?.details || err.message)
        : (err as Error).message;
      setScrapeError(`Scraping failed: ${msg}`);
      console.error("Scraping failed", err);
      setNodes(nds => nds.map(n => 
        n.id === `src-${sourceId}` ? { ...n, data: { ...n.data, isScraping: false, badge: 'Error' } } : n
      ));
    }
  }, [setNodes]);

  const fetchStatus = useCallback(async () => {
    try {
      // BUG-FE2-013: Type API responses instead of using any
      interface CircularResponse { status: string; }
      interface SourceResponse { _id: string; name: string; url: string; last_scraped: string | null; }
      const [circulars, overdue, sources]: [CircularResponse[], unknown[], SourceResponse[]] = await Promise.all([getCirculars(), getOverdueMAPs(), getSources()]);
      if (!isMountedRef.current) return;
      
      const parsedCount = circulars.filter((c: CircularResponse) => c.status === 'parsed').length;
      setOverdueCount(overdue.length);
      
      // Build Source Nodes
      const sourceNodes: CustomNodeType[] = sources.map((s: SourceResponse, idx: number) => ({
        id: `src-${s._id}`,
        type: 'customNode',
        position: { x: 50, y: 100 + (idx * 150) },
        data: { 
          label: s.name, 
          icon: Database, 
          className: 'node-gradient-source', 
          handles: ['right'],
          sourceId: s._id,
          onScrape: handleScrape,
          badge: s.last_scraped ? new Date(s.last_scraped).toLocaleDateString() : 'Never'
        }
      }));

      // Connect Source nodes to Monitor Agent
      const sourceEdges: Edge[] = sources.map((s: SourceResponse) => ({
        id: `e-src-${s._id}`,
        source: `src-${s._id}`,
        target: 'agent-monitor',
        sourceHandle: 'right',
        targetHandle: 'left',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 }
      }));

      setNodes((nds) => {
        // We replace existing source nodes and update badges for others
        const updatedStatic = staticNodes.map((node) => {
          if (node.id === 'agent-parse') {
            return { ...node, data: { ...node.data, badge: parsedCount > 0 ? `Parsed: ${parsedCount}` : 'Idle' } };
          }
          if (node.id === 'agent-validate') {
            return { ...node, data: { ...node.data, badge: overdue.length > 0 ? `⚠ ${overdue.length} Overdue` : 'Active' } };
          }
          return node;
        });

        // Keep current scraping state if a node is currently scraping
        const finalSourceNodes = sourceNodes.map(sn => {
          const existing = nds.find(n => n.id === sn.id);
          if (existing?.data.isScraping) {
            return { ...sn, data: { ...sn.data, isScraping: true, badge: 'Scraping...' } };
          }
          return sn;
        });

        return [...finalSourceNodes, ...updatedStatic];
      });

      setEdges([...sourceEdges, ...staticEdges]);
    } catch (err) {
      console.error("Failed to fetch status:", err);
    }
  }, [setNodes, setEdges, handleScrape]);

  useEffect(() => {
    fetchStatusRef.current = fetchStatus;
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatusRef.current?.();
    // Only poll every 10s to avoid overriding scraping state too aggressively
    const interval = setInterval(() => {
      fetchStatusRef.current?.();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await addSource({ name: newSourceName, url: newSourceUrl });
      setShowAddSource(false);
      setNewSourceName('');
      setNewSourceUrl('');
      // BUG-FE2-014: Consistent fetchStatus call pattern
      fetchStatusRef.current?.();
    } catch (err) {
      // BUG-FE2-005: Replace blocking alert() with in-component error state
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error || "Failed to add source") : "Failed to add source";
      setScrapeError(msg);
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full h-full bg-gray-950 relative">
      {/* Overdue Alert Overlay */}
      {overdueCount > 0 && (
        <button
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-3 bg-red-500/15 border border-red-500/40 backdrop-blur-sm px-5 py-3 rounded-xl shadow-xl cursor-pointer hover:bg-red-500/25 transition-colors"
          onClick={() => navigate('/audit')}
        >
          <ShieldAlert size={18} className="text-red-400 flex-shrink-0" />
          <span className="text-red-300 font-semibold text-sm">
            Autonomous Monitor: {overdueCount} overdue MAP{overdueCount > 1 ? 's' : ''} detected
          </span>
          <span className="text-red-400/70 text-xs">→ View in Audit Report</span>
        </button>
      )}

      {/* BUG-FE2-005: Inline error toast instead of blocking alert() */}
      {scrapeError && (
        <div className="absolute bottom-6 right-6 z-20 flex items-center space-x-3 bg-red-900/90 border border-red-500/40 backdrop-blur-sm px-4 py-3 rounded-xl shadow-xl max-w-sm">
          <span className="text-red-300 text-sm flex-1">{scrapeError}</span>
          <button type="button" onClick={() => setScrapeError(null)} className="text-red-400 hover:text-red-200 flex-shrink-0">✕</button>
        </div>
      )}

      {/* Floating Add Source Action */}
      <button 
        onClick={() => setShowAddSource(true)}
        className="absolute bottom-6 left-6 z-10 flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-lg shadow-lg transition-colors font-medium text-sm"
      >
        <Plus size={16} />
        <span>Add Source</span>
      </button>

      {/* Add Source Modal */}
      {showAddSource && (
        <div 
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-source-title"
        >
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 id="add-source-title" className="text-xl font-bold text-white">Add Scraper Source</h3>
              <button type="button" onClick={() => setShowAddSource(false)} aria-label="Close add source dialog" className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleAddSource} className="space-y-4">
              <div>
                <label htmlFor="source-name" className="block text-sm font-medium text-gray-300 mb-1">Source Name</label>
                <input 
                  id="source-name"
                  type="text" 
                  required
                  placeholder="e.g. RBI Master Directions"
                  value={newSourceName}
                  onChange={e => setNewSourceName(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label htmlFor="target-url" className="block text-sm font-medium text-gray-300 mb-1">Target URL</label>
                <input 
                  id="target-url"
                  type="url" 
                  required
                  placeholder="https://rbi.org.in/..."
                  value={newSourceUrl}
                  onChange={e => setNewSourceUrl(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button 
                  type="button" 
                  onClick={() => setShowAddSource(false)}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="px-5 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding...' : 'Save Source'}
                </button>
              </div>
            </form>
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
        className="bg-gray-950"
      >
        <Background color="#334155" gap={20} size={1} />
        <Controls className="!bg-gray-800 !border-gray-700 !fill-gray-300" />
      </ReactFlow>
    </div>
  );
}
