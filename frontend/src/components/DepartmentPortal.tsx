import { useState, useEffect } from 'react';
import { getCirculars, getSubmissions, rejectMAP } from '../services/api';
import ProofUploadModal from './ProofUploadModal';
import {
  Building2, ClipboardList, CheckCircle2, Clock, AlertCircle,
  XCircle, ChevronRight, FileCheck, Upload
} from 'lucide-react';
import axios from 'axios';

interface MAP {
  _id: string;
  map_id: string;
  action_title: string;
  department: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
  status: string;
  assigned_to: string;
  audit_trail?: { action: string; by: string; comment: string; timestamp: string }[];
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
  // BUG-CONTRACT-022: Add proof_files to Submission interface
  proof_files?: { original_filename: string; file_size: number; file_path?: string }[];
}

interface DepartmentPortalProps {
  department: string;
}

export default function DepartmentPortal({ department }: DepartmentPortalProps) {
  const [myMaps, setMyMaps] = useState<MAPWithCircular[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<{ circular_id: string; map_id: string; action_title: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<MAPWithCircular | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState(''); // BUG-FE2-016: Inline error state for reject modal

  useEffect(() => {
    const abortController = new AbortController();
    fetchData(abortController.signal);
    return () => {
      abortController.abort();
    };
  }, [department]);

  const fetchData = async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [circulars, subs] = await Promise.all([
        getCirculars({ signal }),
        getSubmissions(department, { signal }),
      ]);

      if (signal?.aborted) return;

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
      // BUG-FE2-003: Narrow err type before accessing .name to avoid TypeScript error and runtime risk
      if (axios.isCancel(err) || (err instanceof Error && err.name === 'CanceledError')) {
        return;
      }
      console.error('Failed to load department data:', err);
      setError('Failed to load department data from server.');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const getSubmissionForMap = (circularId: string, mapId: string) =>
    submissions.find((s) => s.circular_id === circularId && s.map_id === mapId);

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setRejecting(true);
    setRejectError('');
    try {
      await rejectMAP(rejectTarget.circular_id, rejectTarget.map_id, rejectReason);
      // BUG-FE2-010: Remove dangling AbortController — the useEffect cleanup handles mount-level abort.
      // A best-effort refresh here does not need an isolated controller.
      await fetchData();
      setRejectTarget(null);
      setRejectReason('');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setRejectError(err.response?.data?.error || "Failed to reject task. Please try again.");
      } else {
        setRejectError("Failed to reject task. Please try again.");
      }
    } finally {
      setRejecting(false);
    }
  };

  const stats = {
    total: myMaps.length,
    // BUG-FE2-019: Only count truly 'pending' or 'in_progress' as pending — not rejected/escalated
    pending: myMaps.filter((m) => ['pending', 'in_progress'].includes(m.status)).length,
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20 text-red-400">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-white">Failed to Load Portal Data</h2>
        <p className="text-gray-400 text-sm">{error}</p>
        <button
          onClick={() => {
            fetchData();
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-lg"
        >
          Try Again
        </button>
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
                    <div className="flex space-x-2">
                      <button
                        onClick={() => setUploadTarget(map)}
                        disabled={map.status === 'verified'}
                        className="flex-1 flex items-center justify-center space-x-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-medium rounded-lg px-4 py-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Upload size={16} />
                        <span>Upload Proof of Compliance</span>
                      </button>
                      <button
                        onClick={() => setRejectTarget(map)}
                        disabled={map.status === 'verified'}
                        className="flex-1 flex items-center justify-center space-x-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-medium rounded-lg px-4 py-3 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <XCircle size={16} />
                        <span>Reject Task</span>
                      </button>
                    </div>
                  )}

                  {/* Audit Trail Feedback */}
                  {map.audit_trail && map.audit_trail.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h5 className="text-xs font-bold text-gray-500 uppercase">Audit Trail:</h5>
                      {map.audit_trail.map((log, idx) => (
                        <div key={idx} className="bg-gray-950 p-3 rounded-lg border border-gray-800 text-sm">
                          <span className="font-semibold text-blue-400">{log.action}</span> by {log.by}:
                          <p className="text-gray-300 mt-1 italic">{log.comment}</p>
                        </div>
                      ))}
                    </div>
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

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-red-500/30 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-lg font-bold text-red-400 flex items-center">
                <AlertCircle size={20} className="mr-2" />
                Reject Task: {rejectTarget.map_id}
              </h3>
            </div>
            <div className="p-6">
              {rejectError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start text-red-400 text-sm">
                  <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                  <p>{rejectError}</p>
                </div>
              )}
              {/* BUG-FE2-028: Added missing accessible label for textarea */}
              <label htmlFor="reject-reason" className="block text-gray-300 text-sm mb-2 font-medium">
                Reason for Rejection
              </label>
              <p className="text-gray-400 text-xs mb-4">Please provide a reason for rejecting this task. The AI will re-evaluate its assignment based on your feedback.</p>
              <textarea
                id="reject-reason"
                className="w-full bg-gray-950 border border-gray-700 rounded-lg p-3 text-white focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-colors"
                rows={4}
                placeholder="E.g., This system was decommissioned, or this falls under the Legal department's purview."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end space-x-3 bg-gray-950/50">
              <button
                onClick={() => setRejectTarget(null)}
                className="px-4 py-2 text-gray-400 hover:text-white font-medium"
                disabled={rejecting}
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting || !rejectReason.trim()}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center"
              >
                {rejecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Rejecting...
                  </>
                ) : 'Submit Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
