import { useState, useEffect, useRef } from 'react';
import { getSubmissions, getOverdueMAPs, getCirculars, getConflicts, queryMaps, resolveConflict, assignMAP, overrideSubmission } from '../services/api';
import {
  CheckCircle2, XCircle, AlertCircle, FileText, ChevronRight,
  BrainCircuit, Calendar, FileSearch, Clock, Flame, Building2, ShieldAlert, X
} from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../context/authContext';

interface AIVerdict {
  is_compliant: boolean;
  confidence: number;
  reasoning: string;
  missing_items: string[];
  verdict: 'verified' | 'rejected';
  evaluated_at: string;
}

interface MAPWithCircular {
  _id?: string;
  circular_id: string;
  circular_title: string;
  circular_source: string;
  map_id: string;
  action_title: string;
  department: string;
  deadline: string;
  priority: string;
  status: string;
  assigned_to: string;
  audit_trail?: { action: string; by: string; comment: string; timestamp: string }[];
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

interface Conflict {
  circular_id_a: string;
  map_id_a: string;
  circular_id_b: string;
  map_id_b: string;
  conflict_type: string;
  explanation: string;
  severity: string;
  resolved: boolean;
  resolved_by_co?: string;
}

interface CircularWithConflicts {
  _id: string;
  source: string;
  conflicts: Conflict[];
}

interface NLResult {
  map_id: string;
  action_title: string;
  department: string;
  deadline: string;
  priority: string;
  status: string;
  circular_title: string;
  circular_source: string;
  score?: number;
}

export default function AuditDashboard() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [overdueMaps, setOverdueMaps] = useState<OverdueMAP[]>([]);
  const [escalatedMaps, setEscalatedMaps] = useState<MAPWithCircular[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('submissions');
  
  const [overrideComment, setOverrideComment] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignDepts, setAssignDepts] = useState<Record<string, string>>({});

  const [conflicts, setConflicts] = useState<CircularWithConflicts[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [nlResults, setNlResults] = useState<NLResult[] | null>(null);

  // BUG-FE2-011/017/018: In-component error states to replace blocking alert() calls
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const queryAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    fetchAll(abortController.signal);
    return () => {
      abortController.abort();
    };
  }, []);

  const fetchAll = async (signal?: AbortSignal) => {
    try {
      setError(null);
      const [subs, overdue, circulars, confs] = await Promise.all([
        getSubmissions(undefined, { signal }), 
        getOverdueMAPs({ signal }), 
        getCirculars({ signal }),
        getConflicts({ signal })
      ]);
      
      if (signal?.aborted) return;

      setSubmissions(subs);
      setOverdueMaps(overdue);
      setConflicts(confs);

      const escalated: MAPWithCircular[] = [];
      (circulars as any[]).forEach(circ => {
        circ.maps.filter((m: any) => m.status === 'escalated').forEach((m: any) => {
          escalated.push({ ...m, circular_id: circ._id, circular_title: circ.title, circular_source: circ.source });
        });
      });
      setEscalatedMaps(escalated);
    } catch (err) {
      // BUG-FE2-008: Handle both AbortController (CanceledError) and legacy cancel token patterns
      if (axios.isCancel(err) || (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError'))) {
        return;
      }
      console.error("Failed to fetch audit data:", err);
      setError("Failed to fetch audit data from server.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  };

  const fetchAllSafe = async () => {
    if (fetchAbortControllerRef.current) {
      fetchAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    fetchAbortControllerRef.current = controller;
    await fetchAll(controller.signal);
  };

  const total = submissions.length;
  const verifiedCount = submissions.filter(s => s.status === 'verified').length;
  const rejectedCount = submissions.filter(s => s.status === 'rejected').length;

  const handleOverride = async (verdict: 'verified' | 'rejected') => {
    if (!selectedSub || !overrideComment.trim()) return;
    setOverriding(true);
    setOverrideError(null);
    try {
      await overrideSubmission(selectedSub._id, verdict, overrideComment);
      setOverrideComment("");
      setSelectedSub(null);
      fetchAllSafe();
    } catch (err) {
      console.error('Failed to override:', err);
      // BUG-FE2-011: Replace blocking alert() with in-component error state
      setOverrideError('Failed to override submission. Please try again.');
    } finally {
      setOverriding(false);
    }
  };

  const handleAssign = async (map: MAPWithCircular) => {
    const dept = assignDepts[map.map_id];
    if (!dept?.trim()) return;
    setAssigningId(map.map_id);
    try {
      await assignMAP(map.circular_id, map.map_id, dept);
      setAssignDepts(prev => {
        const next = { ...prev };
        delete next[map.map_id];
        return next;
      });
      fetchAllSafe();
      setAssignError(null);
      fetchAllSafe();
    } catch (err) {
      console.error('Failed to assign:', err);
      setAssignError('Failed to assign department.');
    } finally {
      setAssigningId(null);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    if (queryAbortControllerRef.current) {
      queryAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    queryAbortControllerRef.current = controller;

    try {
      const res = await queryMaps(searchQuery, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setNlResults(res.results);
        setSearchError(null);
      }
    } catch (err) {
      if (axios.isCancel(err) || (err instanceof Error && (err.name === 'CanceledError' || err.name === 'AbortError'))) return;
      console.error("Search failed:", err);
      // BUG-FE2-017: Replace blocking alert() with in-component error state
      if (!controller.signal.aborted) setSearchError('Search failed. Please try again.');
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  };

  const handleResolveConflict = async (circularId: string, conflictIndex: number) => {
    setConflictError(null);
    try {
      await resolveConflict(circularId, conflictIndex, user?.username || "Compliance Officer");
      fetchAllSafe();
    } catch (err) {
      console.error("Failed to resolve conflict:", err);
      // BUG-FE2-018: Replace blocking alert() with in-component error state
      setConflictError('Failed to resolve conflict. Please try again.');
    }
  };

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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 max-w-lg mx-auto text-center space-y-4">
        <div className="p-3 bg-red-500/10 rounded-full border border-red-500/20 text-red-400">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-white">Failed to Load Audit Data</h2>
        <p className="text-gray-400 text-sm">{error}</p>
        <button
          onClick={() => {
            setLoading(true);
            // BUG-FE2-007: Use fetchAllSafe to properly manage AbortController and avoid unmounted state updates
            fetchAllSafe();
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors shadow-lg"
        >
          Try Again
        </button>
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

      {/* NL Query Search Bar */}
      <div className="mb-6">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            aria-label="Search compliance data"
            placeholder="Ask anything — 'what must we complete before July?'"
            className="w-full bg-gray-900 border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:border-blue-500 transition-colors"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <FileSearch className="absolute left-3 top-3.5 text-gray-400" size={18} />
          {searching && <div className="absolute right-3 top-3.5 w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />}
          {nlResults && !searching && (
            <button type="button" onClick={() => { setNlResults(null); setSearchQuery(""); }} className="absolute right-3 top-3.5 text-gray-400 hover:text-white">
              <XCircle size={18} />
            </button>
          )}
        </form>
      </div>

      {/* BUG-FE2-017: Inline search error instead of blocking alert() */}
      {searchError && (
        <div className="mb-4 flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          <span className="text-sm text-red-400">{searchError}</span>
          <button type="button" onClick={() => setSearchError(null)} className="ml-3 text-red-400 hover:text-red-300">✕</button>
        </div>
      )}

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

      {/* Escalated Action Required Banner */}
      {user?.role === 'CO' && escalatedMaps.length > 0 && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-amber-500/20 rounded-lg">
              <AlertCircle size={22} className="text-amber-400" />
            </div>
            <div>
              <h3 className="text-amber-400 font-bold text-base">
                Action Required: {escalatedMaps.length} Disputed MAP{escalatedMaps.length > 1 ? 's' : ''}
              </h3>
              <p className="text-amber-300/70 text-sm mt-0.5">
                Departments have repeatedly rejected these assignments. Please manually assign the correct department.
              </p>
            </div>
          </div>
          <div className="space-y-4 mt-4">
            {assignError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center text-red-400 text-sm">
                <AlertCircle size={16} className="mr-2" />
                {assignError}
              </div>
            )}
            {escalatedMaps.map(map => (
              // BUG-FE2-024: Use compound key since map_id is only unique within a circular
              <div key={`${map.circular_id}-${map.map_id}`} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-mono text-xs text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded border border-gray-700">{map.map_id}</span>
                    <span className="text-xs text-gray-400">{map.circular_source} · {map.circular_title}</span>
                  </div>
                  <p className="text-sm font-semibold text-gray-200 mb-2">{map.action_title}</p>
                  {map.audit_trail && map.audit_trail.length > 0 && (
                    <div className="text-xs text-amber-400/80 bg-amber-500/5 p-2 rounded border border-amber-500/10">
                      <span className="font-bold">Last Rejection:</span> {map.audit_trail[map.audit_trail.length - 1].comment}
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <input 
                    type="text" 
                    aria-label="Department Name to assign"
                    placeholder="Dept Name (e.g., IT Dept)"
                    className="bg-gray-950 border border-gray-700 rounded p-2 text-sm text-white w-48"
                    value={assignDepts[map.map_id] || ""}
                    onChange={(e) => {
                      setAssignDepts(prev => ({ ...prev, [map.map_id]: e.target.value }));
                    }}
                  />
                  <button 
                    onClick={() => handleAssign(map)}
                    disabled={assigningId === map.map_id || !assignDepts[map.map_id]?.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded transition-colors"
                  >
                    {assigningId === map.map_id ? "Assigning..." : "Force Assign"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conflicts Banner */}
      {conflicts.length > 0 && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-xl p-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <Flame size={22} className="text-red-400" />
            </div>
            <div>
              <h3 className="text-red-400 font-bold text-base">
                Action Required: {conflicts.length} Circulars with Conflicts
              </h3>
              <p className="text-red-300/70 text-sm mt-0.5">
                Contradictory requirements, deadline conflicts, or jurisdiction overlaps detected.
              </p>
            </div>
          </div>
          {conflictError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between text-red-400 text-sm">
              <div className="flex items-center">
                <AlertCircle size={16} className="mr-2" />
                {conflictError}
              </div>
              <button type="button" onClick={() => setConflictError(null)} className="text-red-400 hover:text-red-200"><X size={16} /></button>
            </div>
          )}
          <div className="space-y-4 mt-4">
            {conflicts.flatMap(circ => 
              circ.conflicts
                .map((c: any, idx: number) => ({ c, idx }))
                .filter(({ c }: any) => !c.resolved)
                .map(({ c, idx }: any) => (
                <div key={`${circ._id}-${c.map_id_a}-${c.map_id_b}`} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex flex-col sm:flex-row items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="font-mono text-xs text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">{c.conflict_type.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-gray-400">Severity: {c.severity}</span>
                    </div>
                    <p className="text-sm font-medium text-gray-200 mb-2">{c.explanation}</p>
                    <div className="text-xs text-gray-400 bg-gray-800 p-2 rounded border border-gray-700">
                      <span className="font-bold">MAP A:</span> {circ.source} ({c.map_id_a}) vs <span className="font-bold">MAP B:</span> {c.circular_id_b} ({c.map_id_b})
                    </div>
                  </div>
                  <button 
                    onClick={() => handleResolveConflict(circ._id, idx)}
                    className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 text-sm font-bold px-4 py-2 rounded transition-colors whitespace-nowrap"
                  >
                    Resolve Conflict
                  </button>
                </div>
              ))
            )}
          </div>
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
      {nlResults ? (
        <QueryResultsTable results={nlResults} getStatusBadge={getStatusBadge} />
      ) : activeTab === 'submissions' ? (
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
              <button onClick={() => setSelectedSub(null)} aria-label="Close AI report" className="text-gray-500 hover:text-white transition-colors p-1 ml-4">
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
                    {selectedSub.ai_verdict.missing_items.map((item) => (
                      <li key={item} className="flex items-start text-sm text-red-300/90">
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

              {/* CO Override Section */}
              {user?.role === 'CO' && (
                <div className="border-t border-gray-800 pt-5 mt-5">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Compliance Officer Override</h4>
                  <div className="flex flex-col space-y-3">
                    <input 
                      type="text" 
                      aria-label="Reason for overriding the AI verdict"
                      placeholder="Reason for overriding the AI verdict..."
                      className="bg-gray-950 border border-gray-700 rounded-lg p-3 text-sm text-white focus:border-blue-500 outline-none w-full"
                      value={overrideComment}
                      onChange={(e) => setOverrideComment(e.target.value)}
                    />
                    <div className="flex space-x-3">
                      <button 
                        onClick={() => handleOverride('verified')}
                        disabled={overriding || !overrideComment.trim() || selectedSub.status === 'verified'}
                        className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        Force Verify
                      </button>
                      <button 
                        onClick={() => handleOverride('rejected')}
                        disabled={overriding || !overrideComment.trim() || selectedSub.status === 'rejected'}
                        className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 font-bold px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
                      >
                        Force Reject
                      </button>
                    </div>
                    {/* BUG-FE2-011: Inline override error */}
                    {overrideError && (
                      <div className="flex items-center justify-between bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        <span className="text-xs text-red-400">{overrideError}</span>
                        <button type="button" onClick={() => setOverrideError(null)} className="ml-2 text-red-400 hover:text-red-300 text-xs">✕</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
  getStatusBadge: (status: string, verdict?: AIVerdict) => React.ReactNode;
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
                      <span>{sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : 'Unknown'}</span>
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
                    {/* BUG-FE2-025: Use regex global flag to replace ALL underscores */}
                    {map.status.replace(/_/g, ' ')}
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

function QueryResultsTable({ results, getStatusBadge }: any) {
  return (
    <div className="bg-gray-900 border border-blue-500/20 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-blue-500/20 bg-blue-500/5 flex items-center space-x-3">
        <FileSearch size={18} className="text-blue-400" />
        <h2 className="text-sm font-bold text-blue-400 uppercase tracking-wider">
          Search Results ({results.length})
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-gray-500 border-b border-gray-800 bg-gray-950/30">
              <th className="px-6 py-3 font-medium">Relevance</th>
              <th className="px-6 py-3 font-medium">Action Point</th>
              <th className="px-6 py-3 font-medium">Department</th>
              <th className="px-6 py-3 font-medium">Deadline</th>
              <th className="px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/50">
            {results.map((r: any) => (
              <tr key={r.map_id} className="hover:bg-blue-500/5 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-400 font-bold">
                  {Math.round(r.relevance_score * 100)}%
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-gray-200">{r.action_title}</p>
                  <p className="text-xs text-gray-500 mt-1 italic">{r.relevance_reason}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-300">
                  {r.department}
                </td>
                <td className="px-6 py-4 text-sm text-gray-400">
                  {r.deadline}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(r.live_status || 'pending')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
