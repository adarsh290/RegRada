import { useState, useEffect } from 'react';
import { getCirculars, approveMAP } from '../services/api';
import DeltaReportModal from './DeltaReportModal';
import { ChevronDown, ChevronUp, FileText, Calendar, Building2, AlertCircle, Link, Flame } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/authContext';

interface MAP {
  map_id: string;
  action_title: string;
  department: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
  status: string;
  assigned_to: string;
  confidence?: number;
  needs_co_review?: boolean;
}

interface Circular {
  _id: string;
  title: string;
  source: string;
  summary: string;
  extraction_mode: string;
  date_published: string;
  maps: MAP[];
  amends?: string;
  delta_report?: any;
  has_conflicts?: boolean;
}

export default function ComplianceInbox() {
  const { user } = useAuth();
  const [circulars, setCirculars] = useState<Circular[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deltaReportData, setDeltaReportData] = useState<{ report: any, source: string } | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    fetchCirculars(abortController.signal);
    return () => {
      abortController.abort();
    };
  }, []);

  const fetchCirculars = async (signal?: AbortSignal) => {
    try {
      setError(null);
      const data = await getCirculars({ signal });
      if (!signal?.aborted) {
        setCirculars(data);
      }
    } catch (error: any) {
      if (axios.isCancel(error) || error.name === 'CanceledError') {
        return;
      }
      console.error("Failed to fetch circulars:", error);
      setError("Failed to fetch circulars from server.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleApproveMap = async (circularId: string, mapId: string) => {
    setApprovingId(mapId);
    setApproveError(null);
    // BUG-FE2-004: Use AbortController for post-approve refresh to avoid unmounted state updates
    const controller = new AbortController();
    try {
      await approveMAP(circularId, mapId);
      await fetchCirculars(controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error('Failed to approve MAP:', err);
        // BUG-FE2-015: Replace blocking alert() with in-component error state
        setApproveError('Failed to approve MAP. Please try again.');
      }
    } finally {
      setApprovingId(null);
    }
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
      case 'pending_review': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      // BUG-CONTRACT-015: Handle 'escalated' in ComplianceInbox.getStatusColor()
      case 'escalated': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20 text-red-400">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-white">Failed to Load Inbox</h2>
        <p className="text-gray-400 text-sm">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            fetchCirculars();
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-lg"
        >
          Try Again
        </button>
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

      {/* BUG-FE2-015: Inline approval error instead of blocking alert() */}
      {approveError && (
        <div className="mb-4 flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <span className="text-sm text-red-400">{approveError}</span>
          <button type="button" onClick={() => setApproveError(null)} className="ml-3 text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

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
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleExpand(circular._id); }}
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
                      {(circular.extraction_mode || '').replace('llm_', '').toUpperCase()}
                    </span>
                    {circular.amends && circular.delta_report && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setDeltaReportData({ report: circular.delta_report, source: circular.amends! }); }}
                        className="px-2.5 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 text-xs font-semibold rounded border border-indigo-500/20 flex items-center transition-colors"
                      >
                        <Link size={12} className="mr-1" />
                        Amends: {circular.amends}
                      </button>
                    )}
                    {circular.has_conflicts && (
                      <span className="px-2.5 py-1 bg-red-500/10 text-red-400 text-xs font-semibold rounded border border-red-500/20 flex items-center">
                        <Flame size={12} className="mr-1" />
                        Conflict
                      </span>
                    )}
                    <span className="text-gray-500 text-xs flex items-center">
                      <Calendar size={12} className="mr-1" />
                      {/* BUG-FE2-026: Validate date before rendering to avoid 'Invalid Date' */}
                      {circular.date_published && !isNaN(new Date(circular.date_published).getTime()) 
                        ? new Date(circular.date_published).toLocaleDateString() 
                        : 'Unknown'}
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
                            <td className="py-4 pr-4">
                              <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded border ${getStatusColor(map.status)}`}>
                                {map.status.replace(/_/g, ' ')}
                              </span>
                              {(map.status === 'submitted' || map.status === 'pending_review') && user?.role === 'CO' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleApproveMap(circular._id, map.map_id); }}
                                  disabled={approvingId === map.map_id}
                                  className="ml-2 px-2 py-1 bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 rounded text-[10px] font-bold uppercase transition-colors disabled:opacity-50"
                                >
                                  {approvingId === map.map_id ? 'Approving...' : 'Approve'}
                                </button>
                              )}
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

      {deltaReportData && (
        <DeltaReportModal 
          report={deltaReportData.report} 
          source={deltaReportData.source} 
          onClose={() => setDeltaReportData(null)} 
        />
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
