import { useState, useEffect } from 'react';
import { getCirculars } from '../services/api';
import { ChevronDown, ChevronUp, FileText, Calendar, Building2, AlertCircle } from 'lucide-react';

interface MAP {
  map_id: string;
  action_title: string;
  department: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
  status: string;
  assigned_to: string;
}

interface Circular {
  _id: string;
  title: string;
  source: string;
  summary: string;
  extraction_mode: string;
  date_published: string;
  maps: MAP[];
}

export default function ComplianceInbox() {
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetchCirculars();
  }, []);

  const fetchCirculars = async () => {
    try {
      const data = await getCirculars();
      setCirculars(data);
    } catch (error) {
      console.error("Failed to fetch circulars:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'medium': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'low': return 'bg-green-500/10 text-green-400 border-green-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'rejected': return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'submitted': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'in_progress': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default: return 'bg-gray-800 text-gray-400 border-gray-700';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-gray-400 font-medium">Loading Inbox...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Compliance Inbox</h1>
          <p className="text-gray-400 text-sm">Review processed circulars and their action points.</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 px-4 py-2 rounded-lg flex items-center space-x-2">
          <span className="text-gray-400 text-sm">Total Processed:</span>
          <span className="text-white font-bold">{circulars.length}</span>
        </div>
      </div>

      {circulars.length === 0 ? (
        <div className="text-center py-20 bg-gray-900/50 rounded-2xl border border-gray-800 border-dashed">
          <FileText size={48} className="mx-auto text-gray-700 mb-4" />
          <h3 className="text-xl text-gray-400 font-semibold">Inbox is Empty</h3>
          <p className="text-gray-500 mt-2">No circulars have been ingested yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {circulars.map((circular) => (
            <div key={circular._id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden transition-all">
              {/* Card Header (Clickable) */}
              <div 
                className="p-6 cursor-pointer hover:bg-gray-800/50 transition-colors flex items-start justify-between"
                onClick={() => toggleExpand(circular._id)}
              >
                <div className="flex-1 pr-8">
                  <div className="flex items-center space-x-3 mb-2">
                    <span className="px-2.5 py-1 bg-gray-800 text-gray-300 text-xs font-mono rounded border border-gray-700">
                      {circular.source}
                    </span>
                    <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 text-xs font-semibold rounded border border-blue-500/20 flex items-center">
                      <BotIcon />
                      {circular.extraction_mode.replace('llm_', '').toUpperCase()}
                    </span>
                    <span className="text-gray-500 text-xs flex items-center">
                      <Calendar size={12} className="mr-1" />
                      {new Date(circular.date_published).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{circular.title}</h3>
                  <p className="text-gray-400 text-sm line-clamp-2">{circular.summary}</p>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{circular.maps.length}</div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold">MAPs</div>
                  </div>
                  <div className="p-2 text-gray-500">
                    {expandedId === circular._id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
              </div>

              {/* Card Body (Expanded) */}
              {expandedId === circular._id && (
                <div className="border-t border-gray-800 bg-gray-950/50 p-6">
                  <h4 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center">
                    <AlertCircle size={16} className="mr-2 text-blue-400" />
                    Measurable Action Points
                  </h4>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800">
                          <th className="pb-3 font-medium">ID</th>
                          <th className="pb-3 font-medium">Action Requirement</th>
                          <th className="pb-3 font-medium">Department</th>
                          <th className="pb-3 font-medium">Deadline</th>
                          <th className="pb-3 font-medium">Priority</th>
                          <th className="pb-3 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/50">
                        {circular.maps.map((map) => (
                          <tr key={map.map_id} className="text-sm hover:bg-gray-900/50 transition-colors">
                            <td className="py-4 pr-4 font-mono text-gray-400 whitespace-nowrap">{map.map_id}</td>
                            <td className="py-4 pr-4 text-gray-200">{map.action_title}</td>
                            <td className="py-4 pr-4">
                              <span className="flex items-center text-gray-300">
                                <Building2 size={14} className="mr-1.5 text-gray-500" />
                                {map.assigned_to}
                              </span>
                            </td>
                            <td className="py-4 pr-4 text-gray-400 whitespace-nowrap">{map.deadline}</td>
                            <td className="py-4 pr-4">
                              <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded border ${getPriorityColor(map.priority)}`}>
                                {map.priority}
                              </span>
                            </td>
                            <td className="py-4">
                              <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded border ${getStatusColor(map.status)}`}>
                                {map.status.replace('_', ' ')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BotIcon() {
  return (
    <svg 
      className="w-3 h-3 mr-1" 
      fill="none" 
      stroke="currentColor" 
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}
