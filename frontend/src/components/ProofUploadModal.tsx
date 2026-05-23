import { useState, useRef, useEffect, type DragEvent } from 'react';
import { X, UploadCloud, FileText, Loader2, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { submitProof } from '../services/api';
import axios from 'axios';

interface ProofUploadModalProps {
  circularId: string;
  mapId: string;
  mapAction: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ALLOWED = ['.pdf', '.txt', '.doc', '.docx'];
const MAX_FILES = 5;
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export default function ProofUploadModal({
  circularId,
  mapId,
  mapAction,
  onClose,
  onSuccess,
}: ProofUploadModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const validateFile = (f: File): string | null => {
    const parts = f.name.split('.');
    if (parts.length < 2) return 'Invalid file type. Allowed: PDF, TXT, DOC, DOCX.';
    const ext = '.' + parts.pop()?.toLowerCase();
    if (!ALLOWED.includes(ext)) return 'Invalid file type. Allowed: PDF, TXT, DOC, DOCX.';
    if (f.size > MAX_SIZE) return 'File too large (max 20MB).';
    return null;
  };

  const addFiles = (incoming: File[]) => {
    setError('');
    const toAdd: File[] = [];
    for (const f of incoming) {
      if (files.length + toAdd.length >= MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files allowed.`);
        break;
      }
      const err = validateFile(f);
      if (err) { setError(err); continue; }
      if (!files.find(ex => ex.name === f.name) && !toAdd.find(t => t.name === f.name)) toAdd.push(f);
    }
    if (toAdd.length) setFiles(prev => [...prev, ...toAdd]);
  };

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const removeFile = (name: string) => setFiles(prev => prev.filter(f => f.name !== name));

  const handleSubmit = async () => {
    if (files.length === 0) {
      setError('Please select at least one proof document.');
      return;
    }
    setError('');
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      files.forEach(f => formData.append('proof_files', f));
      formData.append('circular_id', circularId);
      formData.append('map_id', mapId);
      formData.append('notes', notes);
      await submitProof(formData);
      setIsDone(true);
      timerRef.current = setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Submission failed. Please try again.');
      } else {
        setError('Submission failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">Upload Proof of Compliance</h3>
            <p className="text-gray-400 text-sm mt-1 line-clamp-2">{mapAction}</p>
          </div>
          <button onClick={onClose} aria-label="Close modal" className="text-gray-500 hover:text-white transition-colors ml-4 mt-0.5">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500">Action Point:</span>
            <span className="px-2 py-1 bg-gray-800 text-gray-300 text-xs font-mono rounded border border-gray-700">{mapId}</span>
            <span className="text-xs text-gray-500 ml-auto">Up to {MAX_FILES} files</span>
          </div>

          {/* Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              isDragging ? 'border-blue-500 bg-blue-500/5' : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            {isDone ? (
              <div className="flex flex-col items-center text-emerald-400">
                <CheckCircle2 size={40} className="mb-3" />
                <p className="font-semibold">Submitted Successfully!</p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-gray-500">
                <UploadCloud size={32} className="mb-3" />
                <p className="font-medium text-gray-300">Drop files here or click to browse</p>
                <p className="text-xs mt-1">PDF, TXT, DOC, DOCX · Max 20 MB each</p>
              </div>
            )}
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Selected Files ({files.length})</p>
              {files.map((f, idx) => (
                <div key={`${f.name}-${idx}`} className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                  <div className="flex items-center space-x-2 min-w-0">
                    <FileText size={14} className="text-blue-400 shrink-0" />
                    <span className="text-sm text-white truncate">{f.name}</span>
                    <span className="text-xs text-gray-500 shrink-0">{(f.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <button onClick={() => removeFile(f.name)} className="text-gray-600 hover:text-red-400 transition-colors ml-2 shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {files.length < MAX_FILES && (
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center space-x-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  <Plus size={14} /><span>Add another file</span>
                </button>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            {/* BUG-FE2-030: Add htmlFor and id to link label and textarea */}
            <label htmlFor="proof-notes" className="text-sm font-medium text-gray-300">Notes (optional)</label>
            <textarea
              id="proof-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Updated the policy document as per circular requirements..."
              rows={3}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm resize-none"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">{error}</p>
          )}

          {/* Actions */}
          <div className="flex space-x-3 pt-2">
            <button onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg px-4 py-2.5 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isDone || files.length === 0}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg px-4 py-2.5 flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <><Loader2 size={18} className="animate-spin" /><span>Submitting...</span></>
              ) : (
                <span>Submit {files.length > 1 ? `${files.length} Files` : "Proof"}</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
