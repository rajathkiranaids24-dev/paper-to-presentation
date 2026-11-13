import crypto from 'crypto';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { runRagChatAgent } from './server/agents/chatAgent.ts';
import { runConceptExtractorAgent } from './server/agents/conceptAgent.ts';
import { runSlideGeneratorAgent } from './server/agents/slideAgent.ts';
import { runSummarizerAgent } from './server/agents/summarizerAgent.ts';
import { runVivaEvaluatorAgent, runVivaGeneratorAgent } from './server/agents/vivaAgent.ts';
import { CHAT_MODEL, EMBEDDING_MODEL } from './server/gemini.ts';
import { PROMPT_SPECS } from './server/prompts/templates.ts';
import {
  appendActivityLog,
  deleteWorkspace,
  indexDocumentChunks,
  inspectRagCollection,
  listWorkspaces,
  loadSettings,
  loadWorkspace,
  saveSettings,
  saveWorkspace,
} from './server/rag/vectorStore.ts';
import { buildSummaryDocxBuffer, buildVivaDocxBuffer } from './server/services/docxGenerator.ts';
import { detectIntent } from './server/services/intentRouter.ts';
import { chunkPages, extractPdfPages, MAX_PDF_BYTES } from './server/services/pdfProcessor.ts';
import { buildPptxBuffer } from './server/services/pptxGenerator.ts';
import type {
  AgentExecutionLog,
  ChatMessage,
  PaperWorkspace,
  SlideThemeId,
} from './src/types/paperwise.ts';

dotenv.config();

const PORT = 3000;
const app = express();
app.use(express.json({ limit: '4mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES },
});

function createLogId(): string {
  return `log_${crypto.randomBytes(5).toString('hex')}`;
}

async function ingestPdfBuffer(params: {
  buffer: Buffer;
  filename: string;
  isSample?: boolean;
}): Promise<PaperWorkspace> {
  const start = Date.now();
  const settings = loadSettings();
  const parsed = await extractPdfPages(params.buffer, params.filename);

  const documentId = `doc_${crypto.randomBytes(6).toString('hex')}`;
  const collectionName = `paperwise_collection_${documentId}`;

  const chunks = chunkPages({
    documentId,
    pages: parsed.pages,
    chunkSize: settings.chunkSize,
    chunkOverlap: settings.chunkOverlap,
  });

  await indexDocumentChunks({
    documentId,
    collectionName,
    chunks,
  });

  const initialLog: AgentExecutionLog = {
    id: createLogId(),
    timestamp: new Date().toISOString(),
    documentId,
    detectedIntent: 'SUMMARIZE_PAPER',
    intentConfidence: 1.0,
    intentReasoning: 'Document ingestion, page extraction, chunking, and vector embedding pipeline.',
    selectedAgent: 'Ingestion & Vector Indexer',
    status: 'completed',
    inputSummary: `${params.filename} (${parsed.pageCount} pages, ${parsed.wordCount} words)`,
    outputSummary: `Indexed ${chunks.length} chunks into collection ${collectionName} using ${EMBEDDING_MODEL}`,
    processingTimeMs: Date.now() - start,
    selectedTools: ['PDFPageExtractor', 'RecursiveChunker', `GeminiEmbedder(${EMBEDDING_MODEL})`, 'VectorStore'],
    lcelPipeline: 'PDFBytes -> PageExtractor -> Chunker -> VectorCollection',
    ragUsed: true,
    retrievedChunksCount: chunks.length,
  };

  const workspace: PaperWorkspace = {
    metadata: {
      id: documentId,
      filename: params.filename,
      title: parsed.title,
      authors: parsed.authors,
      pageCount: parsed.pageCount,
      chunkCount: chunks.length,
      wordCount: parsed.wordCount,
      fileSizeBytes: params.buffer.length,
      uploadedAt: new Date().toISOString(),
      collectionName,
      isSample: params.isSample ?? false,
      processingStatus: 'ready',
    },
    pages: parsed.pages,
    summary: null,
    concepts: null,
    presentation: null,
    viva: null,
    chatHistory: [],
    evaluations: [],
    activityLogs: [initialLog],
  };

  saveWorkspace(workspace);
  return workspace;
}

// Health & runtime status
app.get('/api/health', (_req, res) => {
  const hasKey = Boolean(
    process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );
  res.json({
    ok: true,
    runtime: 'Node.js Express + TypeScript LCEL + @google/genai',
    chatModel: CHAT_MODEL,
    embeddingModel: EMBEDDING_MODEL,
    geminiConfigured: hasKey,
    pythonBackendIncluded: fs.existsSync(path.resolve(process.cwd(), 'backend/main.py')),
  });
});

// Settings
app.get('/api/settings', (_req, res) => {
  res.json(loadSettings());
});

app.put('/api/settings', (req, res) => {
  const body = req.body ?? {};
  const updated = saveSettings({
    chunkSize: typeof body.chunkSize === 'number' ? body.chunkSize : undefined,
    chunkOverlap: typeof body.chunkOverlap === 'number' ? body.chunkOverlap : undefined,
    topK: typeof body.topK === 'number' ? body.topK : undefined,
    defaultSlideCount: typeof body.defaultSlideCount === 'number' ? body.defaultSlideCount : undefined,
    defaultSlideTheme: body.defaultSlideTheme,
  });
  res.json(updated);
});

// Prompt Engineering Registry
app.get('/api/prompts', (_req, res) => {
  res.json({ prompts: PROMPT_SPECS });
});

// Workspaces list / get / delete
app.get('/api/papers', (_req, res) => {
  const all = listWorkspaces().map((w) => w.metadata);
  res.json({ papers: all });
});

app.get('/api/papers/:id', (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Research paper workspace not found.' });
    return;
  }
  res.json(ws);
});

app.delete('/api/papers/:id', (req, res) => {
  deleteWorkspace(req.params.id);
  res.json({ deleted: true });
});

// Upload PDF
app.post('/api/papers/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No PDF file provided in upload request.' });
      return;
    }
    const workspace = await ingestPdfBuffer({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      isSample: false,
    });
    res.json(workspace);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'PDF upload failed.';
    res.status(400).json({ error: msg });
  }
});

// Load built-in sample PDF through the exact real ingestion + embedding pipeline
app.post('/api/papers/load-sample', async (_req, res) => {
  try {
    const samplePath = path.resolve(
      process.cwd(),
      'sample_papers/adaptive_rag_academic_survey.pdf'
    );
    if (!fs.existsSync(samplePath)) {
      res.status(404).json({ error: 'Sample research paper PDF not found on disk.' });
      return;
    }
    const buffer = fs.readFileSync(samplePath);
    const workspace = await ingestPdfBuffer({
      buffer,
      filename: 'adaptive_rag_academic_survey.pdf',
      isSample: true,
    });
    res.json(workspace);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load sample paper.';
    res.status(500).json({ error: msg });
  }
});

// Agent 1: Summarizer Agent
app.post('/api/papers/:id/summarize', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Paper not found.' });
    return;
  }
  try {
    const result = await runSummarizerAgent({
      filename: ws.metadata.filename,
      pageCount: ws.metadata.pageCount,
      pages: ws.pages,
    });

    ws.summary = result.summary;
    if (result.summary.title && result.summary.title.length > 5) {
      ws.metadata.title = result.summary.title;
    }
    if (result.summary.authors && result.summary.authors.length > 3) {
      ws.metadata.authors = result.summary.authors;
    }
    saveWorkspace(ws);

    const updated = appendActivityLog(ws.metadata.id, {
      id: createLogId(),
      timestamp: new Date().toISOString(),
      documentId: ws.metadata.id,
      detectedIntent: 'SUMMARIZE_PAPER',
      intentConfidence: 1.0,
      intentReasoning: 'Direct or routed request for structured research paper summarization.',
      selectedAgent: 'Summarizer Agent',
      status: 'completed',
      inputSummary: `${ws.metadata.title} (${ws.metadata.pageCount} pages)`,
      outputSummary: `Generated structured summary with ${result.summary.objectives.length} objectives, ${result.summary.keyTakeaways.length} takeaways, and ${result.summary.simpleExplanations.length} plain-language explanations.`,
      processingTimeMs: result.latencyMs,
      selectedTools: ['PageTextFormatter', 'GeminiChatModel', 'StructuredSummaryParser'],
      lcelPipeline: result.lcelPipeline,
      ragUsed: false,
      retrievedChunksCount: 0,
    });

    res.json({ summary: result.summary, workspace: updated ?? ws });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Summarizer Agent failed.';
    appendActivityLog(ws.metadata.id, {
      id: createLogId(),
      timestamp: new Date().toISOString(),
      documentId: ws.metadata.id,
      detectedIntent: 'SUMMARIZE_PAPER',
      intentConfidence: 1.0,
      intentReasoning: 'Summarization requested.',
      selectedAgent: 'Summarizer Agent',
      status: 'failed',
      inputSummary: ws.metadata.title,
      outputSummary: msg,
      processingTimeMs: 0,
      selectedTools: ['GeminiChatModel'],
      lcelPipeline: 'SummarizerAgentChain',
      ragUsed: false,
      retrievedChunksCount: 0,
      error: msg,
    });
    res.status(500).json({ error: msg });
  }
});

// Agent 2: Concept-Extractor Agent
app.post('/api/papers/:id/concepts', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Paper not found.' });
    return;
  }
  try {
    const result = await runConceptExtractorAgent({
      title: ws.metadata.title,
      pageCount: ws.metadata.pageCount,
      pages: ws.pages,
    });

    ws.concepts = result.concepts;
    saveWorkspace(ws);

    const updated = appendActivityLog(ws.metadata.id, {
      id: createLogId(),
      timestamp: new Date().toISOString(),
      documentId: ws.metadata.id,
      detectedIntent: 'EXTRACT_CONCEPTS',
      intentConfidence: 1.0,
      intentReasoning: 'Concept, algorithm, contribution, and glossary extraction.',
      selectedAgent: 'Concept-Extractor Agent',
      status: 'completed',
      inputSummary: `${ws.metadata.title} (${ws.metadata.pageCount} pages)`,
      outputSummary: `Extracted ${result.concepts.importantConcepts.length} concepts, ${result.concepts.algorithmsAndMethods.length} algorithms, and ${result.concepts.technicalGlossary.length} glossary terms.`,
      processingTimeMs: result.latencyMs,
      selectedTools: ['PageTextFormatter', 'GeminiChatModel', 'StructuredConceptsParser'],
      lcelPipeline: result.lcelPipeline,
      ragUsed: false,
      retrievedChunksCount: 0,
    });

    res.json({ concepts: result.concepts, workspace: updated ?? ws });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Concept-Extractor Agent failed.';
    res.status(500).json({ error: msg });
  }
});

// Agent 3: Slide-Generator Agent
app.post('/api/papers/:id/slides', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Paper not found.' });
    return;
  }
  try {
    const settings = loadSettings();
    const slideCount = Number(req.body?.slideCount ?? settings.defaultSlideCount ?? 10);
    const theme = (req.body?.theme ?? settings.defaultSlideTheme ?? 'oxford-navy') as SlideThemeId;

    const result = await runSlideGeneratorAgent({
      title: ws.metadata.title,
      authors: ws.metadata.authors,
      pageCount: ws.metadata.pageCount,
      pages: ws.pages,
      slideCount,
      theme,
    });

    ws.presentation = result.deck;
    saveWorkspace(ws);

    const updated = appendActivityLog(ws.metadata.id, {
      id: createLogId(),
      timestamp: new Date().toISOString(),
      documentId: ws.metadata.id,
      detectedIntent: 'GENERATE_SLIDES',
      intentConfidence: 1.0,
      intentReasoning: `Presentation deck generation (${result.deck.slideCount} slides, ${theme} theme).`,
      selectedAgent: 'Slide-Generator Agent',
      status: 'completed',
      inputSummary: `${ws.metadata.title} · Requested ${slideCount} slides (${theme})`,
      outputSummary: `Generated ${result.deck.slideCount} 16:9 slides with speaker notes and visual layouts.`,
      processingTimeMs: result.latencyMs,
      selectedTools: ['GeminiChatModel', 'StructuredSlideDeckParser', 'PptxGenJSCompiler'],
      lcelPipeline: result.lcelPipeline,
      ragUsed: false,
      retrievedChunksCount: 0,
    });

    res.json({ presentation: result.deck, workspace: updated ?? ws });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Slide-Generator Agent failed.';
    res.status(500).json({ error: msg });
  }
});

// Agent 4: Viva Question Generator
app.post('/api/papers/:id/viva', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Paper not found.' });
    return;
  }
  try {
    const minQuestions = Number(req.body?.minQuestions ?? 20);
    const result = await runVivaGeneratorAgent({
      title: ws.metadata.title,
      pageCount: ws.metadata.pageCount,
      pages: ws.pages,
      minQuestions,
    });

    ws.viva = result.viva;
    saveWorkspace(ws);

    const updated = appendActivityLog(ws.metadata.id, {
      id: createLogId(),
      timestamp: new Date().toISOString(),
      documentId: ws.metadata.id,
      detectedIntent: 'GENERATE_VIVA',
      intentConfidence: 1.0,
      intentReasoning: 'Examiner viva voce question & answer synthesis across 6 categories.',
      selectedAgent: 'Viva Agent',
      status: 'completed',
      inputSummary: `${ws.metadata.title} (${ws.metadata.pageCount} pages)`,
      outputSummary: `Generated ${result.viva.totalCount} categorized viva questions with model answers and beginner explanations.`,
      processingTimeMs: result.latencyMs,
      selectedTools: ['GeminiChatModel', 'StructuredVivaParser'],
      lcelPipeline: result.lcelPipeline,
      ragUsed: false,
      retrievedChunksCount: 0,
    });

    res.json({ viva: result.viva, workspace: updated ?? ws });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Viva Agent failed.';
    res.status(500).json({ error: msg });
  }
});

// Agent 4b: Viva Answer Evaluation
app.post('/api/papers/:id/viva/evaluate', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Paper not found.' });
    return;
  }
  const { questionId, userAnswer } = req.body ?? {};
  if (!questionId || typeof userAnswer !== 'string' || !userAnswer.trim()) {
    res.status(400).json({ error: 'questionId and non-empty userAnswer are required.' });
    return;
  }
  const question = ws.viva?.questions.find((q) => q.id === questionId);
  if (!question) {
    res.status(404).json({ error: 'Selected viva question not found.' });
    return;
  }

  try {
    const settings = loadSettings();
    const result = await runVivaEvaluatorAgent({
      documentId: ws.metadata.id,
      question,
      userAnswer: userAnswer.trim(),
      topK: settings.topK,
    });

    ws.evaluations = [
      result.evaluation,
      ...ws.evaluations.filter((e) => e.questionId !== question.id),
    ];
    saveWorkspace(ws);

    const updated = appendActivityLog(ws.metadata.id, {
      id: createLogId(),
      timestamp: new Date().toISOString(),
      documentId: ws.metadata.id,
      detectedIntent: 'EVALUATE_VIVA_ANSWER',
      intentConfidence: 0.99,
      intentReasoning: 'Student submitted viva practice response for RAG-verified rubric grading.',
      selectedAgent: 'Viva Agent',
      status: 'completed',
      inputSummary: `Q: "${question.question.slice(0, 75)}..." | Answer length: ${userAnswer.trim().length} chars`,
      outputSummary: `Scored ${result.evaluation.score}/10 (${result.evaluation.verdict}) using ${result.retrievedChunksCount} retrieved chunks.`,
      processingTimeMs: result.latencyMs,
      selectedTools: ['VectorSimilarityRetriever', 'GeminiChatModel', 'VivaRubricParser'],
      lcelPipeline: result.lcelPipeline,
      ragUsed: true,
      retrievedChunksCount: result.retrievedChunksCount,
    });

    res.json({ evaluation: result.evaluation, workspace: updated ?? ws });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Viva evaluation failed.';
    res.status(500).json({ error: msg });
  }
});

// Agentic RAG Chat
app.post('/api/papers/:id/chat', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Paper not found.' });
    return;
  }
  const userMessage = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!userMessage) {
    res.status(400).json({ error: 'Chat message cannot be empty.' });
    return;
  }

  try {
    const settings = loadSettings();
    const intentResult = await detectIntent(userMessage);

    const chatResult = await runRagChatAgent({
      documentId: ws.metadata.id,
      title: ws.metadata.title,
      authors: ws.metadata.authors,
      pageCount: ws.metadata.pageCount,
      userQuestion: userMessage,
      chatHistory: ws.chatHistory,
      topK: settings.topK,
    });

    const userEntry: ChatMessage = {
      id: `msg_${crypto.randomBytes(4).toString('hex')}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };

    const assistantEntry: ChatMessage = {
      id: `msg_${crypto.randomBytes(4).toString('hex')}`,
      role: 'assistant',
      content: chatResult.answer,
      timestamp: new Date().toISOString(),
      detectedIntent: intentResult.intent,
      selectedAgent: 'RAG Chat Agent',
      retrievalUsed: chatResult.retrievalUsed,
      retrievedChunks: chatResult.retrievedChunks,
      pageReferences: chatResult.pageReferences,
      processingTimeMs: chatResult.latencyMs + intentResult.latencyMs,
    };

    ws.chatHistory = [...ws.chatHistory, userEntry, assistantEntry];
    saveWorkspace(ws);

    const updated = appendActivityLog(ws.metadata.id, {
      id: createLogId(),
      timestamp: new Date().toISOString(),
      documentId: ws.metadata.id,
      detectedIntent: intentResult.intent,
      intentConfidence: intentResult.confidence,
      intentReasoning: intentResult.reasoning,
      selectedAgent: 'RAG Chat Agent',
      status: 'completed',
      inputSummary: userMessage.slice(0, 120),
      outputSummary: chatResult.retrievalUsed
        ? `Retrieved ${chatResult.retrievedChunks.length} chunks (Pages: ${chatResult.pageReferences.join(', ') || 'none'}) and synthesized grounded response.`
        : 'Answered directly from paper metadata without vector search.',
      processingTimeMs: chatResult.latencyMs + intentResult.latencyMs,
      selectedTools: chatResult.retrievalUsed
        ? ['IntentRouter', `VectorRetriever(top_k=${settings.topK})`, 'ReActGroundingChain']
        : ['IntentRouter', 'MetadataLookup', 'ReActGroundingChain'],
      lcelPipeline: chatResult.lcelPipeline,
      ragUsed: chatResult.retrievalUsed,
      retrievedChunksCount: chatResult.retrievedChunks.length,
    });

    res.json({
      userMessage: userEntry,
      assistantMessage: assistantEntry,
      workspace: updated ?? ws,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'RAG Chat Agent failed.';
    res.status(500).json({ error: msg });
  }
});

// Natural-Language Intent Router & Auto-Dispatch
app.post('/api/papers/:id/route', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Paper not found.' });
    return;
  }
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) {
    res.status(400).json({ error: 'Task prompt is required for intent routing.' });
    return;
  }

  try {
    const settings = loadSettings();
    const classification = await detectIntent(prompt);

    if (classification.intent === 'SUMMARIZE_PAPER') {
      const result = await runSummarizerAgent({
        filename: ws.metadata.filename,
        pageCount: ws.metadata.pageCount,
        pages: ws.pages,
      });
      ws.summary = result.summary;
      saveWorkspace(ws);
      const updated = appendActivityLog(ws.metadata.id, {
        id: createLogId(),
        timestamp: new Date().toISOString(),
        documentId: ws.metadata.id,
        detectedIntent: classification.intent,
        intentConfidence: classification.confidence,
        intentReasoning: classification.reasoning,
        selectedAgent: 'Summarizer Agent',
        status: 'completed',
        inputSummary: prompt,
        outputSummary: 'Routed to Summarizer Agent and generated structured summary.',
        processingTimeMs: classification.latencyMs + result.latencyMs,
        selectedTools: ['IntentRouter', 'GeminiChatModel', 'StructuredSummaryParser'],
        lcelPipeline: `${classification.lcelPipeline} -> ${result.lcelPipeline}`,
        ragUsed: false,
        retrievedChunksCount: 0,
      });
      res.json({ classification, targetTab: 'summary', workspace: updated ?? ws });
      return;
    }

    if (classification.intent === 'EXTRACT_CONCEPTS') {
      const result = await runConceptExtractorAgent({
        title: ws.metadata.title,
        pageCount: ws.metadata.pageCount,
        pages: ws.pages,
      });
      ws.concepts = result.concepts;
      saveWorkspace(ws);
      const updated = appendActivityLog(ws.metadata.id, {
        id: createLogId(),
        timestamp: new Date().toISOString(),
        documentId: ws.metadata.id,
        detectedIntent: classification.intent,
        intentConfidence: classification.confidence,
        intentReasoning: classification.reasoning,
        selectedAgent: 'Concept-Extractor Agent',
        status: 'completed',
        inputSummary: prompt,
        outputSummary: `Routed to Concept-Extractor Agent (${result.concepts.importantConcepts.length} concepts).`,
        processingTimeMs: classification.latencyMs + result.latencyMs,
        selectedTools: ['IntentRouter', 'GeminiChatModel', 'StructuredConceptsParser'],
        lcelPipeline: `${classification.lcelPipeline} -> ${result.lcelPipeline}`,
        ragUsed: false,
        retrievedChunksCount: 0,
      });
      res.json({ classification, targetTab: 'concepts', workspace: updated ?? ws });
      return;
    }

    if (classification.intent === 'GENERATE_SLIDES') {
      const result = await runSlideGeneratorAgent({
        title: ws.metadata.title,
        authors: ws.metadata.authors,
        pageCount: ws.metadata.pageCount,
        pages: ws.pages,
        slideCount: settings.defaultSlideCount,
        theme: settings.defaultSlideTheme,
      });
      ws.presentation = result.deck;
      saveWorkspace(ws);
      const updated = appendActivityLog(ws.metadata.id, {
        id: createLogId(),
        timestamp: new Date().toISOString(),
        documentId: ws.metadata.id,
        detectedIntent: classification.intent,
        intentConfidence: classification.confidence,
        intentReasoning: classification.reasoning,
        selectedAgent: 'Slide-Generator Agent',
        status: 'completed',
        inputSummary: prompt,
        outputSummary: `Routed to Slide-Generator Agent (${result.deck.slideCount} slides).`,
        processingTimeMs: classification.latencyMs + result.latencyMs,
        selectedTools: ['IntentRouter', 'GeminiChatModel', 'StructuredSlideDeckParser'],
        lcelPipeline: `${classification.lcelPipeline} -> ${result.lcelPipeline}`,
        ragUsed: false,
        retrievedChunksCount: 0,
      });
      res.json({ classification, targetTab: 'slides', workspace: updated ?? ws });
      return;
    }

    if (classification.intent === 'GENERATE_VIVA') {
      const result = await runVivaGeneratorAgent({
        title: ws.metadata.title,
        pageCount: ws.metadata.pageCount,
        pages: ws.pages,
        minQuestions: 20,
      });
      ws.viva = result.viva;
      saveWorkspace(ws);
      const updated = appendActivityLog(ws.metadata.id, {
        id: createLogId(),
        timestamp: new Date().toISOString(),
        documentId: ws.metadata.id,
        detectedIntent: classification.intent,
        intentConfidence: classification.confidence,
        intentReasoning: classification.reasoning,
        selectedAgent: 'Viva Agent',
        status: 'completed',
        inputSummary: prompt,
        outputSummary: `Routed to Viva Agent (${result.viva.totalCount} questions).`,
        processingTimeMs: classification.latencyMs + result.latencyMs,
        selectedTools: ['IntentRouter', 'GeminiChatModel', 'StructuredVivaParser'],
        lcelPipeline: `${classification.lcelPipeline} -> ${result.lcelPipeline}`,
        ragUsed: false,
        retrievedChunksCount: 0,
      });
      res.json({ classification, targetTab: 'viva', workspace: updated ?? ws });
      return;
    }

    if (classification.intent === 'EVALUATE_VIVA_ANSWER') {
      res.json({
        classification,
        targetTab: 'practice',
        workspace: ws,
      });
      return;
    }

    // Default: ASK_PAPER_QUESTION -> RAG Chat Agent
    const chatResult = await runRagChatAgent({
      documentId: ws.metadata.id,
      title: ws.metadata.title,
      authors: ws.metadata.authors,
      pageCount: ws.metadata.pageCount,
      userQuestion: prompt,
      chatHistory: ws.chatHistory,
      topK: settings.topK,
    });

    const userMsg: ChatMessage = {
      id: `msg_${crypto.randomBytes(4).toString('hex')}`,
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
    };
    const assistantMsg: ChatMessage = {
      id: `msg_${crypto.randomBytes(4).toString('hex')}`,
      role: 'assistant',
      content: chatResult.answer,
      timestamp: new Date().toISOString(),
      detectedIntent: classification.intent,
      selectedAgent: 'RAG Chat Agent',
      retrievalUsed: chatResult.retrievalUsed,
      retrievedChunks: chatResult.retrievedChunks,
      pageReferences: chatResult.pageReferences,
      processingTimeMs: chatResult.latencyMs + classification.latencyMs,
    };
    ws.chatHistory = [...ws.chatHistory, userMsg, assistantMsg];
    saveWorkspace(ws);

    const updated = appendActivityLog(ws.metadata.id, {
      id: createLogId(),
      timestamp: new Date().toISOString(),
      documentId: ws.metadata.id,
      detectedIntent: classification.intent,
      intentConfidence: classification.confidence,
      intentReasoning: classification.reasoning,
      selectedAgent: 'RAG Chat Agent',
      status: 'completed',
      inputSummary: prompt,
      outputSummary: `Retrieved ${chatResult.retrievedChunks.length} chunks and answered via RAG Chat Agent.`,
      processingTimeMs: classification.latencyMs + chatResult.latencyMs,
      selectedTools: ['IntentRouter', 'VectorRetriever', 'ReActGroundingChain'],
      lcelPipeline: `${classification.lcelPipeline} -> ${chatResult.lcelPipeline}`,
      ragUsed: chatResult.retrievalUsed,
      retrievedChunksCount: chatResult.retrievedChunks.length,
    });

    res.json({ classification, targetTab: 'chat', workspace: updated ?? ws });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Intent routing failed.';
    res.status(500).json({ error: msg });
  }
});

// RAG Inspector
app.get('/api/papers/:id/rag-inspect', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws) {
    res.status(404).json({ error: 'Paper not found.' });
    return;
  }
  try {
    const query = typeof req.query.query === 'string' ? req.query.query : '';
    const settings = loadSettings();
    const topK = req.query.topK ? Number(req.query.topK) : settings.topK;
    const inspection = await inspectRagCollection({
      documentId: ws.metadata.id,
      query,
      topK,
    });
    res.json(inspection);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'RAG inspection failed.';
    res.status(500).json({ error: msg });
  }
});

// Download .pptx
app.get('/api/papers/:id/download/pptx', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws || !ws.presentation) {
    res.status(404).json({ error: 'Generated presentation deck not found for this paper.' });
    return;
  }
  try {
    const buffer = await buildPptxBuffer(ws.presentation);
    const safeName = ws.metadata.filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_paperwise_slides.pptx"`);
    res.send(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to compile PowerPoint file.';
    res.status(500).json({ error: msg });
  }
});

// Download summary .docx
app.get('/api/papers/:id/download/summary-docx', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws || !ws.summary) {
    res.status(404).json({ error: 'Generated summary not found for this paper.' });
    return;
  }
  try {
    const buffer = await buildSummaryDocxBuffer(ws.summary);
    const safeName = ws.metadata.filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_summary.docx"`);
    res.send(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to build DOCX summary.';
    res.status(500).json({ error: msg });
  }
});

// Download viva .docx
app.get('/api/papers/:id/download/viva-docx', async (req, res) => {
  const ws = loadWorkspace(req.params.id);
  if (!ws || !ws.viva) {
    res.status(404).json({ error: 'Generated viva question bank not found for this paper.' });
    return;
  }
  try {
    const buffer = await buildVivaDocxBuffer(ws.metadata.title, ws.viva);
    const safeName = ws.metadata.filename.replace(/\.pdf$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_viva_questions.docx"`);
    res.send(buffer);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to build DOCX viva bank.';
    res.status(500).json({ error: msg });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PAPERWISE AI full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
