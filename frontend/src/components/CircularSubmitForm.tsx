import { useState, useRef, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ingestCircular, ingestCircularPDF } from '../services/api';
import { FileText, Send, Loader2, UploadCloud, FileStack, CheckCircle2, X } from 'lucide-react';

type Tab = 'text' | 'pdf';

export default function CircularSubmitForm() {
  const [activeTab, setActiveTab] = useState<Tab>('text');
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl mx-auto p-8 h-full overflow-y-auto">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Ingest Circular</h1>
        <p className="text-gray-400 text-sm">Submit a regulatory circular for AI-powered MAP extraction.</p>
      </div>

      {/* Tab Switcher */}
      <div className="flex space-x-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6">
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'text'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <FileText size={16} />
          <span>Paste Text</span>
        </button>
        <button
          onClick={() => setActiveTab('pdf')}
          className={`flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
            activeTab === 'pdf'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <FileStack size={16} />
          <span>Upload PDF</span>
        </button>
      </div>

      {activeTab === 'text' ? (
        <TextIngestForm onSuccess={() => navigate('/inbox')} />
      ) : (
        <PDFIngestForm onSuccess={() => navigate('/inbox')} />
      )}
    </div>
  );
}

// ── Text Ingest Form ─────────────────────────────────────────
function TextIngestForm({ onSuccess }: { onSuccess: () => void }) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [rawText, setRawText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await ingestCircular({ title, source, raw_text: rawText });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit circular.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl overflow-hidden">
      <div className="p-5 border-b border-gray-800 bg-gray-950/50 flex items-center space-x-3">
        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
          <FileText size={20} />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Paste Circular Text</h2>
          <p className="text-gray-500 text-xs">The AI agent will extract MAPs from raw text.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">{error}</div>
        )}
        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Guidelines on Digital Lending"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Source / Reference</label>
            <input
              type="text"
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. RBI/2026-27/01"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">Raw Circular Text</label>
          <textarea
            required
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste the full text of the circular here..."
            rows={12}
            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono text-sm resize-none"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-4 py-3 flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <><Loader2 size={20} className="animate-spin" /><span>Extracting MAPs...</span></>
          ) : (
            <><Send size={18} /><span>Submit to AI Agent</span></>
          )}
        </button>
      </form>
    </div>
  );
}

// ── PDF Ingest Form ──────────────────────────────────────────
function PDFIngestForm({ onSuccess }: { onSuccess: () => void }) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (f: File) => {
    if (!f.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted.');
      return false;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError('File must be under 20 MB.');
      return false;
    }
    return true;
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && validateFile(dropped)) { setFile(dropped); setError(''); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && validateFile(selected)) { setFile(selected); setError(''); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Please select a PDF file.'); return; }
    if (!title || !source) { setError('Please fill in all fields.'); return; }
    setError('');
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('pdf_file', file);
      formData.append('title', title);
      formData.append('source', source);
      await ingestCircularPDF(formData);
      setIsDone(true);
      setTimeout(() => onSuccess(), 1200);
    } catch (err: any) {
      setError(err.response?.data?.error || 'PDF ingestion failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-xl overflow-hidden">
      <div className="p-5 border-b border-gray-800 bg-gray-950/50 flex items-center space-x-3">
        <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
          <UploadCloud size={20} />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Upload PDF Circular</h2>
          <p className="text-gray-500 text-xs">Text is extracted automatically. AI will parse MAPs.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-5">
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError('')}><X size={16} /></button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Guidelines on Digital Lending"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Source / Reference</label>
            <input
              type="text"
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="e.g. RBI/2026-27/01"
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
            />
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
            isDone
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : isDragging
              ? 'border-blue-500 bg-blue-500/5 scale-[1.01]'
              : file
              ? 'border-indigo-500/50 bg-indigo-500/5'
              : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileSelect}
          />
          {isDone ? (
            <div className="flex flex-col items-center text-emerald-400">
              <CheckCircle2 size={44} className="mb-3" />
              <p className="font-semibold text-lg">Processing Complete!</p>
              <p className="text-sm text-emerald-400/70 mt-1">Redirecting to inbox...</p>
            </div>
          ) : isSubmitting ? (
            <div className="flex flex-col items-center text-blue-400">
              <Loader2 size={44} className="mb-3 animate-spin" />
              <p className="font-semibold">Extracting & Parsing MAPs...</p>
              <p className="text-sm text-blue-400/70 mt-1">The AI agent is analyzing your document</p>
            </div>
          ) : file ? (
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center mb-3">
                <FileText size={28} className="text-indigo-400" />
              </div>
              <p className="font-semibold text-white">{file.name}</p>
              <p className="text-gray-500 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB · Click to change</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-gray-500">
              <UploadCloud size={44} className="mb-3 text-gray-600" />
              <p className="font-medium text-gray-300 text-lg">Drop PDF here or click to browse</p>
              <p className="text-xs mt-2 text-gray-600">PDF only · Max 20 MB</p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isDone}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg px-4 py-3 flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
        >
          {isSubmitting ? (
            <><Loader2 size={20} className="animate-spin" /><span>Analyzing PDF...</span></>
          ) : (
            <><Send size={18} /><span>Extract MAPs from PDF</span></>
          )}
        </button>
      </form>
    </div>
  );
}
