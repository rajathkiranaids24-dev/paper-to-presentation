import { ThinkingLevel } from '@google/genai';
import { generateGeminiJson, generateGeminiText } from './gemini.ts';
import { PromptTemplate } from './prompts/templates.ts';

export interface LcelExecutionResult<T> {
  output: T;
  latencyMs: number;
  renderedPromptPreview: string;
  chainExpression: string;
}

export class StructuredLcelChain<TOutput> {
  private readonly name: string;
  private readonly promptTemplate: PromptTemplate;
  private readonly systemPrompt: string;
  private readonly responseSchema: Record<string, unknown>;
  private readonly thinkingLevel: ThinkingLevel;

  constructor(config: {
    name: string;
    promptTemplate: PromptTemplate;
    systemPrompt: string;
    responseSchema: Record<string, unknown>;
    thinkingLevel?: ThinkingLevel;
  }) {
    this.name = config.name;
    this.promptTemplate = config.promptTemplate;
    this.systemPrompt = config.systemPrompt;
    this.responseSchema = config.responseSchema;
    this.thinkingLevel = config.thinkingLevel ?? ThinkingLevel.LOW;
  }

  async invoke(
    variables: Record<string, string | number>,
    systemOverrides?: Record<string, string | number>
  ): Promise<LcelExecutionResult<TOutput>> {
    const start = Date.now();
    let systemInstruction = this.systemPrompt;
    if (systemOverrides) {
      for (const [k, v] of Object.entries(systemOverrides)) {
        systemInstruction = systemInstruction.split(`{${k}}`).join(String(v));
      }
    }

    const formattedPrompt = this.promptTemplate.format(variables);
    const output = await generateGeminiJson<TOutput>({
      systemInstruction,
      prompt: formattedPrompt,
      responseSchema: this.responseSchema,
      thinkingLevel: this.thinkingLevel,
    });

    return {
      output,
      latencyMs: Date.now() - start,
      renderedPromptPreview: formattedPrompt.slice(0, 420),
      chainExpression: `${this.name}: PromptTemplate | ChatGemini(gemini-4-hydrogen) | StructuredJsonOutputParser`,
    };
  }
}

export class TextLcelChain {
  private readonly name: string;
  private readonly promptTemplate: PromptTemplate;
  private readonly systemPrompt: string;
  private readonly thinkingLevel: ThinkingLevel;

  constructor(config: {
    name: string;
    promptTemplate: PromptTemplate;
    systemPrompt: string;
    thinkingLevel?: ThinkingLevel;
  }) {
    this.name = config.name;
    this.promptTemplate = config.promptTemplate;
    this.systemPrompt = config.systemPrompt;
    this.thinkingLevel = config.thinkingLevel ?? ThinkingLevel.LOW;
  }

  async invoke(variables: Record<string, string | number>): Promise<LcelExecutionResult<string>> {
    const start = Date.now();
    const formattedPrompt = this.promptTemplate.format(variables);
    const output = await generateGeminiText({
      systemInstruction: this.systemPrompt,
      prompt: formattedPrompt,
      thinkingLevel: this.thinkingLevel,
    });

    return {
      output,
      latencyMs: Date.now() - start,
      renderedPromptPreview: formattedPrompt.slice(0, 420),
      chainExpression: `${this.name}: PromptTemplate | ChatGemini(gemini-4-hydrogen) | StrOutputParser`,
    };
  }
}
