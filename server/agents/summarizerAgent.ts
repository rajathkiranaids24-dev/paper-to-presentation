import { Type } from '@google/genai';
import { StructuredLcelChain } from '../lcel.ts';
import { SUMMARIZER_PROMPT, SUMMARIZER_SYSTEM_PROMPT } from '../prompts/templates.ts';
import { formatPagesForPrompt } from '../services/pdfProcessor.ts';
import type { PageContent, StructuredSummary } from '../../src/types/paperwise.ts';

const summarySchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    authors: { type: Type.STRING },
    abstractSummary: { type: Type.STRING },
    introductionSummary: { type: Type.STRING },
    problemStatement: { type: Type.STRING },
    objectives: { type: Type.ARRAY, items: { type: Type.STRING } },
    methodology: { type: Type.STRING },
    results: { type: Type.STRING },
    conclusion: { type: Type.STRING },
    keyTakeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
    simpleExplanations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: ['term', 'explanation'],
      },
    },
    sectionPages: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          section: { type: Type.STRING },
          pageRange: { type: Type.STRING },
        },
        required: ['section', 'pageRange'],
      },
    },
  },
  required: [
    'title',
    'authors',
    'abstractSummary',
    'introductionSummary',
    'problemStatement',
    'objectives',
    'methodology',
    'results',
    'conclusion',
    'keyTakeaways',
    'simpleExplanations',
    'sectionPages',
  ],
};

const summarizerChain = new StructuredLcelChain<Omit<StructuredSummary, 'generatedAt'>>({
  name: 'SummarizerAgentChain',
  promptTemplate: SUMMARIZER_PROMPT,
  systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
  responseSchema: summarySchema,
});

export async function runSummarizerAgent(params: {
  filename: string;
  pageCount: number;
  pages: PageContent[];
}): Promise<{
  summary: StructuredSummary;
  latencyMs: number;
  lcelPipeline: string;
}> {
  const pagesText = formatPagesForPrompt(params.pages);
  const res = await summarizerChain.invoke({
    filename: params.filename,
    page_count: params.pageCount,
    paper_pages_text: pagesText,
  });

  return {
    summary: {
      ...res.output,
      generatedAt: new Date().toISOString(),
    },
    latencyMs: res.latencyMs,
    lcelPipeline: res.chainExpression,
  };
}
