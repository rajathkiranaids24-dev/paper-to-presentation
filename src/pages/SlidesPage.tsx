import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Presentation,
  RefreshCw,
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
import type { PaperWorkspace, SlideThemeId } from '../types/paperwise.ts';

interface SlidesPageProps {
  workspace: PaperWorkspace | null;
  defaultSlideCount: number;
  defaultTheme: SlideThemeId;
  onNavigate: (tab: NavTabId) => void;
  onLoadSample: () => void;
  loadingSample: boolean;
  onGenerate: (options: { slideCount: number; theme: SlideThemeId }) => Promise<void>;
  generating: boolean;
}

const THEME_LABELS: Array<{ id: SlideThemeId; label: string }> = [
  { id: 'oxford-navy', label: 'Oxford Navy' },
  { id: 'slate-academic', label: 'Slate Academic' },
  { id: 'violet-research', label: 'Violet Research' },
];

export const SlidesPage: React.FC<SlidesPageProps> = ({
  workspace,
  defaultSlideCount,
  defaultTheme,
  onNavigate,
  onLoadSample,
  loadingSample,
  onGenerate,
  generating,
}) => {
  const [slideCount, setSlideCount] = useState<number>(defaultSlideCount || 10);
  const [theme, setTheme] = useState<SlideThemeId>(defaultTheme || 'oxford-navy');
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);

  if (!workspace) {
    return (
      <EmptyPaperState
        onGoToUpload={() => onNavigate('upload')}
        onLoadSample={onLoadSample}
        loadingSample={loadingSample}
      />
    );
  }

  const deck = workspace.presentation;
  const slides = deck?.slides ?? [];
  const currentSlide = slides[activeSlideIdx] ?? slides[0];

  const isTitleSlide = currentSlide?.slideNumber === 1;
  const activeTheme = deck?.theme ?? theme;
  const titleBgClass =
    activeTheme === 'violet-research'
      ? 'bg-[#17153B] text-white'
      : activeTheme === 'slate-academic'
      ? 'bg-slate-800 text-white'
      : 'bg-[#0F172A] text-white';

  const accentTextClass =
    activeTheme === 'violet-research' ? 'text-violet-700' : 'text-blue-700';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Presentation Generator
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Creates an 8–12 slide academic defense deck with speaker notes, architecture flows, and real downloadable 16:9 PowerPoint (.pptx).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {deck && (
            <a
              href={`/api/papers/${encodeURIComponent(workspace.metadata.id)}/download/pptx`}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Download PowerPoint (.pptx)
            </a>
          )}
          <button
            type="button"
            onClick={async () => {
              await onGenerate({ slideCount, theme });
              setActiveSlideIdx(0);
            }}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Generating {slideCount} Slides...
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                {deck ? 'Regenerate Deck' : 'Generate Presentation'}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Configuration Bar */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-700">Slide Count</span>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {[8, 10, 12].map((count) => (
              <button
                key={count}
                type="button"
                onClick={() => setSlideCount(count)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors tabular-nums ${
                  slideCount === count
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {count} Slides
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-700">Deck Theme</span>
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            {THEME_LABELS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTheme(item.id)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  theme === item.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {!deck || !currentSlide ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <Presentation className="mx-auto h-8 w-8 text-blue-600" />
          <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
            Ready to Compile Presentation for "{workspace.metadata.title}"
          </h2>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-600">
            Select your preferred slide count and theme above, then click Generate Presentation to build an editable 16:9 PowerPoint file with speaker notes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          {/* Slide Thumbnail Strip */}
          <div className="space-y-2 xl:col-span-3 max-h-[600px] overflow-y-auto pr-1">
            {slides.map((s, idx) => (
              <button
                key={s.slideNumber}
                type="button"
                onClick={() => setActiveSlideIdx(idx)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  idx === activeSlideIdx
                    ? 'border-blue-600 bg-blue-50/60'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 tabular-nums">
                  <span>Slide {s.slideNumber}</span>
                  <span>{s.pageReferences}</span>
                </div>
                <div className="mt-1 truncate text-xs font-semibold text-slate-900">{s.title}</div>
                <div className="mt-0.5 truncate text-[11px] text-slate-500">{s.sectionType}</div>
              </button>
            ))}
          </div>

          {/* 16:9 Widescreen Slide Stage + Speaker Notes */}
          <div className="space-y-4 xl:col-span-9">
            <div
              className={`aspect-video w-full rounded-xl border border-slate-200 p-8 sm:p-10 flex flex-col justify-between ${
                isTitleSlide ? titleBgClass : 'bg-white text-slate-900'
              }`}
            >
              <div>
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className={isTitleSlide ? 'text-blue-400' : accentTextClass}>
                    {currentSlide.sectionType} · {currentSlide.pageReferences}
                  </span>
                  <span
                    className={`font-mono tabular-nums ${
                      isTitleSlide ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {currentSlide.slideNumber} / {deck.slideCount}
                  </span>
                </div>

                <h2
                  className={`mt-3 font-display font-bold text-balance ${
                    isTitleSlide ? 'text-2xl sm:text-3xl text-white' : 'text-xl sm:text-2xl text-slate-900'
                  }`}
                >
                  {currentSlide.title}
                </h2>
                {currentSlide.subtitle && (
                  <p
                    className={`mt-1.5 text-sm ${
                      isTitleSlide ? 'text-slate-300' : 'text-slate-600'
                    }`}
                  >
                    {currentSlide.subtitle}
                  </p>
                )}
              </div>

              <div className="my-4 grid grid-cols-1 gap-6 lg:grid-cols-12 items-center">
                <ul
                  className={`space-y-2.5 text-sm leading-relaxed ${
                    currentSlide.chartData && currentSlide.chartData.length >= 2
                      ? 'lg:col-span-7'
                      : 'lg:col-span-12'
                  } ${isTitleSlide ? 'text-slate-200' : 'text-slate-700'}`}
                >
                  {currentSlide.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span
                        className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${
                          isTitleSlide ? 'bg-blue-400' : 'bg-blue-600'
                        }`}
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                {currentSlide.chartData && currentSlide.chartData.length >= 2 && (
                  <div className="lg:col-span-5 h-44 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={currentSlide.chartData}
                        margin={{ top: 6, right: 8, left: -16, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#475569' }} />
                        <YAxis tick={{ fontSize: 10, fill: '#475569' }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {currentSlide.diagramNodes && currentSlide.diagramNodes.length >= 2 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {currentSlide.diagramNodes.slice(0, 5).map((node, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg border px-2.5 py-2 text-center text-[11px] font-medium ${
                        isTitleSlide
                          ? 'border-slate-700 bg-slate-800/70 text-slate-100'
                          : 'border-slate-200 bg-slate-50 text-slate-800'
                      }`}
                    >
                      {idx + 1}. {node}
                    </div>
                  ))}
                </div>
              )}

              <div
                className={`flex items-center justify-between border-t pt-3 text-[11px] ${
                  isTitleSlide
                    ? 'border-slate-800 text-slate-400'
                    : 'border-slate-100 text-slate-500'
                }`}
              >
                <span className="truncate max-w-md">{deck.paperTitle}</span>
                <span>Visual hint: {currentSlide.visualSuggestion}</span>
              </div>
            </div>

            {/* Slide Controls & Speaker Notes */}
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Presenter Speaker Notes (Slide {currentSlide.slideNumber})
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={activeSlideIdx === 0}
                    onClick={() => setActiveSlideIdx((i) => Math.max(0, i - 1))}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Prev
                  </button>
                  <button
                    type="button"
                    disabled={activeSlideIdx >= slides.length - 1}
                    onClick={() => setActiveSlideIdx((i) => Math.min(slides.length - 1, i + 1))}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-700">
                {currentSlide.speakerNotes}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
