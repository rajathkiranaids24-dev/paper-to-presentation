import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FileUp,
  Loader2,
  Sparkles,
  Trash2,
} from 'lucide-react';
import React, { useRef, useState } from 'react';
import type { DocumentMetadata, PaperWorkspace } from '../types/paperwise.ts';

interface UploadPageProps {
  papers: DocumentMetadata[];
  activeWorkspace: PaperWorkspace | null;
  onUploadFile: (file: File, onProgress: (pct: number) => void) => Promise<void>;
  onLoadSample: () => Promise<void>;
  onSelectPaper: (id: string) => Promise<void>;
  onDeletePaper: (id: string) => Promise<void>;
}

export const UploadPage: React.FC<UploadPageProps> = ({
  papers,
  activeWorkspace,
  onUploadFile,
  onLoadSample,
  onSelectPaper,
  onDeletePaper,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedPageIdx, setSelectedPageIdx] = useState(0);

  const validateAndUpload = async (file: File) => {
    setErrorMsg(null);
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setErrorMsg('Invalid file format. Please select a .pdf research manuscript.');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setErrorMsg('File exceeds the 25 MB upload limit.');
      return;
    }
    setUploading(true);
    setProgress(10);
    try {
      await onUploadFile(file, (pct) => setProgress(pct));
      setSelectedPageIdx(0);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF processing failed.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void validateAndUpload(file);
    }
  };

  const handleLoadSample = async () => {
    setErrorMsg(null);
    setLoadingSample(true);
    try {
      await onLoadSample();
      setSelectedPageIdx(0);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load sample paper.');
    } finally {
      setLoadingSample(false);
    }
  };

  const previewPages = activeWorkspace?.pages ?? [];
  const activePage = previewPages[selectedPageIdx] ?? previewPages[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Upload Research Paper
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Upload an academic PDF manuscript (max 25 MB). The backend extracts page-numbered text, creates overlapping chunks, and indexes Gemini vector embeddings into an isolated document collection.
        </p>
      </div>

      {/* Dropzone Card */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
          dragActive
            ? 'border-blue-600 bg-blue-50/60'
            : 'border-slate-300 bg-white hover:border-slate-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void validateAndUpload(file);
            e.target.value = '';
          }}
        />

        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-blue-600">
          {uploading || loadingSample ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <FileUp className="h-6 w-6" />
          )}
        </div>

        <h2 className="mt-4 font-display text-lg font-semibold text-slate-900">
          {uploading
            ? 'Extracting PDF Pages & Indexing Vector Embeddings...'
            : loadingSample
            ? 'Ingesting Sample Research Paper PDF...'
            : 'Drag and drop your PDF research paper here'}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Text-selectable PDF manuscripts up to 25 MB · Page-level provenance preserved
        </p>

        {uploading && (
          <div className="mx-auto mt-4 max-w-md">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-blue-600 transition-all duration-200"
                style={{ width: `${Math.max(15, progress)}%` }}
              />
            </div>
            <div className="mt-1.5 text-xs font-mono text-slate-600 tabular-nums">
              {progress < 100
                ? `Uploading PDF: ${progress}%`
                : 'Running page extraction & Gemini embedding pipeline...'}
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={uploading || loadingSample}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <FileUp className="h-4 w-4" />
            Browse PDF Files
          </button>

          <button
            type="button"
            disabled={uploading || loadingSample}
            onClick={handleLoadSample}
            className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4" />
            Load Sample Paper (ARAG-Lite 6-Page PDF)
          </button>
        </div>

        {errorMsg && (
          <div className="mx-auto mt-5 flex max-w-xl items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-xs text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Uploaded Papers Collection Table */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Indexed Document Collections ({papers.length})
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Each uploaded manuscript maintains an isolated vector collection to prevent cross-document contamination.
        </p>

        {papers.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No documents indexed yet. Upload a PDF or load the sample paper above.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4 font-medium">Title & Filename</th>
                  <th className="py-2 px-3 font-medium">Collection ID</th>
                  <th className="py-2 px-3 text-right font-medium">Pages</th>
                  <th className="py-2 px-3 text-right font-medium">Chunks</th>
                  <th className="py-2 pl-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {papers.map((paper) => {
                  const isActive = activeWorkspace?.metadata.id === paper.id;
                  return (
                    <tr key={paper.id} className={isActive ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                      <td className="py-3 pr-4">
                        <div className="font-semibold text-slate-900">{paper.title}</div>
                        <div className="mt-0.5 text-slate-500">
                          {paper.filename} {paper.isSample ? '· Built-in Sample PDF' : ''}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-600">
                        {paper.collectionName}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {paper.pageCount}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                        {paper.chunkCount}
                      </td>
                      <td className="py-3 pl-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Active
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void onSelectPaper(paper.id)}
                              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Select
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void onDeletePaper(paper.id)}
                            aria-label={`Delete ${paper.title}`}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Extracted PDF Page Previewer */}
      {activeWorkspace && previewPages.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Extracted PDF Text Preview
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
              {previewPages.map((p, idx) => (
                <button
                  key={p.pageNumber}
                  type="button"
                  onClick={() => setSelectedPageIdx(idx)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors tabular-nums ${
                    idx === selectedPageIdx
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Page {p.pageNumber}
                </button>
              ))}
            </div>
          </div>

          {activePage && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Page {activePage.pageNumber} of {activeWorkspace.metadata.pageCount}
                </span>
                <span className="font-mono tabular-nums">{activePage.wordCount} words</span>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
                {activePage.text}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
