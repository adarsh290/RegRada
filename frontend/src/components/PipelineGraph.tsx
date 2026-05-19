import { useEffect, useCallback, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type NodeProps
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { getCirculars, getOverdueMAPs } from '../services/api';
import { Database, Bot, ShieldCheck, Building2, Server, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CustomNodeData extends Record<string, unknown> {
  label: string;
  icon?: React.ElementType;
  className?: string;
  handles?: string[];
  badge?: string;
}

type CustomNodeType = Node<CustomNodeData, 'customNode'>;

// Custom Node Component
const AgentNode = ({ data, isConnectable }: NodeProps<CustomNodeType>) => {
  const Icon = data.icon || Bot;
  return (
    <div className={`px-4 py-3 rounded-xl min-w-[180px] flex items-center space-x-3 ${data.className}`}>
      {data.handles?.includes('left') && <Handle type="target" position={Position.Left} isConnectable={isConnectable} className="!bg-blue-400 !border-2 !border-gray-900 !w-3 !h-3" />}
      {data.handles?.includes('top') && <Handle type="target" position={Position.Top} isConnectable={isConnectable} className="!bg-blue-400 !border-2 !border-gray-900 !w-3 !h-3" />}
      
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

      {data.handles?.includes('right') && <Handle type="source" position={Position.Right} isConnectable={isConnectable} className="!bg-blue-400 !border-2 !border-gray-900 !w-3 !h-3" />}
      {data.handles?.includes('bottom') && <Handle type="source" position={Position.Bottom} isConnectable={isConnectable} className="!bg-blue-400 !border-2 !border-gray-900 !w-3 !h-3" />}
    </div>
  );
};

const nodeTypes = {
  customNode: AgentNode,
};

const initialNodes = [
  { id: 'src-rbi', type: 'customNode', position: { x: 50, y: 150 }, data: { label: 'RBI Source', icon: Database, className: 'node-gradient-source', handles: ['right'] } },
  { id: 'src-sebi', type: 'customNode', position: { x: 50, y: 350 }, data: { label: 'SEBI Source', icon: Database, className: 'node-gradient-source', handles: ['right'] } },
  
  { id: 'agent-monitor', type: 'customNode', position: { x: 300, y: 250 }, data: { label: 'Monitor Agent', icon: Bot, className: 'node-gradient-agent', handles: ['left', 'right'] } },
  { id: 'agent-parse', type: 'customNode', position: { x: 550, y: 250 }, data: { label: 'Parse Agent', badge: 'Idle', icon: Server, className: 'node-gradient-agent', handles: ['left', 'right'] } },
  
  { id: 'checkpoint', type: 'customNode', position: { x: 850, y: 250 }, data: { label: 'Compliance Officer', icon: ShieldCheck, className: 'node-gradient-human', handles: ['left', 'right', 'bottom'] } },
  
  { id: 'dept-it', type: 'customNode', position: { x: 1150, y: 100 }, data: { label: 'IT Dept', icon: Building2, className: 'node-gradient-dept', handles: ['left', 'bottom'] } },
  { id: 'dept-retail', type: 'customNode', position: { x: 1150, y: 250 }, data: { label: 'Retail Banking', icon: Building2, className: 'node-gradient-dept', handles: ['left', 'bottom'] } },
  { id: 'dept-legal', type: 'customNode', position: { x: 1150, y: 400 }, data: { label: 'Legal Dept', icon: Building2, className: 'node-gradient-dept', handles: ['left', 'bottom'] } },

  { id: 'agent-validate', type: 'customNode', position: { x: 850, y: 450 }, data: { label: 'Validate Agent', icon: Bot, className: 'node-gradient-agent', handles: ['left', 'top'] } },
];

const initialEdges = [
  { id: 'e1', source: 'src-rbi', target: 'agent-monitor', animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } },
  { id: 'e2', source: 'src-sebi', target: 'agent-monitor', animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } },
  { id: 'e3', source: 'agent-monitor', target: 'agent-parse', animated: true, style: { stroke: '#8b5cf6', strokeWidth: 2 } },
  { id: 'e4', source: 'agent-parse', target: 'checkpoint', animated: true, style: { stroke: '#10b981', strokeWidth: 2 } },
  
  { id: 'e5', source: 'checkpoint', target: 'dept-it', animated: false, style: { stroke: '#64748b', strokeWidth: 2 } },
  { id: 'e6', source: 'checkpoint', target: 'dept-retail', animated: false, style: { stroke: '#64748b', strokeWidth: 2 } },
  { id: 'e7', source: 'checkpoint', target: 'dept-legal', animated: false, style: { stroke: '#64748b', strokeWidth: 2 } },
  
  { id: 'e8', source: 'dept-it', target: 'agent-validate', sourceHandle: 'bottom', targetHandle: 'top', animated: false, style: { stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'e9', source: 'dept-retail', target: 'agent-validate', sourceHandle: 'bottom', targetHandle: 'top', animated: false, style: { stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'e10', source: 'dept-legal', target: 'agent-validate', sourceHandle: 'bottom', targetHandle: 'top', animated: false, style: { stroke: '#f59e0b', strokeWidth: 2 } },
  
  { id: 'e11', source: 'agent-validate', target: 'checkpoint', sourceHandle: 'left', targetHandle: 'bottom', animated: false, style: { stroke: '#f59e0b', strokeWidth: 2 } },
];

export default function PipelineGraph() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes as any);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const [overdueCount, setOverdueCount] = useState(0);
  const navigate = useNavigate();

  const fetchStatus = useCallback(async () => {
    try {
      const [circulars, overdue] = await Promise.all([getCirculars(), getOverdueMAPs()]);
      const parsedCount = circulars.filter((c: any) => c.status === 'parsed').length;
      setOverdueCount(overdue.length);
      
      setNodes((nds) => 
        nds.map((node) => {
          if (node.id === 'agent-parse') {
            return { ...node, data: { ...node.data, badge: parsedCount > 0 ? `Parsed: ${parsedCount}` : 'Idle' } };
          }
          if (node.id === 'agent-validate') {
            return { ...node, data: { ...node.data, badge: overdue.length > 0 ? `⚠ ${overdue.length} Overdue` : 'Active' } };
          }
          return node;
        })
      );
    } catch (err) {
      console.error("Failed to fetch status:", err);
    }
  }, [setNodes]);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  return (
    <div className="w-full h-full bg-gray-950 relative">
      {/* Overdue Alert Overlay */}
      {overdueCount > 0 && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center space-x-3 bg-red-500/15 border border-red-500/40 backdrop-blur-sm px-5 py-3 rounded-xl shadow-xl cursor-pointer hover:bg-red-500/25 transition-colors"
          onClick={() => navigate('/audit')}
        >
          <ShieldAlert size={18} className="text-red-400 flex-shrink-0" />
          <span className="text-red-300 font-semibold text-sm">
            Autonomous Monitor: {overdueCount} overdue MAP{overdueCount > 1 ? 's' : ''} detected
          </span>
          <span className="text-red-400/70 text-xs">→ View in Audit Report</span>
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
