import { XCircle, PlusCircle, MinusCircle, Edit3 } from 'lucide-react';


interface DeltaReport {
  added_maps?: string[];
  obligations_added?: string[];
  removed_maps?: string[];
  obligations_removed?: string[];
  modified_maps?: { map_id: string; changes: string }[];
  clause_modifications?: { map_id: string; summary: string }[];
  deadline_changes?: { map_id: string; old_deadline: string; new_deadline: string }[];
}

export default function DeltaReportModal({
  report,
  source,
  onClose
}: {
  report: DeltaReport;
  source: string;
  onClose: () => void;
}) {
  if (!report) return null;
  const added = report.added_maps || report.obligations_added || [];
  const removed = report.removed_maps || report.obligations_removed || [];
  const modified = report.modified_maps 
    ? report.modified_maps.map((m: any) => ({ map_id: m.map_id, changes: m.changes })) 
    : [
        ...(report.clause_modifications || []).map((m: any) => ({ map_id: m.map_id, changes: m.summary })),
        ...(report.deadline_changes || []).map((m: any) => ({ map_id: m.map_id, changes: `Deadline changed from ${m.old_deadline} to ${m.new_deadline}` }))
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-indigo-500/30 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-800 flex items-start justify-between bg-indigo-500/5">
          <div>
            <h3 className="text-xl font-bold text-white mb-1">Amendment Delta Report</h3>
            <p className="text-sm text-indigo-400">Shows changes introduced by amending circular {source}</p>
          </div>
          <button onClick={onClose} aria-label="Close delta report" className="text-gray-500 hover:text-white transition-colors p-1">
            <XCircle size={24} />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {added.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-3 flex items-center">
                <PlusCircle size={16} className="mr-2" /> Added MAPs
              </h4>
              <ul className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-2">
                {added.map((id: string) => (
                  <li key={id} className="text-sm text-emerald-300 font-mono">{id}</li>
                ))}
              </ul>
            </div>
          )}

          {removed.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-red-400 uppercase tracking-wider mb-3 flex items-center">
                <MinusCircle size={16} className="mr-2" /> Removed MAPs
              </h4>
              <ul className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 space-y-2">
                {removed.map((id: string) => (
                  <li key={id} className="text-sm text-red-300 font-mono line-through">{id}</li>
                ))}
              </ul>
            </div>
          )}

          {modified.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-3 flex items-center">
                <Edit3 size={16} className="mr-2" /> Modified MAPs
              </h4>
              <div className="space-y-3">
                {modified.map((mod: any) => (
                  <div key={mod.map_id} className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                    <span className="font-mono text-sm text-blue-300 font-bold mb-2 block">{mod.map_id}</span>
                    <p className="text-sm text-gray-300">{mod.changes}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(added.length === 0 && removed.length === 0 && modified.length === 0) && (
            <div className="text-center text-gray-500 py-8">
              No significant MAP changes detected in this amendment.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
