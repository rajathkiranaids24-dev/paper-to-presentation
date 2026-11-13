import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageContent } from '../../src/types/paperwise.ts';

export const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB

export interface TextChunkInput {
  id: string;
  documentId: string;
  chunkIndex: number;
  pageNumber: number;
  sectionHint: string;
  text: string;
}

export interface ParsedPdfResult {
  title: string;
  authors: string;
  pageCount: number;
  wordCount: number;
  pages: PageContent[];
}

function detectSectionHint(text: string): string {
  const head = text.slice(0, 260);
  const patterns: Array<[RegExp, string]> = [
    [/\babstract\b/i, 'Abstract'],
    [/\b1\.?\s*introduction\b|\bintroduction\b/i, 'Introduction'],
    [/\bproblem\s+statement\b|\bobjectives?\b/i, 'Problem & Objectives'],
    [/\bliterature\s+review\b|\brelated\s+work\b/i, 'Literature Review'],
    [/\bmethodology\b|\bproposed\s+system\b|\barchitecture\b/i, 'Methodology & Architecture'],
    [/\bimplementation\b|\bexperimental\s+setup\b/i, 'Implementation'],
    [/\bresults?\b|\bevaluation\b|\bdiscussion\b|\btable\s+1\b/i, 'Results & Discussion'],
    [/\badvantages\b|\blimitations?\b/i, 'Advantages & Limitations'],
    [/\bfuture\s+scope\b|\bfuture\s+work\b/i, 'Future Scope'],
    [/\bconclusion\b/i, 'Conclusion'],
    [/\breferences\b|\bbibliography\b/i, 'References'],
  ];
  for (const [regex, label] of patterns) {
    if (regex.test(head)) return label;
  }
  return 'Body Section';
}

export function validatePdfBuffer(buffer: Buffer, filename: string): void {
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded file is empty.');
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error(
      `PDF exceeds maximum allowed size of ${Math.round(MAX_PDF_BYTES / (1024 * 1024))} MB.`
    );
  }
  if (!filename.toLowerCase().endsWith('.pdf')) {
    throw new Error('Invalid file extension. Only .pdf research papers are accepted.');
  }
  const header = buffer.subarray(0, 5).toString('ascii');
  if (header !== '%PDF-') {
    throw new Error('Malformed or non-PDF file: missing %PDF- binary signature.');
  }
}

export async function extractPdfPages(
  buffer: Buffer,
  filename: string
): Promise<ParsedPdfResult> {
  validatePdfBuffer(buffer, filename);

  let pdfDoc;
  try {
    const uint8 = new Uint8Array(buffer);
    pdfDoc = await pdfjsLib.getDocument({
      data: uint8,
      useWorkerFetch: false,
      useSystemFonts: true,
      verbosity: 0,
    }).promise;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Unable to parse PDF file (${detail}). Ensure the file is not corrupted or password-protected.`);
  }

  const pageCount = pdfDoc.numPages;
  if (pageCount === 0) {
    throw new Error('PDF contains 0 pages.');
  }

  const pages: PageContent[] = [];
  let totalWords = 0;

  for (let p = 1; p <= pageCount; p++) {
    const page = await pdfDoc.getPage(p);
    const content = await page.getTextContent();
    const rawItems = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);

    const text = rawItems
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const words = text ? text.split(/\s+/).length : 0;
    totalWords += words;
    pages.push({
      pageNumber: p,
      text,
      wordCount: words,
    });
  }

  if (totalWords < 25) {
    throw new Error(
      'No readable text layer found in PDF (possibly a scanned image-only PDF without OCR). Please upload a text-selectable research paper PDF.'
    );
  }

  // Extract metadata / first-page title heuristic
  let metaTitle = '';
  let metaAuthor = '';
  try {
    const meta = await pdfDoc.getMetadata();
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    if (typeof info.Title === 'string' && info.Title.trim().length > 3) {
      metaTitle = info.Title.trim();
    }
    if (typeof info.Author === 'string' && info.Author.trim().length > 2) {
      metaAuthor = info.Author.trim();
    }
  } catch {
    // Ignore optional metadata parsing failure
  }

  const firstPageText = pages[0]?.text ?? '';
  if (!metaTitle) {
    const beforeAuthors = firstPageText.split(/\bAuthors?\s*:/i)[0]?.trim() ?? '';
    const beforeAbstract = firstPageText.split(/\bABSTRACT\b/i)[0]?.trim() ?? '';
    const candidate = beforeAuthors.length >= 10 && beforeAuthors.length <= 200
      ? beforeAuthors
      : beforeAbstract.slice(0, 160);
    metaTitle = candidate || filename.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
  }

  if (!metaAuthor) {
    const authorMatch = firstPageText.match(/Authors?\s*:\s*([^.\n]{3,140})/i);
    metaAuthor = authorMatch ? authorMatch[1].trim() : 'Authors listed in manuscript';
  }

  return {
    title: metaTitle,
    authors: metaAuthor,
    pageCount,
    wordCount: totalWords,
    pages,
  };
}

export function chunkPages(params: {
  documentId: string;
  pages: PageContent[];
  chunkSize?: number;
  chunkOverlap?: number;
}): TextChunkInput[] {
  const chunkSize = Math.max(300, Math.min(2400, params.chunkSize ?? 900));
  const chunkOverlap = Math.max(0, Math.min(chunkSize - 100, params.chunkOverlap ?? 150));
  const chunks: TextChunkInput[] = [];
  let globalIndex = 0;

  for (const page of params.pages) {
    const text = page.text.trim();
    if (!text) continue;

    if (text.length <= chunkSize) {
      chunks.push({
        id: `${params.documentId}_chunk_${globalIndex}`,
        documentId: params.documentId,
        chunkIndex: globalIndex,
        pageNumber: page.pageNumber,
        sectionHint: detectSectionHint(text),
        text,
      });
      globalIndex++;
      continue;
    }

    let start = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + chunkSize);
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(' ', end);
        if (lastSpace > start + chunkSize * 0.6) {
          end = lastSpace;
        }
      }
      const slice = text.slice(start, end).trim();
      if (slice.length > 20) {
        chunks.push({
          id: `${params.documentId}_chunk_${globalIndex}`,
          documentId: params.documentId,
          chunkIndex: globalIndex,
          pageNumber: page.pageNumber,
          sectionHint: detectSectionHint(slice),
          text: slice,
        });
        globalIndex++;
      }
      if (end >= text.length) break;
      start = Math.max(start + 1, end - chunkOverlap);
    }
  }

  return chunks;
}

export function formatPagesForPrompt(pages: PageContent[], maxChars = 48000): string {
  let out = '';
  for (const p of pages) {
    const block = `\n[PAGE ${p.pageNumber}]\n${p.text}\n`;
    if (out.length + block.length > maxChars) {
      out += `\n[TRUNCATED BEYOND PAGE ${p.pageNumber - 1} DUE TO PROMPT BUDGET]\n`;
      break;
    }
    out += block;
  }
  return out.trim();
}
