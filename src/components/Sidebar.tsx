import {
  Activity,
  BookOpen,
  BrainCircuit,
  Code2,
  Database,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  Mic,
  Presentation,
  Settings,
  Upload,
  X,
} from 'lucide-react';
import React from 'react';

export type NavTabId =
  | 'dashboard'
  | 'upload'
  | 'summary'
  | 'concepts'
  | 'slides'
  | 'viva'
  | 'practice'
  | 'chat'
  | 'monitor'
  | 'rag'
  | 'prompts'
  | 'settings';

export interface NavItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'upload', label: 'Upload Research Paper', icon: Upload },
  { id: 'summary', label: 'AI Summary', icon: FileText },
  { id: 'concepts', label: 'Concept Extractor', icon: BrainCircuit },
  { id: 'slides', label: 'Presentation Generator', icon: Presentation },
  { id: 'viva', label: 'Viva Preparation', icon: GraduationCap },
  { id: 'practice', label: 'Viva Practice', icon: Mic },
  { id: 'chat', label: 'Research Paper Chat', icon: MessageSquare },
  { id: 'monitor', label: 'Agent Activity Monitor', icon: Activity },
  { id: 'rag', label: 'RAG Inspector', icon: Database },
  { id: 'prompts', label: 'Prompt Engineering', icon: Code2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface SidebarProps {
  activeTab: NavTabId;
  onSelectTab: (tab: NavTabId) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activePaperTitle?: string;
  activePaperPages?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
  activePaperTitle,
  activePaperPages,
}) => {
  const navContent = (
    <div className="flex h-full flex-col bg-[#0B1120] text-slate-300">
      <div className="flex items-center justify-between border-b border-slate-800/90 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 text-white">
            <BookOpen className="h-4 w-4" />
          </div>
          <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
            PAPERWISE AI
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <nav aria-label="Primary Sidebar" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600/20 text-white border border-blue-500/30'
                  : 'text-slate-300 hover:bg-slate-800/70 hover:text-white border border-transparent'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${
                  isActive ? 'text-blue-400' : 'text-slate-400'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-slate-800/90 px-4 py-3.5">
        <div className="text-[11px] font-medium text-slate-400">Active Manuscript</div>
        {activePaperTitle ? (
          <div className="mt-1">
            <div className="truncate text-xs font-semibold text-slate-100" title={activePaperTitle}>
              {activePaperTitle}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
              {activePaperPages} pages · Indexed
            </div>
          </div>
        ) : (
          <div className="mt-1 text-xs text-slate-500">No PDF uploaded yet</div>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-[264px] shrink-0 border-r border-slate-800 lg:block">
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-[264px] max-w-[85vw] border-r border-slate-800">
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
};
