import { Type } from '@google/genai';
import { StructuredLcelChain } from '../lcel.ts';
import { SLIDE_PROMPT, SLIDE_SYSTEM_PROMPT } from '../prompts/templates.ts';
import { formatPagesForPrompt } from '../services/pdfProcessor.ts';
import type {
  PageContent,
  PresentationDeck,
  SlideItem,
  SlideThemeId,
} from '../../src/types/paperwise.ts';

const slideDeckSchema = {
  type: Type.OBJECT,
  properties: {
    paperTitle: { type: Type.STRING },
    sourceInfo: { type: Type.STRING },
    slides: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          slideNumber: { type: Type.INTEGER },
          sectionType: { type: Type.STRING },
          title: { type: Type.STRING },
          subtitle: { type: Type.STRING },
          bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
          speakerNotes: { type: Type.STRING },
          visualSuggestion: { type: Type.STRING },
          diagramNodes: { type: Type.ARRAY, items: { type: Type.STRING } },
          chartData: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                value: { type: Type.NUMBER },
                unit: { type: Type.STRING },
              },
              required: ['label', 'value'],
            },
          },
          pageReferences: { type: Type.STRING },
        },
        required: [
          'slideNumber',
          'sectionType',
          'title',
          'bullets',
          'speakerNotes',
          'visualSuggestion',
          'pageReferences',
        ],
      },
    },
  },
  required: ['paperTitle', 'sourceInfo', 'slides'],
};

const slideChain = new StructuredLcelChain<{
  paperTitle: string;
  sourceInfo: string;
  slides: SlideItem[];
}>({
  name: 'SlideGeneratorAgentChain',
  promptTemplate: SLIDE_PROMPT,
  systemPrompt: SLIDE_SYSTEM_PROMPT,
  responseSchema: slideDeckSchema,
});

export async function runSlideGeneratorAgent(params: {
  title: string;
  authors: string;
  pageCount: number;
  pages: PageContent[];
  slideCount: number;
  theme: SlideThemeId;
}): Promise<{
  deck: PresentationDeck;
  latencyMs: number;
  lcelPipeline: string;
}> {
  const count = Math.max(6, Math.min(14, params.slideCount || 10));
  const pagesText = formatPagesForPrompt(params.pages);

  const res = await slideChain.invoke(
    {
      slide_count: count,
      theme: params.theme,
      title: params.title,
      authors: params.authors,
      page_count: params.pageCount,
      paper_pages_text: pagesText,
    },
    { slide_count: count }
  );

  const normalizedSlides = res.output.slides.map((s, idx) => ({
    ...s,
    slideNumber: idx + 1,
  }));

  return {
    deck: {
      theme: params.theme,
      slideCount: normalizedSlides.length,
      paperTitle: res.output.paperTitle || params.title,
      sourceInfo: res.output.sourceInfo || `${params.authors} (${params.pageCount} pages)`,
      slides: normalizedSlides,
      generatedAt: new Date().toISOString(),
    },
    latencyMs: res.latencyMs,
    lcelPipeline: res.chainExpression,
  };
}
