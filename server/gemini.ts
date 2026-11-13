import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export const CHAT_MODEL = 'gemini-4-hydrogen';
export const EMBEDDING_MODEL = 'gemini-embedding-2';

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured in the server environment. Configure it in Settings > Secrets.'
    );
  }
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return cachedClient;
}

function isRetryableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('503') ||
    msg.includes('500') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('ECONNRESET') ||
    msg.includes('fetch failed')
  );
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 600
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !isRetryableError(err)) {
        break;
      }
      const jitter = Math.floor(Math.random() * 250);
      const waitMs = baseDelayMs * Math.pow(2, attempt) + jitter;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw formatGeminiError(lastErr);
}

export function formatGeminiError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return new Error(
      'Gemini API authentication failed (403/API_KEY_INVALID). Verify GEMINI_API_KEY in Settings > Secrets.'
    );
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return new Error(
      'Gemini API rate limit reached (429 RESOURCE_EXHAUSTED). Please retry shortly or verify quota.'
    );
  }
  return err instanceof Error ? err : new Error(raw);
}

export async function generateGeminiJson<T>(params: {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  thinkingLevel?: ThinkingLevel;
}): Promise<T> {
  const ai = getGeminiClient();
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: params.prompt,
      config: {
        systemInstruction: params.systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: params.responseSchema as never,
        thinkingConfig: {
          thinkingLevel: params.thinkingLevel ?? ThinkingLevel.LOW,
        },
      },
    });
    const rawText = (response.text ?? '').trim();
    if (!rawText) {
      throw new Error('Gemini returned an empty structured response.');
    }
    try {
      return JSON.parse(rawText) as T;
    } catch {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      return JSON.parse(cleaned) as T;
    }
  });
}

export async function generateGeminiText(params: {
  systemInstruction: string;
  prompt: string;
  thinkingLevel?: ThinkingLevel;
}): Promise<string> {
  const ai = getGeminiClient();
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: params.prompt,
      config: {
        systemInstruction: params.systemInstruction,
        thinkingConfig: {
          thinkingLevel: params.thinkingLevel ?? ThinkingLevel.LOW,
        },
      },
    });
    const text = (response.text ?? '').trim();
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }
    return text;
  });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ai = getGeminiClient();
  const concurrency = 6;
  const allEmbeddings: number[][] = new Array(texts.length);

  for (let i = 0; i < texts.length; i += concurrency) {
    const slice = texts.slice(i, i + concurrency);
    const vectors = await Promise.all(
      slice.map((text) =>
        withRetry(async () => {
          const res = await ai.models.embedContent({
            model: EMBEDDING_MODEL,
            contents: text,
          });
          const values = res.embeddings?.[0]?.values;
          if (!values || values.length === 0) {
            throw new Error('Received empty embedding vector from Gemini.');
          }
          return values;
        })
      )
    );
    vectors.forEach((vec, offset) => {
      allEmbeddings[i + offset] = vec;
    });
  }
  return allEmbeddings;
}

export async function embedQuery(text: string): Promise<number[]> {
  const vectors = await embedTexts([text]);
  return vectors[0];
}
