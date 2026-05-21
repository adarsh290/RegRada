import { useState, useRef, useCallback, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ingestCircular, ingestCircularPDF } from '../services/api';
import {
  UploadCloud, FileText, Zap, CheckCircle2, AlertCircle,
  ChevronRight, Loader2, X, Download, Building2, Clock, ShieldCheck, Sparkles
} from 'lucide-react';

// ── Pipeline Stage Model ─────────────────────────────────────
type StageStatus = 'idle' | 'running' | 'done' | 'error';

interface PipelineStage {
  id: string;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  color: string;
  status: StageStatus;
}

const makeStages = (): PipelineStage[] => [
  { id: 'ingest',    label: 'Document Received',   sublabel: 'PDF decoded & queued',          icon: UploadCloud,   color: 'blue',    status: 'idle' },
  { id: 'extract',   label: 'Text Extraction',      sublabel: 'pdfplumber parsing content',    icon: FileText,      color: 'violet',  status: 'idle' },
  { id: 'llm',       label: 'LLM Analysis',         sublabel: 'LangGraph agent reasoning',     icon: Zap,           color: 'amber',   status: 'idle' },
  { id: 'structure', label: 'MAP Structuring',      sublabel: 'Routing to departments',        icon: Building2,     color: 'emerald', status: 'idle' },
  { id: 'deadline',  label: 'Deadline Assignment',  sublabel: 'Monitoring schedule set',       icon: Clock,         color: 'pink',    status: 'idle' },
  { id: 'complete',  label: 'Pipeline Complete',    sublabel: 'All MAPs saved to database',    icon: ShieldCheck,   color: 'emerald', status: 'idle' },
];

const COLOR_MAP: Record<string, string> = {
  blue:    'bg-blue-500/10   border-blue-500/30   text-blue-400',
  violet:  'bg-violet-500/10 border-violet-500/30 text-violet-400',
  amber:   'bg-amber-500/10  border-amber-500/30  text-amber-400',
  emerald: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  pink:    'bg-pink-500/10   border-pink-500/30   text-pink-400',
};

const GLOW_MAP: Record<string, string> = {
  blue:    'shadow-blue-500/40',
  violet:  'shadow-violet-500/40',
  amber:   'shadow-amber-500/40',
  emerald: 'shadow-emerald-500/40',
  pink:    'shadow-pink-500/40',
};

// ── Result MAP card ──────────────────────────────────────────
interface MAPResult {
  action_title: string;
  department: string;
  deadline: string;
  priority: 'high' | 'medium' | 'low';
}

const PRIORITY_STYLE: Record<string, string> = {
  high:   'bg-red-500/10 text-red-400 border-red-500/30',
  medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  low:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
};

// ── Main Component ───────────────────────────────────────────
export default function CircularSubmitForm() {
  const navigate = useNavigate();

  // Input state
  const [activeTab, setActiveTab] = useState<'pdf' | 'text'>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rawText, setRawText] = useState('');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pipeline state
  const [phases, setPhases] = useState<'input' | 'running' | 'done'>('input');
  const [stages, setStages] = useState<PipelineStage[]>(makeStages());
  const [error, setError] = useState('');
  const [results, setResults] = useState<{ summary: string; maps: MAPResult[] } | null>(null);

  // ── File handling ────────────────────────────────────────
  const validateFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) { setError('Only PDF files are accepted.'); return false; }
    if (f.size > 20 * 1024 * 1024) { setError('File must be under 20 MB.'); return false; }
    return true;
  };

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && validateFile(dropped)) { setFile(dropped); setError(''); }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && validateFile(selected)) { setFile(selected); setError(''); }
  };

  // ── Animated pipeline runner ─────────────────────────────
  const runStageAnimation = async () => {
    const delays = [200, 600, 3000, 500, 400, 400]; // approx time per stage
    const stageIds = ['ingest', 'extract', 'llm', 'structure', 'deadline', 'complete'];

    for (let i = 0; i < stageIds.length; i++) {
      const id = stageIds[i];
      const prevId = i > 0 ? stageIds[i - 1] : null;

      setStages(s => s.map(st => {
        if (st.id === id) return { ...st, status: 'running' };
        if (prevId && st.id === prevId) return { ...st, status: 'done' }; // mark prev done
        return st;
      }));
      await new Promise(r => setTimeout(r, delays[i]));
    }
    // Mark the last stage done
    setStages(s => s.map(st => ({ ...st, status: 'done' })));
  };

  // ── Submit ───────────────────────────────────────────────
  const handleSubmit = async () => {
    if (activeTab === 'pdf' && !file) { setError('Please drop a PDF file first.'); return; }
    if (activeTab === 'text' && rawText.trim().length < 20) { setError('Please paste at least a few lines of circular text.'); return; }
    if (!title) { setError('Please provide a title.'); return; }

    setError('');
    setPhases('running');
    setStages(makeStages());

    // Fire the animation and the actual API call concurrently
    let apiResult: any;
    try {
      const animPromise = runStageAnimation();

      if (activeTab === 'pdf') {
        const formData = new FormData();
        formData.append('pdf_file', file!);
        formData.append('title', title);
        formData.append('source', source || 'Manual Upload');
        apiResult = await ingestCircularPDF(formData);
      } else {
        apiResult = await ingestCircular({ title, source: source || 'Manual Input', raw_text: rawText });
      }

      await animPromise; // ensure animation always completes visually

      // Backend returns { message, circular } — extract nested fields
      const circularData = apiResult.circular || apiResult;
      setResults({ summary: circularData.summary || '', maps: circularData.maps || [] });
      setPhases('done');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Processing failed.');
      setStages(s => s.map(st => st.status === 'running' ? { ...st, status: 'error' } : st));
      setPhases('input');
    }
  };

  const handleReset = () => {
    setPhases('input');
    setFile(null);
    setRawText('');
    setTitle('');
    setSource('');
    setError('');
    setResults(null);
    setStages(makeStages());
  };

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto bg-gray-950">
      {phases === 'input' && (
        <InputView
          activeTab={activeTab} setActiveTab={setActiveTab}
          file={file} setFile={setFile} isDragging={isDragging} setIsDragging={setIsDragging}
          rawText={rawText} setRawText={setRawText}
          title={title} setTitle={setTitle}
          source={source} setSource={setSource}
          fileInputRef={fileInputRef} handleDrop={handleDrop} handleFileSelect={handleFileSelect}
          error={error} setError={setError}
          onSubmit={handleSubmit}
        />
      )}

      {phases === 'running' && (
        <RunningView stages={stages} fileName={file?.name || title} />
      )}

      {phases === 'done' && results && (
        <DoneView results={results} onReset={handleReset} onView={() => navigate('/inbox')} />
      )}
    </div>
  );
}

// ── INPUT VIEW ───────────────────────────────────────────────
function InputView({
  activeTab, setActiveTab, file, setFile, isDragging, setIsDragging,
  rawText, setRawText, title, setTitle, source, setSource,
  fileInputRef, handleDrop, handleFileSelect, error, setError, onSubmit
}: any) {
  return (
    <div className="max-w-3xl mx-auto px-8 py-10 space-y-6">
      {/* Hero Header */}
      <div className="space-y-1">
        <div className="flex items-center space-x-2 text-blue-400 text-sm font-medium mb-3">
          <Sparkles size={14} />
          <span>Live Demo Pipeline</span>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Drop Any Circular</h1>
        <p className="text-gray-400">Upload a real RBI or SEBI PDF and watch the AI extract all compliance action points in real-time.</p>
      </div>

      {/* Tab Row */}
      <div className="flex space-x-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('pdf')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'pdf' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
        >
          <UploadCloud size={15} /><span>Upload PDF</span>
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'text' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
        >
          <FileText size={15} /><span>Paste Text</span>
        </button>
      </div>

      {/* Meta Fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-300">Title</label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Guidelines on Digital Lending"
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-gray-300">Source Ref <span className="text-gray-600">(optional)</span></label>
          <input type="text" value={source} onChange={e => setSource(e.target.value)} placeholder="e.g. RBI/2026-27/01"
            className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm" />
        </div>
      </div>

      {/* Drop Zone */}
      {activeTab === 'pdf' ? (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 group ${isDragging
            ? 'border-blue-400 bg-blue-500/5 scale-[1.01]'
            : file
            ? 'border-indigo-500/50 bg-indigo-500/5'
            : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/30'}`}
        >
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileSelect} />
          {file ? (
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-center mb-4">
                <FileText size={32} className="text-indigo-400" />
              </div>
              <p className="font-semibold text-white text-lg">{file.name}</p>
              <p className="text-gray-500 text-sm mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB · Click to change</p>
              <button type="button" onClick={e => { e.stopPropagation(); setFile(null); }}
                className="mt-3 text-xs text-gray-500 hover:text-red-400 flex items-center space-x-1 transition-colors">
                <X size={12} /><span>Remove</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <div className="w-20 h-20 border-2 border-dashed border-gray-700 group-hover:border-blue-500/50 rounded-2xl flex items-center justify-center mb-5 transition-colors">
                <UploadCloud size={36} className="text-gray-600 group-hover:text-blue-400 transition-colors" />
              </div>
              <p className="font-semibold text-white text-xl mb-2">Drop your RBI circular here</p>
              <p className="text-gray-500 text-sm">or click to browse · PDF only · Max 20 MB</p>
              <div className="mt-4 flex items-center space-x-2 text-xs text-gray-600">
                <span className="px-2 py-1 bg-gray-900 border border-gray-700 rounded-md">RBI</span>
                <span className="px-2 py-1 bg-gray-900 border border-gray-700 rounded-md">SEBI</span>
                <span className="px-2 py-1 bg-gray-900 border border-gray-700 rounded-md">FEMA</span>
                <span className="px-2 py-1 bg-gray-900 border border-gray-700 rounded-md">Master Directions</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <textarea
          value={rawText} onChange={e => setRawText(e.target.value)}
          placeholder="Paste the full text of the circular here..."
          rows={12}
          className="w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono text-sm resize-none"
        />
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2"><AlertCircle size={16} /><span>{error}</span></div>
          <button onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}

      {/* Run Button */}
      <button
        onClick={onSubmit}
        className="w-full relative group overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl px-4 py-4 flex items-center justify-center space-x-3 transition-all shadow-xl shadow-blue-500/20 hover:shadow-blue-500/40 text-base"
      >
        <Zap size={20} />
        <span>Run AI Pipeline</span>
        <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
      </button>
    </div>
  );
}

// ── RUNNING VIEW ─────────────────────────────────────────────
function RunningView({ stages, fileName }: { stages: PipelineStage[]; fileName: string }) {
  const activeIdx = stages.findIndex(s => s.status === 'running');
  const doneCount = stages.filter(s => s.status === 'done').length;
  const progress = Math.round((doneCount / stages.length) * 100);

  return (
    <div className="h-full flex flex-col items-center justify-center px-8 py-16 space-y-10">
      {/* Pulsing orb */}
      <div className="relative flex items-center justify-center">
        <div className="absolute w-40 h-40 rounded-full bg-blue-500/10 animate-ping" />
        <div className="absolute w-28 h-28 rounded-full bg-indigo-500/10 animate-pulse" />
        <div className="relative w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center shadow-2xl shadow-blue-500/40">
          <Zap size={36} className="text-white animate-pulse" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Pipeline Running</h2>
        <p className="text-gray-400 text-sm max-w-xs">{fileName ? `Processing "${fileName}"` : 'Processing your document...'}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-lg">
        <div className="flex justify-between text-xs text-gray-500 mb-2">
          <span>Progress</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stage Grid */}
      <div className="w-full max-w-2xl space-y-3">
        {stages.map((stage, i) => {
          const Icon = stage.icon;
          const isActive = stage.status === 'running';
          const isDone = stage.status === 'done';
          const isError = stage.status === 'error';
          const colorClasses = COLOR_MAP[stage.color] || COLOR_MAP.blue;
          const glowClass = isActive ? `shadow-lg ${GLOW_MAP[stage.color] || ''}` : '';

          return (
            <div
              key={stage.id}
              className={`flex items-center space-x-4 p-4 rounded-xl border transition-all duration-300 ${
                isDone ? 'border-emerald-500/30 bg-emerald-500/5 opacity-70' :
                isActive ? `border border-white/10 bg-gray-900 ${glowClass}` :
                isError ? 'border-red-500/30 bg-red-500/5' :
                'border-gray-800 bg-gray-900/30 opacity-40'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${isDone ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : isActive ? colorClasses : 'bg-gray-800 border-gray-700 text-gray-600'}`}>
                {isDone ? <CheckCircle2 size={20} /> : isActive ? <Loader2 size={20} className="animate-spin" /> : <Icon size={20} />}
              </div>
              <div className="flex-1">
                <p className={`text-sm font-semibold ${isDone ? 'text-emerald-300' : isActive ? 'text-white' : 'text-gray-600'}`}>{stage.label}</p>
                <p className={`text-xs mt-0.5 ${isDone ? 'text-emerald-400/70' : isActive ? 'text-gray-400' : 'text-gray-700'}`}>{stage.sublabel}</p>
              </div>
              {isDone && <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />}
              {isActive && <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── DONE VIEW ────────────────────────────────────────────────
function DoneView({ results, onReset, onView }: { results: { summary: string; maps: MAPResult[] }; onReset: () => void; onView: () => void; }) {
  const high = results.maps.filter(m => m.priority === 'high').length;
  const depts = [...new Set(results.maps.map(m => m.department))];

  return (
    <div className="max-w-4xl mx-auto px-8 py-10 space-y-8">
      {/* Success Header */}
      <div className="flex items-center space-x-4 p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
        <div className="w-14 h-14 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
          <CheckCircle2 size={28} className="text-emerald-400" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">Extraction Complete!</h1>
          <p className="text-emerald-400/80 text-sm mt-0.5">
            {results.maps.length} action point{results.maps.length !== 1 ? 's' : ''} extracted · {depts.length} department{depts.length !== 1 ? 's' : ''} assigned · {high} high priority item{high !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex space-x-3">
          <button onClick={onReset} className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg transition-colors flex items-center space-x-2">
            <X size={14} /><span>New</span>
          </button>
          <button onClick={onView} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center space-x-2 font-medium">
            <Download size={14} /><span>View in Inbox</span>
          </button>
        </div>
      </div>

      {/* Summary */}
      {results.summary && (
        <div className="p-5 bg-gray-900 border border-gray-800 rounded-2xl space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">AI Summary</p>
          <p className="text-gray-300 text-sm leading-relaxed">{results.summary}</p>
        </div>
      )}

      {/* MAPs Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold uppercase tracking-widest text-gray-500">Extracted Action Points</p>
          <span className="text-xs text-gray-600">{results.maps.length} total</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {results.maps.map((map, i) => (
            <div key={i} className="p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-gray-700 transition-colors space-y-3">
              <div className="flex items-start justify-between space-x-2">
                <p className="text-sm font-semibold text-white leading-snug">{map.action_title}</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${PRIORITY_STYLE[map.priority] || PRIORITY_STYLE.medium}`}>
                  {map.priority}
                </span>
              </div>
              <div className="flex items-center space-x-3 text-xs text-gray-500">
                <div className="flex items-center space-x-1">
                  <Building2 size={12} />
                  <span>{map.department}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <Clock size={12} />
                  <span>{map.deadline || 'Not specified'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
