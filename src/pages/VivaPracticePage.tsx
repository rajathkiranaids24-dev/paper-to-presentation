import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mic,
  Send,
  XCircle,
} from 'lucide-react';
import React, { useState } from 'react';
import { EmptyPaperState } from '../components/EmptyPaperState.tsx';
import type { NavTabId } from '../components/Sidebar.tsx';
import type { PaperWorkspace } from '../types/paperwise.ts';

interface VivaPracticePageProps {
  workspace: PaperWorkspace | null;
  onNavigate: (tab: NavTabId) => void;
  onLoadSample: () => void;
  loadingSample: boolean;
  onGenerateViva: () => Promise<void>;
  generatingViva: boolean;
  onEvaluateAnswer: (payload: { questionId: string; userAnswer: string }) => Promise<void>;
  evaluating: boolean;
}

export const VivaPracticePage: React.FC<VivaPracticePageProps> = ({
  workspace,
  onNavigate,
  onLoadSample,
  loadingSample,
  onGenerateViva,
  generatingViva,
  onEvaluateAnswer,
  evaluating,
}) => {
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answerDraft, setAnswerDraft] = useState('');

  if (!workspace) {
    return (
      <EmptyPaperState
        onGoToUpload={() => onNavigate('upload')}
        onLoadSample={onLoadSample}
        loadingSample={loadingSample}
      />
    );
  }

  const questions = workspace.viva?.questions ?? [];
  const currentQ = questions[questionIdx] ?? questions[0];

  if (!workspace.viva || !currentQ) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Interactive Viva Practice Simulator
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Practice answering one examiner question at a time and receive RAG-grounded AI grading and feedback.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <Mic className="mx-auto h-8 w-8 text-violet-600" />
          <h2 className="mt-3 font-display text-lg font-semibold text-slate-900">
            Generate Viva Questions First
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-600">
            Generate the paper&apos;s viva question bank so the examiner simulator can quiz you and grade your responses.
          </p>
          <button
            type="button"
            onClick={() => void onGenerateViva()}
            disabled={generatingViva}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {generatingViva ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating Questions...
              </>
            ) : (
              'Generate 20+ Viva Questions'
            )}
          </button>
        </div>
      </div>
    );
  }

  const latestEval = workspace.evaluations.find((e) => e.questionId === currentQ.id);
  const evaluatedCount = workspace.evaluations.length;
  const averageScore =
    evaluatedCount > 0
      ? (
          workspace.evaluations.reduce((acc, item) => acc + item.score, 0) / evaluatedCount
        ).toFixed(1)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answerDraft.trim() || evaluating) return;
    await onEvaluateAnswer({ questionId: currentQ.id, userAnswer: answerDraft.trim() });
  };

  const selectQuestion = (nextIdx: number) => {
    setQuestionIdx(nextIdx);
    const nextQ = questions[nextIdx];
    const existing = workspace.evaluations.find((e) => e.questionId === nextQ?.id);
    setAnswerDraft(existing?.userAnswer ?? '');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Interactive Viva Practice
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Answer one examiner question at a time. Gemini evaluates your response against retrieved ground-truth passages from the paper.
          </p>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs shrink-0">
          <div>
            <span className="text-slate-500">Answered:</span>{' '}
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {evaluatedCount} / {questions.length}
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <div>
            <span className="text-slate-500">Practice Avg:</span>{' '}
            <span className="font-mono font-semibold text-blue-700 tabular-nums">
              {averageScore !== null ? `${averageScore} / 10` : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Question Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              Question {questionIdx + 1} of {questions.length}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-blue-700">{currentQ.category}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium">{currentQ.difficulty}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono">{currentQ.pageReference}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={questionIdx === 0}
              onClick={() => selectQuestion(Math.max(0, questionIdx - 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </button>
            <button
              type="button"
              disabled={questionIdx >= questions.length - 1}
              onClick={() => selectQuestion(Math.min(questions.length - 1, questionIdx + 1))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <h2 className="mt-5 font-display text-xl font-semibold text-slate-900 text-balance">
          {currentQ.question}
        </h2>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label htmlFor="viva-answer-box" className="block text-xs font-medium text-slate-700">
            Your Viva Defense Response
          </label>
          <textarea
            id="viva-answer-box"
            rows={5}
            value={answerDraft}
            onChange={(e) => setAnswerDraft(e.target.value)}
            placeholder="Type your explanation clearly, mentioning key mechanisms, assumptions, or empirical results from the paper..."
            className="w-full rounded-lg border border-slate-300 bg-slate-50 p-3.5 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
          />
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={evaluating || !answerDraft.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {evaluating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Evaluating via RAG + Gemini...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit Answer for Evaluation
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Evaluation Feedback */}
      {latestEval && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-5">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Examiner Evaluation Verdict
              </div>
              <h3 className="mt-0.5 font-display text-lg font-bold text-slate-900">
                {latestEval.verdict}
              </h3>
            </div>
            <div className="text-left sm:text-right">
              <div className="text-xs text-slate-500">Score</div>
              <div className="font-mono text-2xl font-bold text-blue-700 tabular-nums">
                {latestEval.score} / {latestEval.maxScore}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Strengths Identified
              </h4>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                {latestEval.strengths.map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-semibold text-red-700">
                <XCircle className="h-4 w-4" />
                Weaknesses & Missing Points
              </h4>
              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                {[...latestEval.weaknesses, ...latestEval.missingKeyPoints].map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
              <span>Improved Examiner-Ready Model Answer</span>
              <span className="font-mono text-blue-700">
                {latestEval.pageReferences.join(', ') || currentQ.pageReference}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
              {latestEval.improvedModelAnswer}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
