import { CheckCircle2, Loader2, Save, Server } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { fetchHealth } from '../services/api.ts';
import type { SlideThemeId, WorkspaceSettings } from '../types/paperwise.ts';

interface SettingsPageProps {
  settings: WorkspaceSettings;
  onSaveSettings: (next: Partial<WorkspaceSettings>) => Promise<void>;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ settings, onSaveSettings }) => {
  const [chunkSize, setChunkSize] = useState(settings.chunkSize);
  const [chunkOverlap, setChunkOverlap] = useState(settings.chunkOverlap);
  const [topK, setTopK] = useState(settings.topK);
  const [defaultSlideCount, setDefaultSlideCount] = useState(settings.defaultSlideCount);
  const [defaultSlideTheme, setDefaultSlideTheme] = useState<SlideThemeId>(
    settings.defaultSlideTheme
  );
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [health, setHealth] = useState<{
    runtime: string;
    chatModel: string;
    embeddingModel: string;
    geminiConfigured: boolean;
    pythonBackendIncluded: boolean;
  } | null>(null);

  useEffect(() => {
    fetchHealth()
      .then((h) => setHealth(h))
      .catch(() => setHealth(null));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedToast(false);
    try {
      await onSaveSettings({
        chunkSize,
        chunkOverlap,
        topK,
        defaultSlideCount,
        defaultSlideTheme,
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Pipeline & Workspace Settings
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Configure chunking parameters, vector retrieval Top-K, presentation defaults, and inspect active server-side runtime status.
        </p>
      </div>

      {/* Runtime Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-blue-600" />
          <h2 className="font-display text-base font-semibold text-slate-900">
            Active Backend Architecture & Model Diagnostics
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-xs">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-slate-500">Active Preview Server Runtime</div>
            <div className="mt-1 font-mono font-semibold text-slate-900">
              {health?.runtime ?? 'Express + TypeScript LCEL'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-slate-500">Gemini Server Configuration</div>
            <div className="mt-1 font-mono font-semibold text-slate-900">
              {health?.geminiConfigured
                ? 'Configured via Server Environment (GEMINI_API_KEY)'
                : 'Managed via Settings > Secrets'}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-slate-500">Primary Reasoning & Embedding Models</div>
            <div className="mt-1 font-mono font-semibold text-blue-700">
              {health?.chatModel ?? settings.activeModel} ·{' '}
              {health?.embeddingModel ?? settings.embeddingModel}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="text-slate-500">Python FastAPI + ChromaDB + PyMuPDF Codebase</div>
            <div className="mt-1 font-mono font-semibold text-slate-900">
              {health?.pythonBackendIncluded
                ? 'Included in /backend (ready for local Python 3.11+ deployment)'
                : 'Check /backend directory'}
            </div>
          </div>
        </div>
      </div>

      {/* RAG & Slide Config Form */}
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-slate-200 bg-white p-6 space-y-5"
      >
        <h2 className="font-display text-base font-semibold text-slate-900">
          RAG Chunking & Presentation Defaults
        </h2>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="set-chunk-size" className="block text-xs font-medium text-slate-700">
              Chunk Size (characters)
            </label>
            <input
              id="set-chunk-size"
              type="number"
              min={300}
              max={2400}
              step={50}
              value={chunkSize}
              onChange={(e) => setChunkSize(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="set-chunk-overlap" className="block text-xs font-medium text-slate-700">
              Chunk Overlap (characters)
            </label>
            <input
              id="set-chunk-overlap"
              type="number"
              min={0}
              max={500}
              step={25}
              value={chunkOverlap}
              onChange={(e) => setChunkOverlap(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="set-topk" className="block text-xs font-medium text-slate-700">
              Vector Retrieval Top-K Chunks
            </label>
            <input
              id="set-topk"
              type="number"
              min={1}
              max={15}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="set-slide-count" className="block text-xs font-medium text-slate-700">
              Default Slide Count
            </label>
            <select
              id="set-slide-count"
              value={defaultSlideCount}
              onChange={(e) => setDefaultSlideCount(Number(e.target.value))}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            >
              <option value={8}>8 Slides</option>
              <option value={10}>10 Slides</option>
              <option value={12}>12 Slides</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="set-slide-theme" className="block text-xs font-medium text-slate-700">
              Default PowerPoint Theme
            </label>
            <select
              id="set-slide-theme"
              value={defaultSlideTheme}
              onChange={(e) => setDefaultSlideTheme(e.target.value as SlideThemeId)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
            >
              <option value="oxford-navy">Oxford Navy</option>
              <option value="slate-academic">Slate Academic</option>
              <option value="violet-research">Violet Research</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-4">
          <div className="text-xs text-emerald-700 flex items-center gap-1.5">
            {savedToast && (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Settings saved to backend workspace store.
              </>
            )}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Preferences
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
