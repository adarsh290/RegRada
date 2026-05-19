import { useState, useEffect } from 'react';
import { getSubmissions, getOverdueMAPs } from '../services/api';
import {
  CheckCircle2, XCircle, AlertCircle, FileText, ChevronRight,
  BrainCircuit, Calendar, FileSearch, Clock, Flame, Building2, ShieldAlert
} from 'lucide-react';

interface AIVerdict {
  is_compliant: boolean;
  confidence: number;
  reasoning: string;
  missing_items: string[];
  verdict: 'verified' | 'rejected';
  evaluated_at: string;
}

interface Submission {
  _id: string;
  circular_id: string;
  circular_title: string;
  map_id: string;
  map_action: string;
  department: string;
  status: string;
  original_filename: string;
  ai_verdict?: AIVerdict;
  submitted_at: string;
}

interface OverdueMAP {
  circular_id: string;
  circular_title: string;
  circular_source: string;
  map_id: string;
  action_title: string;
  department: string;
  deadline: string;
  priority: string;
  status: string;
  days_overdue: number;
}

type ActiveTab = 'submissions' | 'overdue';

export default function AuditDashboard() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [overdueMaps, setOverdueMaps] = useState<OverdueMAP[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('submissions');

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    try {
      const [subs, overdue] = await Promise.all([getSubmissions(), getOverdueMAPs()]);
      setSubmissions(subs);
      setOverdueMaps(overdue);
    } catch (error) {
      console.error("Failed to fetch audit data:", error);
    } finally {
      setLoading(false);
    }
  };

  const total = submissions.length;
  const verifiedCount = submissions.filter(s => s.status === 'verified').length;
  const rejectedCount = submissions.filter(s => s.status === 'rejected').length;
  const avgConfidence = submissions.reduce((acc, curr) => acc + (curr.ai_verdict?.confidence || 0), 0)
    / (submissions.filter(s => s.ai_verdict).length || 1);

  const getStatusBadge = (status: string, ai_verdict?: AIVerdict) => {
    if (status === 'verified') {
      return (
        <span className="flex items-center w-max px-2.5 py-1 text-xs font-semibold rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
          <CheckCircle2 size={12} className="mr-1.5" />
          Verified
          {ai_verdict && <span className="ml-1.5 opacity-70">({Math.round(ai_verdict.confidence * 100)}%)</span>}
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="flex items-center w-max px-2.5 py-1 text-xs font-semibold rounded-full border bg-red-500/10 text-red-400 border-red-500/20">
          <XCircle size={12} className="mr-1.5" />
          Rejected
        </span>
      );
    }
    return (
      <span className="flex items-center w-max px-2.5 py-1 text-xs font-semibold rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20">
        <AlertCircle size={12} className="mr-1.5" />
        Pending Review
      </span>
    );
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'medium': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      default: return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
    }
  };

  const getUrgencyColor = (days: number) => {
    if (days > 30) return 'text-red-400';
    if (days > 7) return 'text-amber-400';
    return 'text-orange-400';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4" />
          <p className="text-gray-400 font-medium">Loading Audit Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Automated Audit Reporting</h1>
          <p className="text-gray-400 text-sm">AI validation verdicts and autonomous deadline monitoring.</p>
        </div>
        <div className="flex items-center space-x-3 bg-gray-900 border border-gray-800 px-4 py-2 rounded-lg">
          <BrainCircuit size={18} className="text-blue-400" />
          <span className="text-gray-300 text-sm font-medium">AI Validation Engine Active</span>
        </div>
      </div>

      {/* Overdue Alert Banner */}
      {overdueMaps.length > 0 && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <ShieldAlert size={22} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-red-400 font-bold text-base">
                Autonomous Monitoring: {overdueMaps.length} Overdue MAP{overdueMaps.length > 1 ? 's' : ''} Detected
              </h3>
              <p className="text-red-300/70 text-sm mt-0.5">
                Action points have breached their deadlines and remain unverified. Immediate escalation required.
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('overdue')}
            className="text-xs font-semibold text-red-400 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
          >
            View Overdue →
          </button>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Total Evaluated</span><FileSearch size={16} />
          </div>
          <div className="text-3xl font-bold text-white">{total}</div>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5">
          <div className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Compliant</span><CheckCircle2 size={16} />
          </div>
          <div className="text-3xl font-bold text-emerald-400">{verifiedCount}</div>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
          <div className="text-red-400 text-xs font-bold uppercase tracking-wider mb-2 flex items-center justify-between">
            <span>Rejected</span><XCircle size={16} />
          </div>
          <div className="text-3xl font-bold text-red-400">{rejectedCount}</div>
        </div>
        <div className={`rounded-xl p-5 border ${overdueMaps.length > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-gray-900 border-gray-800'}`}>
          <div className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center justify-between ${overdueMaps.length > 0 ? 'text-red-400' : 'text-gray-400'}`}>
            <span>Overdue MAPs</span><Clock size={16} />
          </div>
          <div className={`text-3xl font-bold ${overdueMaps.length > 0 ? 'text-red-400' : 'text-white'}`}>
            {overdueMaps.length}
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex space-x-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6">
        <button
          onClick={() => setActiveTab('submissions')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'submissions'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <BrainCircuit size={16} />
          <span>AI Validation Results</span>
        </button>
        <button
          onClick={() => setActiveTab('overdue')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'overdue'
              ? 'bg-red-600 text-white shadow-lg shadow-red-500/20'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <Flame size={16} />
          <span>Overdue Monitoring</span>
          {overdueMaps.length > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {overdueMaps.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'submissions' ? (
        <SubmissionsTable submissions={submissions} getStatusBadge={getStatusBadge} onSelect={setSelectedSub} />
      ) : (
        <OverdueTable overdueMaps={overdueMaps} getPriorityColor={getPriorityColor} getUrgencyColor={getUrgencyColor} />
      )}

      {/* AI Report Modal */}
      {selectedSub && selectedSub.ai_verdict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-800 flex items-start justify-between bg-gray-950/50">
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <span className="px-2 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded uppercase tracking-wider border border-blue-500/20 flex items-center">
                    <BrainCircuit size={12} className="mr-1.5" />
                    AI Validation Report
                  </span>
                  {getStatusBadge(selectedSub.status, selectedSub.ai_verdict)}
                </div>
                <h3 className="text-base font-bold text-white leading-snug">{selectedSub.map_action}</h3>
              </div>
              <button onClick={() => setSelectedSub(null)} className="text-gray-500 hover:text-white transition-colors p-1 ml-4">
                <XCircle size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              <div>
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center">
                  <FileText size={14} className="mr-2" /> AI Auditor Reasoning
                </h4>
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 text-sm text-gray-300 leading-relaxed">
                  {selectedSub.ai_verdict.reasoning}
                </div>
              </div>
              {selectedSub.ai_verdict.missing_items.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-3 flex items-center">
                    <AlertCircle size={14} className="mr-2" /> Identified Gaps
                  </h4>
                  <ul className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-2">
                    {selectedSub.ai_verdict.missing_items.map((item, idx) => (
                      <li key={idx} className="flex items-start text-sm text-red-300/90">
                        <span className="text-red-500 mr-2 font-bold">•</span>
                        <span className="leading-relaxed">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                  <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Proof Document</span>
                  <span className="text-sm font-medium text-gray-300">{selectedSub.original_filename}</span>
                </div>
                <div className="bg-gray-950 border border-gray-800 rounded-xl p-4">
                  <span className="block text-xs text-gray-500 uppercase tracking-wider mb-1">Department</span>
                  <span className="text-sm font-medium text-gray-300">{selectedSub.department}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Submissions Table Sub-component ──────────────────────────
function SubmissionsTable({
  submissions,
  getStatusBadge,
  onSelect,
}: {
  submissions: Submission[];
  getStatusBadge: (status: string, verdict?: AIVerdict) => JSX.Element;
  onSelect: (s: Submission) => void;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 bg-gray-950/50">
        <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider">All Submission Records</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800 bg-gray-950/30">
              <th className="px-6 py-3 font-medium">Department</th>
              <th className="px-6 py-3 font-medium">MAP Details</th>
              <th className="px-6 py-3 font-medium">Proof Document</th>
              <th className="px-6 py-3 font-medium">Status</th>
              <th className="px-6 py-3 font-medium text-right">Report</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {submissions.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No submissions yet.</td></tr>
            ) : (
              submissions.map((sub) => (
                <tr key={sub._id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-300">{sub.department}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-mono text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">{sub.map_id}</span>
                      <span className="text-xs text-gray-500 truncate max-w-[180px]" title={sub.circular_title}>{sub.circular_title}</span>
                    </div>
                    <p className="text-sm text-gray-300 line-clamp-1" title={sub.map_action}>{sub.map_action}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-2 text-sm text-gray-400">
                      <FileText size={14} className="text-blue-400" />
                      <span className="truncate max-w-[140px]" title={sub.original_filename}>{sub.original_filename}</span>
                    </div>
                    <div className="flex items-center space-x-1 mt-1 text-[10px] text-gray-500">
                      <Calendar size={10} />
                      <span>{new Date(sub.submitted_at).toLocaleDateString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(sub.status, sub.ai_verdict)}</td>
                  <td className="px-6 py-4 text-right">
                    {sub.ai_verdict && (
                      <button
                        onClick={() => onSelect(sub)}
                        className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-700 transition-colors flex items-center space-x-1 ml-auto"
                      >
                        <span>View Report</span><ChevronRight size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Overdue Table Sub-component ──────────────────────────────
function OverdueTable({
  overdueMaps,
  getPriorityColor,
  getUrgencyColor,
}: {
  overdueMaps: OverdueMAP[];
  getPriorityColor: (p: string) => string;
  getUrgencyColor: (d: number) => string;
}) {
  if (overdueMaps.length === 0) {
    return (
      <div className="text-center py-20 bg-gray-900/50 rounded-2xl border border-gray-800 border-dashed">
        <CheckCircle2 size={48} className="mx-auto text-emerald-600 mb-4" />
        <h3 className="text-xl text-gray-300 font-semibold">All Clear</h3>
        <p className="text-gray-500 mt-2">No overdue action points detected. All MAPs are on track.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-red-500/20 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-red-500/20 bg-red-500/5 flex items-center space-x-3">
        <Flame size={18} className="text-red-400" />
        <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider">
          Overdue Action Points — Autonomous Monitoring Active
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800 bg-gray-950/30">
              <th className="px-6 py-3 font-medium">Overdue By</th>
              <th className="px-6 py-3 font-medium">Department</th>
              <th className="px-6 py-3 font-medium">Action Point</th>
              <th className="px-6 py-3 font-medium">Deadline</th>
              <th className="px-6 py-3 font-medium">Priority</th>
              <th className="px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {overdueMaps.map((map) => (
              <tr key={`${map.circular_id}-${map.map_id}`} className="hover:bg-red-500/5 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className={`flex items-center space-x-2 font-bold text-sm ${getUrgencyColor(map.days_overdue)}`}>
                    <Clock size={14} />
                    <span>{map.days_overdue}d overdue</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center space-x-2 text-sm text-gray-300">
                    <Building2 size={14} className="text-gray-500" />
                    <span>{map.department}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-mono text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">{map.map_id}</span>
                  </div>
                  <p className="text-sm text-gray-200 line-clamp-2" title={map.action_title}>{map.action_title}</p>
                  <p className="text-xs text-gray-500 mt-1 truncate">{map.circular_source} · {map.circular_title}</p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-red-400 font-medium">
                  {map.deadline}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded border ${getPriorityColor(map.priority)}`}>
                    {map.priority}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded border bg-gray-800 text-gray-300 border-gray-700">
                    {map.status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
