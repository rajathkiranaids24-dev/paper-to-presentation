import { Activity, CheckCircle2, Loader2, Play, XCircle } from 'lucide-react';
import React, { useState } from 'react';
import { EmptyPaperState } from '../components/EmptyPaperState.tsx';
import type { NavTabId } from '../components/Sidebar.tsx';
import type { AgentIntent, PaperWorkspace } from '../types/paperwise.ts';

interface AgentMonitorPageProps {
  workspace: PaperWorkspace | null;
  onNavigate: (tab: NavTabId) => void;
  onLoadSample: () => void;
  loadingSample: boolean;
  onRouteTask: (prompt: string) => Promise<void>;
  routingTask: boolean;
}

const INTENT_OPTIONS: Array<'ALL' | AgentIntent> = [
  'ALL',
  'SUMMARIZE_PAPER',
  'EXTRACT_CONCEPTS',
  'GENERATE_SLIDES',
  'GENERATE_VIVA',
  'ASK_PAPER_QUESTION',
  'EVALUATE_VIVA_ANSWER',
];

export const AgentMonitorPage: React.FC<AgentMonitorPageProps> = ({
  workspace,
  onNavigate,
  onLoadSample,
  loadingSample,
  onRouteTask,
  routingTask,
}) => {
  const [intentFilter, setIntentFilter] = useState<'ALL' | AgentIntent>('ALL');
  const [testPrompt, setTestPrompt] = useState('');

  if (!workspace) {
    return (
      <EmptyPaperState
        onGoToUpload={() => onNavigate('upload')}
        onLoadSample={onLoadSample}
        loadingSample={loadingSample}
      />
    );
  }

  const logs = workspace.activityLogs ?? [];
  const filtered = logs.filter(
    (l) => intentFilter === 'ALL' || l.detectedIntent === intentFilter
  );

  const handleTestRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testPrompt.trim() || routingTask) return;
    const p = testPrompt.trim();
    setTestPrompt('');
    await onRouteTask(p);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Agent Activity Monitor & Intent Router
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Real-time execution telemetry showing Few-Shot Intent Detection, routed agent selection, LCEL chains, selected tools, and measured latency.
        </p>
      </div>

      {/* Live Intent Router Test Bar */}
      <form
        onSubmit={handleTestRoute}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-3"
      >
        <div className="text-xs font-semibold text-slate-900">
          Test Intent Detection & Automatic Agent Routing
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            placeholder='Enter any natural-language task (e.g., "Extract all algorithms and glossary terms")...'
            className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            disabled={routingTask || !testPrompt.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            {routingTask ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Classifying & Executing...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Route & Execute
              </>
            )}
          </button>
        </div>
      </form>

      {/* Intent Filter */}
      <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/70 p-1">
        {INTENT_OPTIONS.map((intent) => (
          <button
            key={intent}
            type="button"
            onClick={() => setIntentFilter(intent)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-mono font-medium transition-colors whitespace-nowrap ${
              intentFilter === intent
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {intent}
          </button>
        ))}
      </div>

      {/* Execution Traces */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <Activity className="mx-auto h-7 w-7 text-slate-400" />
          <p className="mt-2 text-sm text-slate-600">No execution logs match this intent filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((log) => (
            <div key={log.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-col gap-2 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-display text-sm font-semibold text-slate-900">
                    {log.selectedAgent}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-semibold text-violet-700">
                    {log.detectedIntent}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-slate-500 tabular-nums">
                    Conf {(log.intentConfidence * 100).toFixed(0)}%
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <span
                    className={`inline-flex items-center gap-1 font-medium ${
                      log.status === 'completed' ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {log.status === 'completed' ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    {log.status === 'completed' ? 'Completed' : 'Failed'}
                  </span>
                  <span className="font-mono text-slate-700 tabular-nums">
                    {log.processingTimeMs} ms
                  </span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 text-xs md:grid-cols-2">
                <div>
                  <div className="font-semibold text-slate-700">Input</div>
                  <p className="mt-0.5 text-slate-600">{log.inputSummary}</p>
                </div>
                <div>
                  <div className="font-semibold text-slate-700">Output</div>
                  <p className="mt-0.5 text-slate-600">{log.outputSummary}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <span>
                  <strong className="text-slate-700">Tools:</strong> {log.selectedTools.join(', ')}
                </span>
                <span>
                  <strong className="text-slate-700">LCEL:</strong>{' '}
                  <code className="font-mono text-slate-700">{log.lcelPipeline}</code>
                </span>
                <span>
                  <strong className="text-slate-700">RAG:</strong>{' '}
                  {log.ragUsed ? `Yes (${log.retrievedChunksCount} chunks)` : 'No'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
