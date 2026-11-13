import { AlertCircle, Menu, Upload, X } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { NAV_ITEMS, type NavTabId, Sidebar } from './components/Sidebar.tsx';
import { AgentMonitorPage } from './pages/AgentMonitorPage.tsx';
import { ChatPage } from './pages/ChatPage.tsx';
import { ConceptsPage } from './pages/ConceptsPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { PromptEngineeringPage } from './pages/PromptEngineeringPage.tsx';
import { RagInspectorPage } from './pages/RagInspectorPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { SlidesPage } from './pages/SlidesPage.tsx';
import { SummaryPage } from './pages/SummaryPage.tsx';
import { UploadPage } from './pages/UploadPage.tsx';
import { VivaPracticePage } from './pages/VivaPracticePage.tsx';
import { VivaPrepPage } from './pages/VivaPrepPage.tsx';
import {
  deletePaper,
  fetchPaperWorkspace,
  fetchSettings,
  listPapers,
  loadSamplePaper,
  routeNaturalLanguageTask,
  runEvaluateViva,
  runExtractConcepts,
  runGenerateSlides,
  runGenerateViva,
  runSummarize,
  sendPaperChat,
  updateSettings,
  uploadPaperPdf,
} from './services/api.ts';
import type {
  DocumentMetadata,
  PaperWorkspace,
  SlideThemeId,
  WorkspaceSettings,
} from './types/paperwise.ts';

const DEFAULT_SETTINGS: WorkspaceSettings = {
  chunkSize: 900,
  chunkOverlap: 150,
  topK: 5,
  defaultSlideCount: 10,
  defaultSlideTheme: 'oxford-navy',
  activeModel: 'gemini-4-hydrogen',
  embeddingModel: 'gemini-embedding-2',
};

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);

  const [papers, setPapers] = useState<DocumentMetadata[]>([]);
  const [workspace, setWorkspace] = useState<PaperWorkspace | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_SETTINGS);

  const [loadingSample, setLoadingSample] = useState(false);
  const [runningAgent, setRunningAgent] = useState<string | null>(null);
  const [routingTask, setRoutingTask] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [evaluatingViva, setEvaluatingViva] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const refreshPaperList = useCallback(async (selectId?: string) => {
    const res = await listPapers();
    setPapers(res.papers);
    const targetId = selectId ?? res.papers[0]?.id;
    if (targetId) {
      const ws = await fetchPaperWorkspace(targetId);
      setWorkspace(ws);
    } else {
      setWorkspace(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [s] = await Promise.all([fetchSettings(), refreshPaperList()]);
        setSettings(s);
      } catch (err) {
        setGlobalError(
          err instanceof Error ? err.message : 'Unable to connect to Paperwise AI backend.'
        );
      }
    })();
  }, [refreshPaperList]);

  const handleLoadSample = async () => {
    setGlobalError(null);
    setLoadingSample(true);
    try {
      const ws = await loadSamplePaper();
      setWorkspace(ws);
      await refreshPaperList(ws.metadata.id);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load sample paper.');
    } finally {
      setLoadingSample(false);
    }
  };

  const handleUploadFile = async (file: File, onProgress: (pct: number) => void) => {
    setGlobalError(null);
    const ws = await uploadPaperPdf(file, onProgress);
    setWorkspace(ws);
    await refreshPaperList(ws.metadata.id);
  };

  const handleSelectPaper = async (id: string) => {
    setGlobalError(null);
    try {
      const ws = await fetchPaperWorkspace(id);
      setWorkspace(ws);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to switch active paper.');
    }
  };

  const handleDeletePaper = async (id: string) => {
    setGlobalError(null);
    try {
      await deletePaper(id);
      const nextId = workspace?.metadata.id === id ? undefined : workspace?.metadata.id;
      await refreshPaperList(nextId);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to delete paper.');
    }
  };

  const handleSummarize = async () => {
    if (!workspace) return;
    setGlobalError(null);
    setRunningAgent('summary');
    try {
      const res = await runSummarize(workspace.metadata.id);
      setWorkspace(res.workspace);
      await refreshPaperList(res.workspace.metadata.id);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Summarizer Agent failed.');
    } finally {
      setRunningAgent(null);
    }
  };

  const handleExtractConcepts = async () => {
    if (!workspace) return;
    setGlobalError(null);
    setRunningAgent('concepts');
    try {
      const res = await runExtractConcepts(workspace.metadata.id);
      setWorkspace(res.workspace);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Concept-Extractor Agent failed.');
    } finally {
      setRunningAgent(null);
    }
  };

  const handleGenerateSlides = async (options?: {
    slideCount: number;
    theme: SlideThemeId;
  }) => {
    if (!workspace) return;
    setGlobalError(null);
    setRunningAgent('slides');
    try {
      const res = await runGenerateSlides(
        workspace.metadata.id,
        options ?? {
          slideCount: settings.defaultSlideCount,
          theme: settings.defaultSlideTheme,
        }
      );
      setWorkspace(res.workspace);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Slide-Generator Agent failed.');
    } finally {
      setRunningAgent(null);
    }
  };

  const handleGenerateViva = async () => {
    if (!workspace) return;
    setGlobalError(null);
    setRunningAgent('viva');
    try {
      const res = await runGenerateViva(workspace.metadata.id, 20);
      setWorkspace(res.workspace);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Viva Agent failed.');
    } finally {
      setRunningAgent(null);
    }
  };

  const handleRunAgentFromDashboard = async (
    agent: 'summary' | 'concepts' | 'slides' | 'viva'
  ) => {
    if (agent === 'summary') await handleSummarize();
    else if (agent === 'concepts') await handleExtractConcepts();
    else if (agent === 'slides') await handleGenerateSlides();
    else if (agent === 'viva') await handleGenerateViva();
  };

  const handleEvaluateViva = async (payload: { questionId: string; userAnswer: string }) => {
    if (!workspace) return;
    setGlobalError(null);
    setEvaluatingViva(true);
    try {
      const res = await runEvaluateViva(workspace.metadata.id, payload);
      setWorkspace(res.workspace);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Viva evaluation failed.');
    } finally {
      setEvaluatingViva(false);
    }
  };

  const handleSendChat = async (message: string) => {
    if (!workspace) return;
    setGlobalError(null);
    setSendingChat(true);
    try {
      const res = await sendPaperChat(workspace.metadata.id, message);
      setWorkspace(res.workspace);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'RAG Chat request failed.');
    } finally {
      setSendingChat(false);
    }
  };

  const handleRouteTask = async (prompt: string) => {
    if (!workspace) return;
    setGlobalError(null);
    setRoutingTask(true);
    try {
      const res = await routeNaturalLanguageTask(workspace.metadata.id, prompt);
      setWorkspace(res.workspace);
      const tabMap: Record<string, NavTabId> = {
        summary: 'summary',
        concepts: 'concepts',
        slides: 'slides',
        viva: 'viva',
        practice: 'practice',
        chat: 'chat',
      };
      if (tabMap[res.targetTab]) {
        setActiveTab(tabMap[res.targetTab]);
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Intent routing failed.');
    } finally {
      setRoutingTask(false);
    }
  };

  const handleSaveSettings = async (next: Partial<WorkspaceSettings>) => {
    setGlobalError(null);
    const updated = await updateSettings(next);
    setSettings(updated);
  };

  const activeNavLabel = NAV_ITEMS.find((n) => n.id === activeTab)?.label ?? 'Dashboard';

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen bg-slate-50 text-slate-900">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
          activePaperTitle={workspace?.metadata.title}
          activePaperPages={workspace?.metadata.pageCount}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Workspace Top Bar */}
          <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
                className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-50 lg:hidden"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <span className="font-display font-semibold text-slate-900 whitespace-nowrap">
                  {activeNavLabel}
                </span>
                {workspace && (
                  <>
                    <span className="text-slate-300" aria-hidden="true">
                      /
                    </span>
                    <span className="truncate text-xs text-slate-500 max-w-[200px] sm:max-w-md">
                      {workspace.metadata.title}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {papers.length > 1 && (
                <select
                  aria-label="Switch active research paper"
                  value={workspace?.metadata.id ?? ''}
                  onChange={(e) => void handleSelectPaper(e.target.value)}
                  className="hidden sm:block max-w-[220px] rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 focus:border-blue-600 focus:outline-none"
                >
                  {papers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title.slice(0, 40)}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F172A] px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload PDF
              </button>
            </div>
          </header>

          {/* Global Error Notification */}
          {globalError && (
            <div className="mx-4 mt-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 sm:mx-6">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                <span>{globalError}</span>
              </div>
              <button
                type="button"
                onClick={() => setGlobalError(null)}
                aria-label="Dismiss error"
                className="rounded p-0.5 text-red-500 hover:bg-red-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Main Content Viewport */}
          <main className="mx-auto w-full max-w-[1280px] flex-1 p-4 sm:p-6">
            {activeTab === 'dashboard' && (
              <DashboardPage
                workspace={workspace}
                onNavigate={setActiveTab}
                onLoadSample={handleLoadSample}
                loadingSample={loadingSample}
                onRouteTask={handleRouteTask}
                routingTask={routingTask}
                onRunAgent={handleRunAgentFromDashboard}
                runningAgent={runningAgent}
              />
            )}

            {activeTab === 'upload' && (
              <UploadPage
                papers={papers}
                activeWorkspace={workspace}
                onUploadFile={handleUploadFile}
                onLoadSample={handleLoadSample}
                onSelectPaper={handleSelectPaper}
                onDeletePaper={handleDeletePaper}
              />
            )}

            {activeTab === 'summary' && (
              <SummaryPage
                workspace={workspace}
                onNavigate={setActiveTab}
                onLoadSample={handleLoadSample}
                loadingSample={loadingSample}
                onGenerate={handleSummarize}
                generating={runningAgent === 'summary'}
              />
            )}

            {activeTab === 'concepts' && (
              <ConceptsPage
                workspace={workspace}
                onNavigate={setActiveTab}
                onLoadSample={handleLoadSample}
                loadingSample={loadingSample}
                onGenerate={handleExtractConcepts}
                generating={runningAgent === 'concepts'}
              />
            )}

            {activeTab === 'slides' && (
              <SlidesPage
                workspace={workspace}
                defaultSlideCount={settings.defaultSlideCount}
                defaultTheme={settings.defaultSlideTheme}
                onNavigate={setActiveTab}
                onLoadSample={handleLoadSample}
                loadingSample={loadingSample}
                onGenerate={handleGenerateSlides}
                generating={runningAgent === 'slides'}
              />
            )}

            {activeTab === 'viva' && (
              <VivaPrepPage
                workspace={workspace}
                onNavigate={setActiveTab}
                onLoadSample={handleLoadSample}
                loadingSample={loadingSample}
                onGenerate={handleGenerateViva}
                generating={runningAgent === 'viva'}
              />
            )}

            {activeTab === 'practice' && (
              <VivaPracticePage
                workspace={workspace}
                onNavigate={setActiveTab}
                onLoadSample={handleLoadSample}
                loadingSample={loadingSample}
                onGenerateViva={handleGenerateViva}
                generatingViva={runningAgent === 'viva'}
                onEvaluateAnswer={handleEvaluateViva}
                evaluating={evaluatingViva}
              />
            )}

            {activeTab === 'chat' && (
              <ChatPage
                workspace={workspace}
                onNavigate={setActiveTab}
                onLoadSample={handleLoadSample}
                loadingSample={loadingSample}
                onSendMessage={handleSendChat}
                sending={sendingChat}
              />
            )}

            {activeTab === 'monitor' && (
              <AgentMonitorPage
                workspace={workspace}
                onNavigate={setActiveTab}
                onLoadSample={handleLoadSample}
                loadingSample={loadingSample}
                onRouteTask={handleRouteTask}
                routingTask={routingTask}
              />
            )}

            {activeTab === 'rag' && (
              <RagInspectorPage
                workspace={workspace}
                defaultTopK={settings.topK}
                onNavigate={setActiveTab}
                onLoadSample={handleLoadSample}
                loadingSample={loadingSample}
              />
            )}

            {activeTab === 'prompts' && <PromptEngineeringPage />}

            {activeTab === 'settings' && (
              <SettingsPage settings={settings} onSaveSettings={handleSaveSettings} />
            )}
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
