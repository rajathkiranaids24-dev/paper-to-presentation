import { Database, Loader2, Search } from 'lucide-react';
import React, { useEffect, useState } from 'react';
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
import { inspectRag } from '../services/api.ts';
import type { PaperWorkspace, RagInspectionResult } from '../types/paperwise.ts';

interface RagInspectorPageProps {
  workspace: PaperWorkspace | null;
  defaultTopK: number;
  onNavigate: (tab: NavTabId) => void;
  onLoadSample: () => void;
  loadingSample: boolean;
}

export const RagInspectorPage: React.FC<RagInspectorPageProps> = ({
  workspace,
  defaultTopK,
  onNavigate,
  onLoadSample,
  loadingSample,
}) => {
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(defaultTopK || 5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RagInspectionResult | null>(null);

  useEffect(() => {
    if (!workspace) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    inspectRag(workspace.metadata.id, '', topK)
      .then((data) => {
        if (!cancelled) setResult(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to inspect RAG.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace?.metadata.id]);

  if (!workspace) {
    return (
      <EmptyPaperState
        onGoToUpload={() => onNavigate('upload')}
        onLoadSample={onLoadSample}
        loadingSample={loadingSample}
      />
    );
  }

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await inspectRag(workspace.metadata.id, query.trim(), topK);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vector search failed.');
    } finally {
      setLoading(false);
    }
  };

  const chartData = (result?.retrievedChunks ?? []).map((c) => ({
    label: `C#${c.chunkIndex} (P.${c.pageNumber})`,
    score: Number(c.score.toFixed(4)),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Vector Store & RAG Inspector
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Inspect document-isolated vector collections, embedding chunks, and real cosine similarity search scores from Gemini Embedding-2.
        </p>
      </div>

      {/* Collection Summary Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Vector Collection</div>
          <div className="mt-1 truncate font-mono text-xs font-semibold text-slate-900">
            {result?.collectionName ?? workspace.metadata.collectionName}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Indexed Chunks</div>
          <div className="mt-1 font-mono text-xl font-bold text-slate-900 tabular-nums">
            {result?.totalChunks ?? workspace.metadata.chunkCount}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Embedding Model</div>
          <div className="mt-1 font-mono text-xs font-semibold text-blue-700">
            {result?.embeddingModel ?? 'gemini-embedding-2'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500">Retrieval Status</div>
          <div className="mt-1 font-mono text-xs font-semibold text-emerald-700">
            {result?.retrievalStatus ?? 'ready'} ({result?.processingTimeMs ?? 0} ms)
          </div>
        </div>
      </div>

      {/* Query Form */}
      <form
        onSubmit={handleSearch}
        className="rounded-xl border border-slate-200 bg-white p-5 space-y-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="rag-query" className="block text-xs font-medium text-slate-700">
              Semantic Similarity Query (embeds query with Gemini Embedding-2 & ranks chunks)
            </label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                id="rag-query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='e.g., "ReAct faithfulness verification threshold and hallucination rate"'
                className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="w-full sm:w-32">
            <label htmlFor="rag-topk" className="block text-xs font-medium text-slate-700">
              Top-K
            </label>
            <select
              id="rag-topk"
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            >
              {[3, 5, 8, 10].map((k) => (
                <option key={k} value={k}>
                  Top {k}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Database className="h-4 w-4" />
                Run Vector Search
              </>
            )}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>

      {/* Similarity Score Chart */}
      {result && result.query && chartData.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Cosine Similarity Scores for "{result.query}"
          </h2>
          <div className="mt-4 h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip />
                <Bar dataKey="score" fill="#7c3aed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Retrieved Chunks List */}
      {result && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-slate-600 px-1">
            {result.query
              ? `Top ${result.retrievedChunks.length} matching chunks for "${result.query}"`
              : `Showing first ${result.retrievedChunks.length} indexed chunks (enter a query above to rank by cosine similarity)`}
          </div>
          {result.retrievedChunks.map((chunk) => (
            <div key={chunk.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2 font-mono text-slate-600">
                  <span className="font-semibold text-slate-900">Chunk #{chunk.chunkIndex}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-blue-700">Page {chunk.pageNumber}</span>
                  <span aria-hidden="true">·</span>
                  <span>{chunk.sectionHint}</span>
                </div>
                <span className="font-mono font-semibold text-violet-700 tabular-nums">
                  Cosine Similarity: {chunk.score.toFixed(4)}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">{chunk.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
