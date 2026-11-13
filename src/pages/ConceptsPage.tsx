import { BrainCircuit, Loader2, RefreshCw, Search } from 'lucide-react';
import React, { useState } from 'react';
import { EmptyPaperState } from '../components/EmptyPaperState.tsx';
import type { NavTabId } from '../components/Sidebar.tsx';
import type { PaperWorkspace } from '../types/paperwise.ts';

interface ConceptsPageProps {
  workspace: PaperWorkspace | null;
  onNavigate: (tab: NavTabId) => void;
  onLoadSample: () => void;
  loadingSample: boolean;
  onGenerate: () => Promise<void>;
  generating: boolean;
}

export const ConceptsPage: React.FC<ConceptsPageProps> = ({
  workspace,
  onNavigate,
  onLoadSample,
  loadingSample,
  onGenerate,
  generating,
}) => {
  const [glossarySearch, setGlossarySearch] = useState('');

  if (!workspace) {
    return (
      <EmptyPaperState
        onGoToUpload={() => onNavigate('upload')}
        onLoadSample={onLoadSample}
        loadingSample={loadingSample}
      />
    );
  }

  const concepts = workspace.concepts;
  const filteredGlossary = (concepts?.technicalGlossary ?? []).filter(
    (g) =>
      g.term.toLowerCase().includes(glossarySearch.toLowerCase()) ||
      g.meaning.toLowerCase().includes(glossarySearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Concept & Terminology Extractor
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Extracts core concepts, formal definitions, algorithms, research contributions, limitations, and a technical glossary grounded in the uploaded paper.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Extracting Concepts...
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              {concepts ? 'Re-Extract Concepts' : 'Extract Concepts & Glossary'}
            </>
          )}
        </button>
      </div>

      {!concepts ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <BrainCircuit className="mx-auto h-8 w-8 text-violet-600" />
          <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
            Extract Knowledge Graph from "{workspace.metadata.title}"
          </h2>
          <p className="mx-auto mt-1.5 max-w-lg text-sm text-slate-600">
            Run the Concept-Extractor Agent to identify key technical terms, algorithmic workflows, explicit contributions, empirical findings, and limitations.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Important Concepts */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Important Concepts & Definitions ({concepts.importantConcepts.length})
            </h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {concepts.importantConcepts.map((c, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-slate-900">{c.name}</h3>
                    <span className="font-mono text-[11px] text-blue-700 shrink-0">
                      {c.pageReference}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-700">{c.definition}</p>
                  <p className="mt-2 border-t border-slate-200/70 pt-2 text-xs leading-relaxed text-slate-600">
                    <span className="font-semibold text-slate-800">In simple terms: </span>
                    {c.simpleExplanation}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Algorithms & Methodologies */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Algorithms & Methodologies ({concepts.algorithmsAndMethods.length})
            </h2>
            <div className="mt-4 divide-y divide-slate-200">
              {concepts.algorithmsAndMethods.map((alg, idx) => (
                <div key={idx} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold text-slate-900">
                      {alg.name}
                    </h3>
                    <span className="font-mono text-[11px] text-blue-700">{alg.pageReference}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-700">
                    <span className="font-semibold text-slate-900">Purpose: </span>
                    {alg.purpose}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">
                    <span className="font-semibold text-slate-800">Workflow: </span>
                    {alg.workflow}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Contributions & Findings */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Research Contributions
              </h2>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
                {concepts.researchContributions.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="mt-1 font-mono text-xs font-semibold text-violet-700 tabular-nums">
                      0{idx + 1}.
                    </span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Important Findings
              </h2>
              <ul className="mt-3 space-y-2.5 text-sm text-slate-700">
                {concepts.importantFindings.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600" />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Limitations & Future Scope */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Stated Limitations
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {concepts.limitations.map((item, idx) => (
                  <li key={idx} className="leading-relaxed">
                    • {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Future Scope
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {concepts.futureScope.map((item, idx) => (
                  <li key={idx} className="leading-relaxed">
                    • {item}
                  </li>
                ))}
              </ul>
            </section>
          </div>

          {/* Technical Glossary */}
          <section className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Technical Glossary ({filteredGlossary.length})
              </h2>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={glossarySearch}
                  onChange={(e) => setGlossarySearch(e.target.value)}
                  placeholder="Filter glossary terms..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-medium w-48">Term</th>
                    <th className="py-2 pl-2 font-medium">Definition</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGlossary.map((entry, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5 pr-4 font-semibold text-slate-900 align-top">
                        {entry.term}
                      </td>
                      <td className="py-2.5 pl-2 text-slate-700 leading-relaxed">
                        {entry.meaning}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
