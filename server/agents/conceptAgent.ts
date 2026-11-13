import { Type } from '@google/genai';
import { StructuredLcelChain } from '../lcel.ts';
import { CONCEPT_PROMPT, CONCEPT_SYSTEM_PROMPT } from '../prompts/templates.ts';
import { formatPagesForPrompt } from '../services/pdfProcessor.ts';
import type { ExtractedConcepts, PageContent } from '../../src/types/paperwise.ts';

const conceptSchema = {
  type: Type.OBJECT,
  properties: {
    importantConcepts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          definition: { type: Type.STRING },
          simpleExplanation: { type: Type.STRING },
          pageReference: { type: Type.STRING },
        },
        required: ['name', 'definition', 'simpleExplanation', 'pageReference'],
      },
    },
    algorithmsAndMethods: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          purpose: { type: Type.STRING },
          workflow: { type: Type.STRING },
          pageReference: { type: Type.STRING },
        },
        required: ['name', 'purpose', 'workflow', 'pageReference'],
      },
    },
    researchContributions: { type: Type.ARRAY, items: { type: Type.STRING } },
    importantFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
    limitations: { type: Type.ARRAY, items: { type: Type.STRING } },
    futureScope: { type: Type.ARRAY, items: { type: Type.STRING } },
    technicalGlossary: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          meaning: { type: Type.STRING },
        },
        required: ['term', 'meaning'],
      },
    },
  },
  required: [
    'importantConcepts',
    'algorithmsAndMethods',
    'researchContributions',
    'importantFindings',
    'limitations',
    'futureScope',
    'technicalGlossary',
  ],
};

const conceptChain = new StructuredLcelChain<Omit<ExtractedConcepts, 'generatedAt'>>({
  name: 'ConceptExtractorAgentChain',
  promptTemplate: CONCEPT_PROMPT,
  systemPrompt: CONCEPT_SYSTEM_PROMPT,
  responseSchema: conceptSchema,
});

export async function runConceptExtractorAgent(params: {
  title: string;
  pageCount: number;
  pages: PageContent[];
}): Promise<{
  concepts: ExtractedConcepts;
  latencyMs: number;
  lcelPipeline: string;
}> {
  const pagesText = formatPagesForPrompt(params.pages);
  const res = await conceptChain.invoke({
    title: params.title,
    page_count: params.pageCount,
    paper_pages_text: pagesText,
  });

  return {
    concepts: {
      ...res.output,
      generatedAt: new Date().toISOString(),
    },
    latencyMs: res.latencyMs,
    lcelPipeline: res.chainExpression,
  };
}
