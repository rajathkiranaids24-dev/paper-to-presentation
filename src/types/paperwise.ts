export type AgentIntent =
  | 'SUMMARIZE_PAPER'
  | 'EXTRACT_CONCEPTS'
  | 'GENERATE_SLIDES'
  | 'GENERATE_VIVA'
  | 'ASK_PAPER_QUESTION'
  | 'EVALUATE_VIVA_ANSWER';

export type SlideThemeId = 'oxford-navy' | 'slate-academic' | 'violet-research';

export interface PageContent {
  pageNumber: number;
  text: string;
  wordCount: number;
}

export interface DocumentMetadata {
  id: string;
  filename: string;
  title: string;
  authors: string;
  pageCount: number;
  chunkCount: number;
  wordCount: number;
  fileSizeBytes: number;
  uploadedAt: string;
  collectionName: string;
  isSample?: boolean;
  processingStatus: 'ready' | 'processing' | 'error';
  errorMessage?: string;
}

export interface StructuredSummary {
  title: string;
  authors: string;
  abstractSummary: string;
  introductionSummary: string;
  problemStatement: string;
  objectives: string[];
  methodology: string;
  results: string;
  conclusion: string;
  keyTakeaways: string[];
  simpleExplanations: Array<{
    term: string;
    explanation: string;
  }>;
  sectionPages: Array<{
    section: string;
    pageRange: string;
  }>;
  generatedAt: string;
}

export interface ExtractedConcepts {
  importantConcepts: Array<{
    name: string;
    definition: string;
    simpleExplanation: string;
    pageReference: string;
  }>;
  algorithmsAndMethods: Array<{
    name: string;
    purpose: string;
    workflow: string;
    pageReference: string;
  }>;
  researchContributions: string[];
  importantFindings: string[];
  limitations: string[];
  futureScope: string[];
  technicalGlossary: Array<{
    term: string;
    meaning: string;
  }>;
  generatedAt: string;
}

export interface SlideChartDataPoint {
  label: string;
  value: number;
  unit?: string;
}

export interface SlideItem {
  slideNumber: number;
  sectionType: string;
  title: string;
  subtitle?: string;
  bullets: string[];
  speakerNotes: string;
  visualSuggestion: string;
  diagramNodes?: string[];
  chartData?: SlideChartDataPoint[];
  pageReferences: string;
}

export interface PresentationDeck {
  theme: SlideThemeId;
  slideCount: number;
  paperTitle: string;
  sourceInfo: string;
  slides: SlideItem[];
  generatedAt: string;
}

export type VivaCategory =
  | 'Basic'
  | 'Conceptual'
  | 'Technical'
  | 'Methodology'
  | 'Results-based'
  | 'Challenging Examiner';

export type VivaDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface VivaQuestion {
  id: string;
  category: VivaCategory;
  difficulty: VivaDifficulty;
  question: string;
  modelAnswer: string;
  beginnerExplanation: string;
  pageReference: string;
}

export interface VivaQuestionBank {
  totalCount: number;
  questions: VivaQuestion[];
  generatedAt: string;
}

export interface VivaEvaluation {
  questionId: string;
  question: string;
  userAnswer: string;
  score: number;
  maxScore: number;
  verdict: string;
  strengths: string[];
  weaknesses: string[];
  missingKeyPoints: string[];
  improvedModelAnswer: string;
  pageReferences: string[];
  evaluatedAt: string;
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  pageNumber: number;
  sectionHint: string;
  text: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  detectedIntent?: AgentIntent;
  selectedAgent?: string;
  retrievalUsed?: boolean;
  retrievedChunks?: RetrievedChunk[];
  pageReferences?: number[];
  processingTimeMs?: number;
}

export interface AgentExecutionLog {
  id: string;
  timestamp: string;
  documentId: string;
  detectedIntent: AgentIntent;
  intentConfidence: number;
  intentReasoning: string;
  selectedAgent: string;
  status: 'completed' | 'running' | 'failed';
  inputSummary: string;
  outputSummary: string;
  processingTimeMs: number;
  selectedTools: string[];
  lcelPipeline: string;
  ragUsed: boolean;
  retrievedChunksCount: number;
  error?: string;
}

export interface PromptEngineeringSpec {
  id: string;
  agentName: string;
  technique: string;
  lcelExpression: string;
  systemPrompt: string;
  userPromptTemplate: string;
  inputVariables: string[];
  outputSchemaName: string;
  fewShotExamples?: Array<{ input: string; output: string }>;
  reflectionRule?: string;
}

export interface WorkspaceSettings {
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  defaultSlideCount: number;
  defaultSlideTheme: SlideThemeId;
  activeModel: string;
  embeddingModel: string;
}

export interface PaperWorkspace {
  metadata: DocumentMetadata;
  pages: PageContent[];
  summary: StructuredSummary | null;
  concepts: ExtractedConcepts | null;
  presentation: PresentationDeck | null;
  viva: VivaQuestionBank | null;
  chatHistory: ChatMessage[];
  evaluations: VivaEvaluation[];
  activityLogs: AgentExecutionLog[];
}

export interface RagInspectionResult {
  collectionName: string;
  documentId: string;
  totalChunks: number;
  embeddingModel: string;
  query: string;
  topK: number;
  retrievalStatus: 'success' | 'empty' | 'error';
  processingTimeMs: number;
  retrievedChunks: RetrievedChunk[];
}
