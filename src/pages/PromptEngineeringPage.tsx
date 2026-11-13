import { Code2, Loader2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { fetchPrompts } from '../services/api.ts';
import type { PromptEngineeringSpec } from '../types/paperwise.ts';

export const PromptEngineeringPage: React.FC = () => {
  const [prompts, setPrompts] = useState<PromptEngineeringSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');

  useEffect(() => {
    fetchPrompts()
      .then((res) => {
        setPrompts(res.prompts);
        if (res.prompts.length > 0) setSelectedId(res.prompts[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const active = prompts.find((p) => p.id === selectedId) ?? prompts[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Prompt Engineering & LCEL Architecture
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Live inspection of the exact System Prompts, User PromptTemplates, Few-Shot examples, ReAct reflection guards, and LCEL chains executed by the agents.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          Loading prompt registry from server...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-2 lg:col-span-4">
            {prompts.map((spec) => {
              const isSelected = active?.id === spec.id;
              return (
                <button
                  key={spec.id}
                  type="button"
                  onClick={() => setSelectedId(spec.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Code2 className="h-4 w-4 text-blue-600 shrink-0" />
                    <span className="font-display text-sm font-semibold text-slate-900">
                      {spec.agentName}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600">{spec.technique}</div>
                </button>
              );
            })}
          </div>

          {active && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5 lg:col-span-8">
              <div className="border-b border-slate-100 pb-4">
                <div className="text-xs font-medium text-violet-700">{active.technique}</div>
                <h2 className="mt-1 font-display text-xl font-bold text-slate-900">
                  {active.agentName}
                </h2>
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-900 px-3.5 py-2 font-mono text-xs text-blue-300">
                  {active.lcelExpression}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-900">System Prompt</div>
                <pre className="mt-1.5 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3.5 font-mono text-xs leading-relaxed text-slate-700">
                  {active.systemPrompt}
                </pre>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900">User PromptTemplate</span>
                  <span className="font-mono text-[11px] text-slate-500">
                    Variables: {active.inputVariables.map((v) => `{${v}}`).join(', ')}
                  </span>
                </div>
                <pre className="mt-1.5 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3.5 font-mono text-xs leading-relaxed text-slate-700">
                  {active.userPromptTemplate}
                </pre>
              </div>

              {active.fewShotExamples && active.fewShotExamples.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-900">
                    Few-Shot Classification Examples ({active.fewShotExamples.length})
                  </div>
                  <div className="mt-2 space-y-2">
                    {active.fewShotExamples.map((ex, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-700"
                      >
                        <div>
                          <span className="font-semibold text-slate-900">Input:</span> {ex.input}
                        </div>
                        <div className="mt-1 text-blue-800">
                          <span className="font-semibold text-slate-900">Output:</span> {ex.output}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {active.reflectionRule && (
                <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3.5">
                  <div className="text-xs font-semibold text-violet-900">
                    ReAct Reflection & Anti-Hallucination Rule
                  </div>
                  <p className="mt-1 text-xs text-violet-800">{active.reflectionRule}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
