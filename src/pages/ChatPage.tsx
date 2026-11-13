import { ChevronDown, ChevronUp, Loader2, MessageSquare, Send } from 'lucide-react';
import React, { useState } from 'react';
import { EmptyPaperState } from '../components/EmptyPaperState.tsx';
import type { NavTabId } from '../components/Sidebar.tsx';
import type { PaperWorkspace } from '../types/paperwise.ts';

interface ChatPageProps {
  workspace: PaperWorkspace | null;
  onNavigate: (tab: NavTabId) => void;
  onLoadSample: () => void;
  loadingSample: boolean;
  onSendMessage: (message: string) => Promise<void>;
  sending: boolean;
}

const STARTER_PROMPTS = [
  'What research problem and core objectives does this paper address?',
  'Summarize the quantitative results and key baselines reported in the paper.',
  'What limitations and future work directions are explicitly stated by the authors?',
  'Does this paper propose any quantum hardware accelerator?',
];

export const ChatPage: React.FC<ChatPageProps> = ({
  workspace,
  onNavigate,
  onLoadSample,
  loadingSample,
  onSendMessage,
  sending,
}) => {
  const [input, setInput] = useState('');
  const [expandedChunks, setExpandedChunks] = useState<Record<string, boolean>>({});

  if (!workspace) {
    return (
      <EmptyPaperState
        onGoToUpload={() => onNavigate('upload')}
        onLoadSample={onLoadSample}
        loadingSample={loadingSample}
      />
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    const msg = input.trim();
    setInput('');
    await onSendMessage(msg);
  };

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[540px] flex-col rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <h1 className="font-display text-lg font-bold text-slate-900">
            Grounded Research Paper Chat (Agentic RAG)
          </h1>
          <p className="text-xs text-slate-500">
            Collection: <span className="font-mono">{workspace.metadata.collectionName}</span> ·
            Strict page citation & unsupported-claim refusal enabled
          </p>
        </div>
      </div>

      {/* Messages Viewport */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {workspace.chatHistory.length === 0 ? (
          <div className="mx-auto max-w-2xl py-8 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-blue-600" />
            <h2 className="mt-3 font-display text-base font-semibold text-slate-900">
              Ask Anything About "{workspace.metadata.title}"
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Every query runs Few-Shot Intent Detection, retrieves top-K vector chunks with cosine similarity scores, and cites exact page references.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2 text-left">
              {STARTER_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => void onSendMessage(prompt)}
                  disabled={sending}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          workspace.chatHistory.map((msg) => {
            const isUser = msg.role === 'user';
            const chunksOpen = Boolean(expandedChunks[msg.id]);
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    isUser
                      ? 'bg-[#0F172A] text-white'
                      : 'border border-slate-200 bg-slate-50/70 text-slate-800'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>

                  {!isUser && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 pt-2.5 text-[11px] text-slate-500">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-violet-700">
                          {msg.detectedIntent || 'ASK_PAPER_QUESTION'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {msg.retrievalUsed
                            ? `RAG: ${msg.retrievedChunks?.length ?? 0} chunks`
                            : 'Direct Metadata'}
                        </span>
                        {msg.pageReferences && msg.pageReferences.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-blue-700">
                              Sources: Pages {msg.pageReferences.join(', ')}
                            </span>
                          </>
                        )}
                        {msg.processingTimeMs !== undefined && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {msg.processingTimeMs} ms
                            </span>
                          </>
                        )}
                      </div>

                      {msg.retrievedChunks && msg.retrievedChunks.length > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedChunks((prev) => ({
                              ...prev,
                              [msg.id]: !prev[msg.id],
                            }))
                          }
                          className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
                        >
                          {chunksOpen ? 'Hide Context' : 'Inspect Retrieved Context'}
                          {chunksOpen ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {!isUser && chunksOpen && msg.retrievedChunks && (
                    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                      {msg.retrievedChunks.map((chunk) => (
                        <div
                          key={chunk.id}
                          className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
                        >
                          <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                            <span>
                              Page {chunk.pageNumber} · Chunk #{chunk.chunkIndex} ({chunk.sectionHint})
                            </span>
                            <span className="font-semibold text-blue-700 tabular-nums">
                              Similarity: {chunk.score.toFixed(4)}
                            </span>
                          </div>
                          <p className="mt-1 text-slate-700 leading-relaxed">{chunk.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Running Intent Router → Vector Similarity Search → ReAct Grounding...
          </div>
        )}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2.5 border-t border-slate-200 px-4 py-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question grounded in this research paper..."
          className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-blue-600 focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
        >
          <Send className="h-4 w-4" />
          Send
        </button>
      </form>
    </div>
  );
};
