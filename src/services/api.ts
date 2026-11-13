import type {
  AgentIntent,
  ChatMessage,
  DocumentMetadata,
  ExtractedConcepts,
  PaperWorkspace,
  PresentationDeck,
  PromptEngineeringSpec,
  RagInspectionResult,
  SlideThemeId,
  StructuredSummary,
  VivaEvaluation,
  VivaQuestionBank,
  WorkspaceSettings,
} from '../types/paperwise.ts';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // ignore non-json error
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function fetchHealth(): Promise<{
  ok: boolean;
  runtime: string;
  chatModel: string;
  embeddingModel: string;
  geminiConfigured: boolean;
  pythonBackendIncluded: boolean;
}> {
  const res = await fetch('/api/health');
  return handleResponse(res);
}

export async function fetchSettings(): Promise<WorkspaceSettings> {
  const res = await fetch('/api/settings');
  return handleResponse(res);
}

export async function updateSettings(
  partial: Partial<WorkspaceSettings>
): Promise<WorkspaceSettings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(partial),
  });
  return handleResponse(res);
}

export async function fetchPrompts(): Promise<{ prompts: PromptEngineeringSpec[] }> {
  const res = await fetch('/api/prompts');
  return handleResponse(res);
}

export async function listPapers(): Promise<{ papers: DocumentMetadata[] }> {
  const res = await fetch('/api/papers');
  return handleResponse(res);
}

export async function fetchPaperWorkspace(id: string): Promise<PaperWorkspace> {
  const res = await fetch(`/api/papers/${encodeURIComponent(id)}`);
  return handleResponse(res);
}

export async function deletePaper(id: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`/api/papers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return handleResponse(res);
}

export async function uploadPaperPdf(
  file: File,
  onProgress?: (percent: number) => void
): Promise<PaperWorkspace> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/papers/upload');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(parsed as PaperWorkspace);
        } else {
          reject(new Error(parsed?.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during PDF upload.'));
    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

export async function loadSamplePaper(): Promise<PaperWorkspace> {
  const res = await fetch('/api/papers/load-sample', { method: 'POST' });
  return handleResponse(res);
}

export async function runSummarize(
  paperId: string
): Promise<{ summary: StructuredSummary; workspace: PaperWorkspace }> {
  const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/summarize`, {
    method: 'POST',
  });
  return handleResponse(res);
}

export async function runExtractConcepts(
  paperId: string
): Promise<{ concepts: ExtractedConcepts; workspace: PaperWorkspace }> {
  const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/concepts`, {
    method: 'POST',
  });
  return handleResponse(res);
}

export async function runGenerateSlides(
  paperId: string,
  options: { slideCount: number; theme: SlideThemeId }
): Promise<{ presentation: PresentationDeck; workspace: PaperWorkspace }> {
  const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/slides`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options),
  });
  return handleResponse(res);
}

export async function runGenerateViva(
  paperId: string,
  minQuestions = 20
): Promise<{ viva: VivaQuestionBank; workspace: PaperWorkspace }> {
  const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/viva`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ minQuestions }),
  });
  return handleResponse(res);
}

export async function runEvaluateViva(
  paperId: string,
  payload: { questionId: string; userAnswer: string }
): Promise<{ evaluation: VivaEvaluation; workspace: PaperWorkspace }> {
  const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/viva/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
}

export async function sendPaperChat(
  paperId: string,
  message: string
): Promise<{
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  workspace: PaperWorkspace;
}> {
  const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return handleResponse(res);
}

export async function routeNaturalLanguageTask(
  paperId: string,
  prompt: string
): Promise<{
  classification: {
    intent: AgentIntent;
    confidence: number;
    reasoning: string;
    selectedAgent: string;
    needsRetrieval: boolean;
  };
  targetTab: string;
  workspace: PaperWorkspace;
}> {
  const res = await fetch(`/api/papers/${encodeURIComponent(paperId)}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return handleResponse(res);
}

export async function inspectRag(
  paperId: string,
  query: string,
  topK: number
): Promise<RagInspectionResult> {
  const params = new URLSearchParams({ query, topK: String(topK) });
  const res = await fetch(
    `/api/papers/${encodeURIComponent(paperId)}/rag-inspect?${params.toString()}`
  );
  return handleResponse(res);
}
