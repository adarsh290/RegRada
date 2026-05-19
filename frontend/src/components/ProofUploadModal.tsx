import { useState, useRef, type DragEvent } from 'react';
import { X, UploadCloud, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { submitProof } from '../services/api';

interface ProofUploadModalProps {
  circularId: string;
  mapId: string;
  mapAction: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProofUploadModal({
  circularId,
  mapId,
  mapAction,
  onClose,
  onSuccess,
}: ProofUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED = ['.pdf', '.txt', '.doc', '.docx'];

  const validateFile = (f: File) => {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED.includes(ext)) {
      setError('Only PDF, TXT, DOC, and DOCX files are allowed.');
      return false;
    }
    if (f.size > 20 * 1024 * 1024) {
      setError('File must be under 20 MB.');
      return false;
    }
    return true;
  };

  const handleFileDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && validateFile(dropped)) {
      setFile(dropped);
      setError('');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && validateFile(selected)) {
      setFile(selected);
      setError('');
    }
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Please select a proof document.');
      return;
    }
    setError('');
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('proof_file', file);
      formData.append('circular_id', circularId);
      formData.append('map_id', mapId);
      formData.append('notes', notes);
      await submitProof(formData);
      setIsDone(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Submission failed. Please try again.');
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
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors ml-4 mt-0.5">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* MAP ID badge */}
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500">Action Point:</span>
            <span className="px-2 py-1 bg-gray-800 text-gray-300 text-xs font-mono rounded border border-gray-700">{mapId}</span>
          </div>

          {/* Drop Zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleFileDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-500/5'
                : file
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-gray-700 hover:border-gray-500 hover:bg-gray-800/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              className="hidden"
              onChange={handleFileSelect}
            />
            {isDone ? (
              <div className="flex flex-col items-center text-emerald-400">
                <CheckCircle2 size={40} className="mb-3" />
                <p className="font-semibold">Submitted Successfully!</p>
              </div>
            ) : file ? (
              <div className="flex flex-col items-center">
                <FileText size={36} className="text-emerald-400 mb-3" />
                <p className="font-semibold text-white">{file.name}</p>
                <p className="text-gray-500 text-xs mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change</p>
              </div>
            ) : (
              <div className="flex flex-col items-center text-gray-500">
                <UploadCloud size={36} className="mb-3" />
                <p className="font-medium text-gray-300">Drop file here or click to browse</p>
                <p className="text-xs mt-1">PDF, TXT, DOC, DOCX · Max 20 MB</p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Updated the policy document as per circular requirements..."
              rows={3}
              className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex space-x-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-lg px-4 py-2.5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isDone}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg px-4 py-2.5 flex items-center justify-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Submit Proof</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
