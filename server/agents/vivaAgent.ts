import { Type } from '@google/genai';
import { StructuredLcelChain } from '../lcel.ts';
import {
  VIVA_EVAL_PROMPT,
  VIVA_EVAL_SYSTEM_PROMPT,
  VIVA_PROMPT,
  VIVA_SYSTEM_PROMPT,
} from '../prompts/templates.ts';
import { similaritySearch } from '../rag/vectorStore.ts';
import { formatPagesForPrompt } from '../services/pdfProcessor.ts';
import type {
  PageContent,
  VivaEvaluation,
  VivaQuestion,
  VivaQuestionBank,
} from '../../src/types/paperwise.ts';

const vivaQuestionSchema = {
  type: Type.OBJECT,
  properties: {
    questions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          category: {
            type: Type.STRING,
            enum: [
              'Basic',
              'Conceptual',
              'Technical',
              'Methodology',
              'Results-based',
              'Challenging Examiner',
            ],
          },
          difficulty: {
            type: Type.STRING,
            enum: ['Easy', 'Medium', 'Hard'],
          },
          question: { type: Type.STRING },
          modelAnswer: { type: Type.STRING },
          beginnerExplanation: { type: Type.STRING },
          pageReference: { type: Type.STRING },
        },
        required: [
          'id',
          'category',
          'difficulty',
          'question',
          'modelAnswer',
          'beginnerExplanation',
          'pageReference',
        ],
      },
    },
  },
  required: ['questions'],
};

const vivaEvaluationSchema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.INTEGER },
    verdict: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
    missingKeyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvedModelAnswer: { type: Type.STRING },
    pageReferences: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'score',
    'verdict',
    'strengths',
    'weaknesses',
    'missingKeyPoints',
    'improvedModelAnswer',
    'pageReferences',
  ],
};

const vivaGenChain = new StructuredLcelChain<{ questions: VivaQuestion[] }>({
  name: 'VivaQuestionGeneratorChain',
  promptTemplate: VIVA_PROMPT,
  systemPrompt: VIVA_SYSTEM_PROMPT,
  responseSchema: vivaQuestionSchema,
});

const vivaEvalChain = new StructuredLcelChain<{
  score: number;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  missingKeyPoints: string[];
  improvedModelAnswer: string;
  pageReferences: string[];
}>({
  name: 'VivaEvaluatorReflectionChain',
  promptTemplate: VIVA_EVAL_PROMPT,
  systemPrompt: VIVA_EVAL_SYSTEM_PROMPT,
  responseSchema: vivaEvaluationSchema,
});

export async function runVivaGeneratorAgent(params: {
  title: string;
  pageCount: number;
  pages: PageContent[];
  minQuestions?: number;
}): Promise<{
  viva: VivaQuestionBank;
  latencyMs: number;
  lcelPipeline: string;
}> {
  const minQuestions = Math.max(20, params.minQuestions ?? 20);
  const pagesText = formatPagesForPrompt(params.pages);

  const res = await vivaGenChain.invoke({
    min_questions: minQuestions,
    title: params.title,
    page_count: params.pageCount,
    paper_pages_text: pagesText,
  });

  const normalized = res.output.questions.map((q, idx) => ({
    ...q,
    id: q.id || `viva_q_${idx + 1}`,
  }));

  return {
    viva: {
      totalCount: normalized.length,
      questions: normalized,
      generatedAt: new Date().toISOString(),
    },
    latencyMs: res.latencyMs,
    lcelPipeline: res.chainExpression,
  };
}

export async function runVivaEvaluatorAgent(params: {
  documentId: string;
  question: VivaQuestion;
  userAnswer: string;
  topK?: number;
}): Promise<{
  evaluation: VivaEvaluation;
  latencyMs: number;
  lcelPipeline: string;
  retrievedChunksCount: number;
}> {
  // Retrieve ground-truth passages from vector store to prevent hallucinated grading
  const retrieval = await similaritySearch({
    documentId: params.documentId,
    query: `${params.question.question} ${params.userAnswer}`,
    topK: params.topK ?? 4,
  });

  const retrievedContext = retrieval.results
    .map(
      (c) =>
        `[Page ${c.pageNumber} | Similarity ${c.score.toFixed(3)} | ${c.sectionHint}]\n${c.text}`
    )
    .join('\n\n');

  const res = await vivaEvalChain.invoke({
    category: params.question.category,
    difficulty: params.question.difficulty,
    question: params.question.question,
    model_answer: params.question.modelAnswer,
    retrieved_context: retrievedContext,
    user_answer: params.userAnswer,
  });

  const clampedScore = Math.max(0, Math.min(10, Math.round(res.output.score)));

  return {
    evaluation: {
      questionId: params.question.id,
      question: params.question.question,
      userAnswer: params.userAnswer,
      score: clampedScore,
      maxScore: 10,
      verdict: res.output.verdict,
      strengths: res.output.strengths,
      weaknesses: res.output.weaknesses,
      missingKeyPoints: res.output.missingKeyPoints,
      improvedModelAnswer: res.output.improvedModelAnswer,
      pageReferences: res.output.pageReferences,
      evaluatedAt: new Date().toISOString(),
    },
    latencyMs: res.latencyMs + retrieval.latencyMs,
    lcelPipeline: `VectorRetriever(top_k=${params.topK ?? 4}) | ${res.chainExpression}`,
    retrievedChunksCount: retrieval.results.length,
  };
}
