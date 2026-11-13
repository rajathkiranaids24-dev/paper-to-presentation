import { FileUp, Sparkles } from 'lucide-react';
import React from 'react';

interface EmptyPaperStateProps {
  title?: string;
  description?: string;
  onGoToUpload: () => void;
  onLoadSample: () => void;
  loadingSample?: boolean;
}

export const EmptyPaperState: React.FC<EmptyPaperStateProps> = ({
  title = 'No Research Paper Loaded',
  description = 'Upload a text-selectable research paper PDF or load the built-in 6-page sample paper to initialize vector embeddings and run the four AI agents.',
  onGoToUpload,
  onLoadSample,
  loadingSample = false,
}) => {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-blue-600">
        <FileUp className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-display text-xl font-semibold text-slate-900 text-balance">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onGoToUpload}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition-colors whitespace-nowrap"
        >
          <FileUp className="h-4 w-4" />
          Upload PDF Paper
        </button>
        <button
          type="button"
          onClick={onLoadSample}
          disabled={loadingSample}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60 transition-colors whitespace-nowrap"
        >
          <Sparkles className="h-4 w-4" />
          {loadingSample ? 'Indexing Sample PDF...' : 'Load Sample Research Paper'}
        </button>
      </div>
    </div>
  );
};
