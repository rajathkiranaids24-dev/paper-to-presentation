import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  GraduationCap,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import React, { useState } from 'react';
import { EmptyPaperState } from '../components/EmptyPaperState.tsx';
import type { NavTabId } from '../components/Sidebar.tsx';
import type { PaperWorkspace, VivaCategory, VivaDifficulty } from '../types/paperwise.ts';

interface VivaPrepPageProps {
  workspace: PaperWorkspace | null;
  onNavigate: (tab: NavTabId) => void;
  onLoadSample: () => void;
  loadingSample: boolean;
  onGenerate: () => Promise<void>;
  generating: boolean;
}

const CATEGORIES: Array<'All' | VivaCategory> = [
  'All',
  'Basic',
  'Conceptual',
  'Technical',
  'Methodology',
  'Results-based',
  'Challenging Examiner',
];

const DIFFICULTIES: Array<'All' | VivaDifficulty> = ['All', 'Easy', 'Medium', 'Hard'];

export const VivaPrepPage: React.FC<VivaPrepPageProps> = ({
  workspace,
  onNavigate,
  onLoadSample,
  loadingSample,
  onGenerate,
  generating,
}) => {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | VivaCategory>('All');
  const [difficultyFilter, setDifficultyFilter] = useState<'All' | VivaDifficulty>('All');
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [revealAll, setRevealAll] = useState(false);

  if (!workspace) {
    return (
      <EmptyPaperState
        onGoToUpload={() => onNavigate('upload')}
        onLoadSample={onLoadSample}
        loadingSample={loadingSample}
      />
    );
  }

  const viva = workspace.viva;
  const questions = viva?.questions ?? [];

  const filtered = questions.filter((q) => {
    const matchesCat = categoryFilter === 'All' || q.category === categoryFilter;
    const matchesDiff = difficultyFilter === 'All' || q.difficulty === difficultyFilter;
    const qLower = search.toLowerCase();
    const matchesSearch =
      !qLower ||
      q.question.toLowerCase().includes(qLower) ||
      q.modelAnswer.toLowerCase().includes(qLower);
    return matchesCat && matchesDiff && matchesSearch;
  });

  const toggleAllAnswers = () => {
    const next = !revealAll;
    setRevealAll(next);
    const map: Record<string, boolean> = {};
    for (const q of questions) {
      map[q.id] = next;
    }
    setRevealedIds(map);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Viva Voce Preparation Bank
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Examiner questions across 6 academic categories with accurate model answers, beginner-friendly explanations, and source page citations.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {viva && (
            <>
              <button
                type="button"
                onClick={toggleAllAnswers}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                {revealAll ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {revealAll ? 'Hide All Answers' : 'Reveal All Answers'}
              </button>
              <a
                href={`/api/papers/${encodeURIComponent(workspace.metadata.id)}/download/viva-docx`}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                Download .docx
              </a>
            </>
          )}
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating 20+ Questions...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                {viva ? 'Regenerate Question Bank' : 'Generate 20+ Viva Questions'}
              </>
            )}
          </button>
        </div>
      </div>

      {!viva ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <GraduationCap className="mx-auto h-8 w-8 text-blue-600" />
          <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
            Generate Viva Examiner Bank for "{workspace.metadata.title}"
          </h2>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-600">
            Click Generate 20+ Viva Questions to create categorized Easy, Medium, and Hard defense questions grounded directly in the manuscript.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filters */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search viva questions or keywords..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-600">Difficulty:</span>
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {DIFFICULTIES.map((diff) => (
                    <button
                      key={diff}
                      type="button"
                      onClick={() => setDifficultyFilter(diff)}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        difficultyFilter === diff
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                    categoryFilter === cat
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <span className="tabular-nums">
              Showing {filtered.length} of {viva.totalCount} examiner questions
            </span>
            <button
              type="button"
              onClick={() => onNavigate('practice')}
              className="font-semibold text-blue-600 hover:text-blue-700"
            >
              Switch to Interactive Viva Practice Mode →
            </button>
          </div>

          {/* Question List */}
          <div className="space-y-3">
            {filtered.map((q, idx) => {
              const isOpen = Boolean(revealedIds[q.id]);
              return (
                <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-semibold text-slate-700 tabular-nums">
                          Q{idx + 1}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-blue-700">{q.category}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-medium ${
                            q.difficulty === 'Hard'
                              ? 'text-red-700'
                              : q.difficulty === 'Medium'
                              ? 'text-amber-700'
                              : 'text-emerald-700'
                          }`}
                        >
                          {q.difficulty}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{q.pageReference}</span>
                      </div>
                      <h3 className="font-display text-base font-semibold text-slate-900">
                        {q.question}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setRevealedIds((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                      }
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      {isOpen ? (
                        <>
                          Hide Answer
                          <ChevronUp className="h-3.5 w-3.5" />
                        </>
                      ) : (
                        <>
                          Show Answer
                          <ChevronDown className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">Model Answer</div>
                        <p className="mt-1 text-sm leading-relaxed text-slate-700">
                          {q.modelAnswer}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                        <div className="text-xs font-semibold text-blue-800">
                          Beginner-Friendly Explanation
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-700">
                          {q.beginnerExplanation}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
