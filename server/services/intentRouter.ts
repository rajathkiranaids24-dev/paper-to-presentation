import { Type } from '@google/genai';
import { StructuredLcelChain } from '../lcel.ts';
import {
  INTENT_ROUTER_FEW_SHOT,
  INTENT_ROUTER_PROMPT,
  INTENT_ROUTER_SYSTEM_PROMPT,
} from '../prompts/templates.ts';
import type { AgentIntent } from '../../src/types/paperwise.ts';

export interface IntentClassificationResult {
  intent: AgentIntent;
  confidence: number;
  reasoning: string;
  selectedAgent: string;
  needsRetrieval: boolean;
  latencyMs: number;
  lcelPipeline: string;
}

const intentSchema = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: [
        'SUMMARIZE_PAPER',
        'EXTRACT_CONCEPTS',
        'GENERATE_SLIDES',
        'GENERATE_VIVA',
        'ASK_PAPER_QUESTION',
        'EVALUATE_VIVA_ANSWER',
      ],
    },
    confidence: { type: Type.NUMBER },
    reasoning: { type: Type.STRING },
    selectedAgent: { type: Type.STRING },
    needsRetrieval: { type: Type.BOOLEAN },
  },
  required: ['intent', 'confidence', 'reasoning', 'selectedAgent', 'needsRetrieval'],
};

const intentChain = new StructuredLcelChain<{
  intent: AgentIntent;
  confidence: number;
  reasoning: string;
  selectedAgent: string;
  needsRetrieval: boolean;
}>({
  name: 'IntentRouterChain',
  promptTemplate: INTENT_ROUTER_PROMPT,
  systemPrompt: INTENT_ROUTER_SYSTEM_PROMPT,
  responseSchema: intentSchema,
});

const AGENT_MAP: Record<AgentIntent, string> = {
  SUMMARIZE_PAPER: 'Summarizer Agent',
  EXTRACT_CONCEPTS: 'Concept-Extractor Agent',
  GENERATE_SLIDES: 'Slide-Generator Agent',
  GENERATE_VIVA: 'Viva Agent',
  ASK_PAPER_QUESTION: 'RAG Chat Agent',
  EVALUATE_VIVA_ANSWER: 'Viva Agent',
};

export async function detectIntent(userQuery: string): Promise<IntentClassificationResult> {
  const fewShotText = INTENT_ROUTER_FEW_SHOT.map(
    (ex, idx) => `Example ${idx + 1}:\nInput: "${ex.input}"\nOutput: ${ex.output}`
  ).join('\n\n');

  const res = await intentChain.invoke({
    few_shot_examples: fewShotText,
    user_query: userQuery,
  });

  const intent = res.output.intent;
  return {
    intent,
    confidence: Number(Math.min(1, Math.max(0, res.output.confidence)).toFixed(2)),
    reasoning: res.output.reasoning,
    selectedAgent: AGENT_MAP[intent] ?? res.output.selectedAgent,
    needsRetrieval: res.output.needsRetrieval,
    latencyMs: res.latencyMs,
    lcelPipeline: res.chainExpression,
  };
}
