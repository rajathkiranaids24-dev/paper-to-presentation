import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock,
  FileText,
  GraduationCap,
  Loader2,
  Presentation,
  Send,
} from 'lucide-react';
import React, { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { EmptyPaperState } from '../components/EmptyPaperState.tsx';
import type { NavTabId } from '../components/Sidebar.tsx';
import type { PaperWorkspace } from '../types/paperwise.ts';

interface DashboardPageProps {
  workspace: PaperWorkspace | null;
  onNavigate: (tab: NavTabId) => void;
  onLoadSample: () => void;
  loadingSample: boolean;
  onRouteTask: (prompt: string) => Promise<void>;
  routingTask: boolean;
  onRunAgent: (agent: 'summary' | 'concepts' | 'slides' | 'viva') => Promise<void>;
  runningAgent: string | null;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  workspace,
  onNavigate,
  onLoadSample,
  loadingSample,
  onRouteTask,
  routingTask,
  onRunAgent,
  runningAgent,
}) => {
  const [commandInput, setCommandInput] = useState('');

  if (!workspace) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 text-balance">
            Academic Research Command Center
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Upload a research paper PDF to run automated summarization, concept extraction, PowerPoint slide generation, viva preparation, and grounded RAG chat.
          </p>
        </div>
        <EmptyPaperState
          onGoToUpload={() => onNavigate('upload')}
          onLoadSample={onLoadSample}
          loadingSample={loadingSample}
        />
      </div>
    );
  }

  const { metadata, summary, concepts, presentation, viva, activityLogs, pages } = workspace;

  const pageChartData = pages.map((p) => ({
    page: `P.${p.pageNumber}`,
    words: p.wordCount,
  }));

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || routingTask) return;
    const text = commandInput.trim();
    setCommandInput('');
    await onRouteTask(text);
  };

  const agentCards: Array<{
    id: 'summary' | 'concepts' | 'slides' | 'viva';
    title: string;
    tab: NavTabId;
    done: boolean;
    metric: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'summary',
      title: 'Summarizer Agent',
      tab: 'summary',
      done: Boolean(summary),
      metric: summary ? `${summary.keyTakeaways.length} takeaways` : 'Not generated yet',
      icon: FileText,
    },
    {
      id: 'concepts',
      title: 'Concept-Extractor Agent',
      tab: 'concepts',
      done: Boolean(concepts),
      metric: concepts
        ? `${concepts.importantConcepts.length} concepts · ${concepts.technicalGlossary.length} glossary`
        : 'Not extracted yet',
      icon: BrainCircuit,
    },
    {
      id: 'slides',
      title: 'Slide-Generator Agent',
      tab: 'slides',
      done: Boolean(presentation),
      metric: presentation ? `${presentation.slideCount} slides (.pptx ready)` : 'Not generated yet',
      icon: Presentation,
    },
    {
      id: 'viva',
      title: 'Viva Agent',
      tab: 'viva',
      done: Boolean(viva),
      metric: viva ? `${viva.totalCount} examiner questions` : 'Not generated yet',
      icon: GraduationCap,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Paper Overview Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-blue-700">
              Active Research Manuscript · {metadata.filename}
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 text-balance">
              {metadata.title}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span>{metadata.authors}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{metadata.pageCount} pages</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{metadata.chunkCount} vector chunks</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{metadata.wordCount.toLocaleString()} words</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-700 font-medium">Status: Ready</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => onNavigate('upload')}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Switch / Upload PDF
            </button>
            <button
              type="button"
              onClick={() => onNavigate('chat')}
              className="rounded-lg bg-[#0F172A] px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Open RAG Chat
            </button>
          </div>
        </div>

        {/* Intent Detection Command Bar */}
        <form onSubmit={handleCommandSubmit} className="mt-5 border-t border-slate-100 pt-5">
          <label
            htmlFor="intent-command-input"
            className="block text-xs font-medium text-slate-700"
          >
            Intent Router Dispatch — Ask or request any task in plain language
          </label>
          <div className="mt-2 flex flex-col gap-2.5 sm:flex-row">
            <input
              id="intent-command-input"
              type="text"
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              placeholder='Try: "Summarize the paper", "Build a 10-slide deck", "Generate 20 viva questions", or "What hallucination rate is reported?"'
              className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
            <button
              type="submit"
              disabled={routingTask || !commandInput.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              {routingTask ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Routing Intent...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Detect Intent & Run
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 4 Specialized Agents Status Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {agentCards.map((card) => {
          const Icon = card.icon;
          const isRunning = runningAgent === card.id;
          return (
            <div
              key={card.id}
              className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-800">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      card.done ? 'text-emerald-700' : 'text-slate-500'
                    }`}
                  >
                    {card.done ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Completed
                      </>
                    ) : (
                      <>
                        <Clock className="h-3.5 w-3.5" />
                        Pending
                      </>
                    )}
                  </span>
                </div>
                <h2 className="mt-3 font-display text-base font-semibold text-slate-900">
                  {card.title}
                </h2>
                <p className="mt-1 text-xs text-slate-600 tabular-nums">{card.metric}</p>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => onRunAgent(card.id)}
                  disabled={Boolean(runningAgent)}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {isRunning ? 'Executing...' : card.done ? 'Regenerate' : 'Run Agent'}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate(card.tab)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
                >
                  Open
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Page Density Chart + Recent Agent Activities */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Extracted Word Distribution per Page
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Computed directly from PDF page text extraction ({metadata.pageCount} pages)
          </p>
          <div className="mt-4 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pageChartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="page" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="words" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 lg:col-span-7">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900">
                Recent Agent Executions
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Real-time intent classification, RAG usage, and execution latency
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('monitor')}
              className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
            >
              View Full Monitor
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-3 font-medium">Agent</th>
                  <th className="py-2 px-3 font-medium">Detected Intent</th>
                  <th className="py-2 px-3 font-medium">Outcome</th>
                  <th className="py-2 pl-3 text-right font-medium">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activityLogs.slice(0, 6).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 pr-3 font-medium text-slate-900 whitespace-nowrap">
                      {log.selectedAgent}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-violet-700 whitespace-nowrap">
                      {log.detectedIntent}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">
                      {log.outputSummary}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {log.processingTimeMs} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
