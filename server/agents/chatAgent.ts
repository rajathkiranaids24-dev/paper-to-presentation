import { TextLcelChain } from '../lcel.ts';
import { RAG_CHAT_PROMPT, RAG_CHAT_SYSTEM_PROMPT } from '../prompts/templates.ts';
import { similaritySearch } from '../rag/vectorStore.ts';
import type { ChatMessage, RetrievedChunk } from '../../src/types/paperwise.ts';

const ragChatChain = new TextLcelChain({
  name: 'AgenticRagChatChain',
  promptTemplate: RAG_CHAT_PROMPT,
  systemPrompt: RAG_CHAT_SYSTEM_PROMPT,
});

function needsVectorRetrieval(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (
    q === 'what is the title?' ||
    q === 'how many pages does this paper have?' ||
    q === 'who are the authors?'
  ) {
    return false;
  }
  return true;
}

export async function runRagChatAgent(params: {
  documentId: string;
  title: string;
  authors: string;
  pageCount: number;
  userQuestion: string;
  chatHistory: ChatMessage[];
  topK?: number;
}): Promise<{
  answer: string;
  retrievalUsed: boolean;
  retrievedChunks: RetrievedChunk[];
  pageReferences: number[];
  latencyMs: number;
  lcelPipeline: string;
}> {
  const start = Date.now();
  const shouldRetrieve = needsVectorRetrieval(params.userQuestion);

  let retrievedChunks: RetrievedChunk[] = [];
  let retrievedContextText = '';

  if (shouldRetrieve) {
    const search = await similaritySearch({
      documentId: params.documentId,
      query: params.userQuestion,
      topK: params.topK ?? 5,
    });
    retrievedChunks = search.results;
    retrievedContextText = retrievedChunks
      .map(
        (chunk, idx) =>
          `Chunk #${idx + 1} [Page ${chunk.pageNumber} | Score: ${chunk.score.toFixed(4)} | Section: ${chunk.sectionHint}]\n${chunk.text}`
      )
      .join('\n\n---\n\n');
  } else {
    retrievedContextText = `Document Metadata:\nTitle: ${params.title}\nAuthors: ${params.authors}\nTotal Pages: ${params.pageCount}`;
  }

  const recentHistory = params.chatHistory
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const res = await ragChatChain.invoke({
    title: params.title,
    page_count: params.pageCount,
    chat_history: recentHistory || 'No prior conversation turns.',
    retrieved_context: retrievedContextText,
    user_question: params.userQuestion,
  });

  // Extract cited page numbers from chunks + response citations
  const pageSet = new Set<number>();
  for (const chunk of retrievedChunks) {
    if (chunk.score >= 0.35) {
      pageSet.add(chunk.pageNumber);
    }
  }
  const citationMatches = res.output.matchAll(/Page\s+(\d+)/gi);
  for (const match of citationMatches) {
    const num = Number(match[1]);
    if (num >= 1 && num <= params.pageCount) {
      pageSet.add(num);
    }
  }

  return {
    answer: res.output,
    retrievalUsed: shouldRetrieve,
    retrievedChunks,
    pageReferences: Array.from(pageSet).sort((a, b) => a - b),
    latencyMs: Date.now() - start,
    lcelPipeline: shouldRetrieve
      ? `VectorRetriever(top_k=${params.topK ?? 5}) | ${res.chainExpression}`
      : `MetadataDirect | ${res.chainExpression}`,
  };
}
