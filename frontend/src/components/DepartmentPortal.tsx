import { useState, useEffect } from 'react';
import { getCirculars, getSubmissions } from '../services/api';
import ProofUploadModal from './ProofUploadModal';
import {
  Building2, ClipboardList, CheckCircle2, Clock, AlertCircle,
  XCircle, ChevronRight, FileCheck, Upload
} from 'lucide-react';

interface MAP {
  _id: string;
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
  maps: MAP[];
}

interface MAPWithCircular extends MAP {
  circular_id: string;
  circular_title: string;
  circular_source: string;
}

interface AIVerdict {
  is_compliant: boolean;
  confidence: number;
  reasoning: string;
  missing_items: string[];
  verdict: 'verified' | 'rejected';
}

interface Submission {
  _id: string;
  circular_id: string;
  map_id: string;
  status: string;
  original_filename: string;
  submitted_at: string;
  ai_verdict?: AIVerdict;
}

interface DepartmentPortalProps {
  department: string;
}

export default function DepartmentPortal({ department }: DepartmentPortalProps) {
  const [myMaps, setMyMaps] = useState<MAPWithCircular[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadTarget, setUploadTarget] = useState<MAPWithCircular | null>(null);

  useEffect(() => {
    fetchData();
  }, [department]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [circulars, subs] = await Promise.all([
        getCirculars(),
        getSubmissions(department),
      ]);

      // Flatten MAPs across all circulars, filtered by this department
      const maps: MAPWithCircular[] = [];
      (circulars as Circular[]).forEach((circ) => {
        circ.maps
          .filter((m) => m.assigned_to === department || m.department === department)
          .forEach((m) => {
            maps.push({
              ...m,
              circular_id: circ._id,
              circular_title: circ.title,
              circular_source: circ.source,
            });
          });
      });

      setMyMaps(maps);
      setSubmissions(subs);
    } catch (err) {
      console.error('Failed to load department data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getSubmissionForMap = (circularId: string, mapId: string) =>
    submissions.find((s) => s.circular_id === circularId && s.map_id === mapId);

  const stats = {
    total: myMaps.length,
    pending: myMaps.filter((m) => m.status === 'pending').length,
    submitted: myMaps.filter((m) => m.status === 'submitted').length,
    verified: myMaps.filter((m) => m.status === 'verified').length,
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-400 bg-red-500/10 border-red-500/30';
      case 'medium': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'low': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      default: return 'text-gray-400 bg-gray-800 border-gray-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified': return <CheckCircle2 size={16} className="text-emerald-400" />;
      case 'submitted': return <Clock size={16} className="text-amber-400" />;
      case 'rejected': return <XCircle size={16} className="text-red-400" />;
      default: return <AlertCircle size={16} className="text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'verified': return { label: 'Verified', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
      case 'submitted': return { label: 'Awaiting Review', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
      case 'rejected': return { label: 'Rejected', cls: 'text-red-400 bg-red-500/10 border-red-500/30' };
      default: return { label: 'Pending', cls: 'text-gray-400 bg-gray-800 border-gray-700' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-gray-400 font-medium">Loading your action items...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-8">
        {/* Department Header */}
        <div className="mb-8 flex items-center space-x-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
            <Building2 size={28} className="text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{department} Portal</h1>
            <p className="text-gray-400 text-sm mt-0.5">Your assigned compliance action points</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Total Tasks', value: stats.total, icon: ClipboardList, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
            { label: 'Pending', value: stats.pending, icon: AlertCircle, color: 'text-gray-400 bg-gray-800 border-gray-700' },
            { label: 'Submitted', value: stats.submitted, icon: Clock, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
            { label: 'Verified', value: stats.verified, icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`rounded-xl border p-4 ${color}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</span>
                <Icon size={18} />
              </div>
              <div className="text-3xl font-bold text-white">{value}</div>
            </div>
          ))}
        </div>

        {/* MAP Cards */}
        {myMaps.length === 0 ? (
          <div className="text-center py-20 bg-gray-900/50 rounded-2xl border border-gray-800 border-dashed">
            <FileCheck size={48} className="mx-auto text-gray-700 mb-4" />
            <h3 className="text-xl text-gray-400 font-semibold">No Action Items</h3>
            <p className="text-gray-500 mt-2">No MAPs have been assigned to {department} yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {myMaps.map((map) => {
              const existingSub = getSubmissionForMap(map.circular_id, map.map_id);
              const { label: statusLabel, cls: statusCls } = getStatusLabel(map.status);

              return (
                <div
                  key={`${map.circular_id}-${map.map_id}`}
                  className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors"
                >
                  {/* Card Top Row */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span className="font-mono text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded border border-gray-700">
                        {map.map_id}
                      </span>
                      <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${getPriorityStyle(map.priority)}`}>
                        {map.priority}
                      </span>
                    </div>
                    <div className={`flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${statusCls}`}>
                      {getStatusIcon(map.status)}
                      <span>{statusLabel}</span>
                    </div>
                  </div>

                  {/* Action Title */}
                  <p className="text-white font-semibold mb-3 leading-relaxed">{map.action_title}</p>

                  {/* Meta Row */}
                  <div className="flex items-center space-x-6 text-sm text-gray-500 mb-5">
                    <span className="flex items-center space-x-1.5">
                      <ChevronRight size={14} />
                      <span className="text-gray-300">{map.circular_source}</span>
                      <span>·</span>
                      <span className="truncate max-w-[200px]">{map.circular_title}</span>
                    </span>
                    <span className="flex items-center space-x-1.5">
                      <Clock size={14} />
                      <span>Due: {map.deadline}</span>
                    </span>
                  </div>

                  {/* Existing Submission Info or Upload Button */}
                  {existingSub ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-gray-950 rounded-lg px-4 py-3 border border-gray-800">
                        <div className="flex items-center space-x-3">
                          <FileCheck size={18} className="text-emerald-400" />
                          <div>
                            <p className="text-sm text-white font-medium">{existingSub.original_filename}</p>
                            <p className="text-xs text-gray-500">
                              Submitted {new Date(existingSub.submitted_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        {map.status === 'pending' || map.status === 'rejected' ? (
                          <button
                            onClick={() => setUploadTarget(map)}
                            className="text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 font-medium px-3 py-1.5 rounded border border-blue-500/30 transition-colors"
                          >
                            Re-upload
                          </button>
                        ) : null}
                      </div>

                      {/* AI Rejection Feedback */}
                      {map.status === 'rejected' && existingSub.ai_verdict && (
                        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 mt-2">
                          <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center">
                            <AlertCircle size={16} className="mr-2" />
                            AI Auditor Feedback
                          </h4>
                          <p className="text-sm text-red-300/90 leading-relaxed mb-3">
                            {existingSub.ai_verdict.reasoning}
                          </p>
                          {existingSub.ai_verdict.missing_items && existingSub.ai_verdict.missing_items.length > 0 && (
                            <div>
                              <h5 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Missing Items to Fix:</h5>
                              <ul className="space-y-1.5">
                                {existingSub.ai_verdict.missing_items.map((item, idx) => (
                                  <li key={idx} className="flex items-start text-xs text-red-300/80">
                                    <span className="text-red-500 mr-2 font-bold">•</span>
                                    <span className="leading-relaxed">{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setUploadTarget(map)}
                      disabled={map.status === 'verified'}
                      className="w-full flex items-center justify-center space-x-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-medium rounded-lg px-4 py-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Upload size={16} />
                      <span>Upload Proof of Compliance</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {uploadTarget && (
        <ProofUploadModal
          circularId={uploadTarget.circular_id}
          mapId={uploadTarget.map_id}
          mapAction={uploadTarget.action_title}
          onClose={() => setUploadTarget(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}
