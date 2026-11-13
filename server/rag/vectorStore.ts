import fs from 'fs';
import path from 'path';
import { EMBEDDING_MODEL, embedQuery, embedTexts } from '../gemini.ts';
import type {
  AgentExecutionLog,
  PaperWorkspace,
  RagInspectionResult,
  RetrievedChunk,
  WorkspaceSettings,
} from '../../src/types/paperwise.ts';
import type { TextChunkInput } from '../services/pdfProcessor.ts';

const DATA_ROOT = path.resolve(process.cwd(), '.paperwise_data');
const WORKSPACES_DIR = path.join(DATA_ROOT, 'workspaces');
const VECTORS_DIR = path.join(DATA_ROOT, 'vectors');
const SETTINGS_FILE = path.join(DATA_ROOT, 'settings.json');

export interface StoredVectorRecord extends TextChunkInput {
  embedding: number[];
}

export interface VectorCollection {
  collectionName: string;
  documentId: string;
  embeddingModel: string;
  createdAt: string;
  records: StoredVectorRecord[];
}

function ensureDirs(): void {
  fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
  fs.mkdirSync(VECTORS_DIR, { recursive: true });
}

export function getDefaultSettings(): WorkspaceSettings {
  return {
    chunkSize: 900,
    chunkOverlap: 150,
    topK: 5,
    defaultSlideCount: 10,
    defaultSlideTheme: 'oxford-navy',
    activeModel: 'gemini-4-hydrogen',
    embeddingModel: EMBEDDING_MODEL,
  };
}

export function loadSettings(): WorkspaceSettings {
  ensureDirs();
  if (!fs.existsSync(SETTINGS_FILE)) {
    const defaults = getDefaultSettings();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaults, null, 2));
    return defaults;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
    return { ...getDefaultSettings(), ...parsed };
  } catch {
    return getDefaultSettings();
  }
}

export function saveSettings(partial: Partial<WorkspaceSettings>): WorkspaceSettings {
  ensureDirs();
  const next = { ...loadSettings(), ...partial };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

export function saveWorkspace(workspace: PaperWorkspace): void {
  ensureDirs();
  const filePath = path.join(WORKSPACES_DIR, `${workspace.metadata.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(workspace, null, 2));
}

export function loadWorkspace(documentId: string): PaperWorkspace | null {
  ensureDirs();
  const safeId = documentId.replace(/[^a-zA-Z0-9_-]/g, '');
  const filePath = path.join(WORKSPACES_DIR, `${safeId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as PaperWorkspace;
  } catch {
    return null;
  }
}

export function listWorkspaces(): PaperWorkspace[] {
  ensureDirs();
  const files = fs.readdirSync(WORKSPACES_DIR).filter((f) => f.endsWith('.json'));
  const items: PaperWorkspace[] = [];
  for (const file of files) {
    try {
      const ws = JSON.parse(fs.readFileSync(path.join(WORKSPACES_DIR, file), 'utf8')) as PaperWorkspace;
      items.push(ws);
    } catch {
      // skip corrupt file
    }
  }
  return items.sort(
    (a, b) =>
      new Date(b.metadata.uploadedAt).getTime() - new Date(a.metadata.uploadedAt).getTime()
  );
}

export function deleteWorkspace(documentId: string): void {
  ensureDirs();
  const safeId = documentId.replace(/[^a-zA-Z0-9_-]/g, '');
  const wsPath = path.join(WORKSPACES_DIR, `${safeId}.json`);
  const vecPath = path.join(VECTORS_DIR, `${safeId}.json`);
  if (fs.existsSync(wsPath)) fs.unlinkSync(wsPath);
  if (fs.existsSync(vecPath)) fs.unlinkSync(vecPath);
}

export function appendActivityLog(documentId: string, log: AgentExecutionLog): PaperWorkspace | null {
  const ws = loadWorkspace(documentId);
  if (!ws) return null;
  ws.activityLogs = [log, ...(ws.activityLogs ?? [])].slice(0, 100);
  saveWorkspace(ws);
  return ws;
}

export async function indexDocumentChunks(params: {
  documentId: string;
  collectionName: string;
  chunks: TextChunkInput[];
}): Promise<VectorCollection> {
  ensureDirs();
  const texts = params.chunks.map((c) => c.text);
  const embeddings = await embedTexts(texts);

  const records: StoredVectorRecord[] = params.chunks.map((chunk, idx) => ({
    ...chunk,
    embedding: embeddings[idx],
  }));

  const collection: VectorCollection = {
    collectionName: params.collectionName,
    documentId: params.documentId,
    embeddingModel: EMBEDDING_MODEL,
    createdAt: new Date().toISOString(),
    records,
  };

  const vecPath = path.join(VECTORS_DIR, `${params.documentId}.json`);
  fs.writeFileSync(vecPath, JSON.stringify(collection));
  return collection;
}

export function loadVectorCollection(documentId: string): VectorCollection | null {
  ensureDirs();
  const safeId = documentId.replace(/[^a-zA-Z0-9_-]/g, '');
  const vecPath = path.join(VECTORS_DIR, `${safeId}.json`);
  if (!fs.existsSync(vecPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(vecPath, 'utf8')) as VectorCollection;
  } catch {
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export async function similaritySearch(params: {
  documentId: string;
  query: string;
  topK?: number;
}): Promise<{
  collectionName: string;
  totalChunks: number;
  results: RetrievedChunk[];
  latencyMs: number;
}> {
  const start = Date.now();
  const collection = loadVectorCollection(params.documentId);
  if (!collection || collection.records.length === 0) {
    throw new Error(`No vector collection found for document "${params.documentId}".`);
  }

  const queryVector = await embedQuery(params.query);
  const scored: RetrievedChunk[] = collection.records.map((rec) => ({
    id: rec.id,
    documentId: rec.documentId,
    chunkIndex: rec.chunkIndex,
    pageNumber: rec.pageNumber,
    sectionHint: rec.sectionHint,
    text: rec.text,
    score: Number(cosineSimilarity(queryVector, rec.embedding).toFixed(4)),
  }));

  scored.sort((a, b) => b.score - a.score);
  const topK = Math.max(1, Math.min(20, params.topK ?? 5));

  return {
    collectionName: collection.collectionName,
    totalChunks: collection.records.length,
    results: scored.slice(0, topK),
    latencyMs: Date.now() - start,
  };
}

export async function inspectRagCollection(params: {
  documentId: string;
  query?: string;
  topK?: number;
}): Promise<RagInspectionResult> {
  const collection = loadVectorCollection(params.documentId);
  if (!collection) {
    return {
      collectionName: `paperwise_doc_${params.documentId}`,
      documentId: params.documentId,
      totalChunks: 0,
      embeddingModel: EMBEDDING_MODEL,
      query: params.query ?? '',
      topK: params.topK ?? 5,
      retrievalStatus: 'empty',
      processingTimeMs: 0,
      retrievedChunks: [],
    };
  }

  if (!params.query || !params.query.trim()) {
    return {
      collectionName: collection.collectionName,
      documentId: collection.documentId,
      totalChunks: collection.records.length,
      embeddingModel: collection.embeddingModel,
      query: '',
      topK: params.topK ?? 5,
      retrievalStatus: 'success',
      processingTimeMs: 1,
      retrievedChunks: collection.records.slice(0, params.topK ?? 5).map((r) => ({
        id: r.id,
        documentId: r.documentId,
        chunkIndex: r.chunkIndex,
        pageNumber: r.pageNumber,
        sectionHint: r.sectionHint,
        text: r.text,
        score: 1,
      })),
    };
  }

  const search = await similaritySearch({
    documentId: params.documentId,
    query: params.query,
    topK: params.topK ?? 5,
  });

  return {
    collectionName: search.collectionName,
    documentId: params.documentId,
    totalChunks: search.totalChunks,
    embeddingModel: collection.embeddingModel,
    query: params.query,
    topK: params.topK ?? 5,
    retrievalStatus: search.results.length > 0 ? 'success' : 'empty',
    processingTimeMs: search.latencyMs,
    retrievedChunks: search.results,
  };
}
