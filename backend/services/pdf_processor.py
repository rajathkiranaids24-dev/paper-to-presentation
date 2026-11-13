import re
from typing import Any, Dict, List
import fitz  # PyMuPDF
from langchain_text_splitters import RecursiveCharacterTextSplitter

MAX_PDF_BYTES = 25 * 1024 * 1024


def detect_section_hint(text: str) -> str:
    head = text[:260].lower()
    if "abstract" in head:
        return "Abstract"
    if "introduction" in head:
        return "Introduction"
    if "problem statement" in head or "objective" in head:
        return "Problem & Objectives"
    if "literature review" in head or "related work" in head:
        return "Literature Review"
    if "methodology" in head or "architecture" in head:
        return "Methodology & Architecture"
    if "result" in head or "evaluation" in head or "table 1" in head:
        return "Results & Discussion"
    if "limitation" in head:
        return "Limitations"
    if "future" in head:
        return "Future Scope"
    if "conclusion" in head:
        return "Conclusion"
    if "references" in head:
        return "References"
    return "Body Section"


def extract_pdf_pages(pdf_bytes: bytes, filename: str) -> Dict[str, Any]:
    if not pdf_bytes:
        raise ValueError("Uploaded PDF file is empty.")
    if len(pdf_bytes) > MAX_PDF_BYTES:
        raise ValueError("Uploaded PDF exceeds 25 MB size limit.")
    if not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError("Malformed PDF: missing %PDF- header signature.")

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise ValueError(f"Unable to open PDF with PyMuPDF: {exc}") from exc

    if doc.page_count == 0:
        raise ValueError("PDF contains zero pages.")

    pages: List[Dict[str, Any]] = []
    total_words = 0

    for idx in range(doc.page_count):
        page = doc.load_page(idx)
        raw_text = page.get_text("text") or ""
        cleaned = re.sub(r"\s+", " ", raw_text).strip()
        words = len(cleaned.split()) if cleaned else 0
        total_words += words
        pages.append({
            "pageNumber": idx + 1,
            "text": cleaned,
            "wordCount": words,
        })

    if total_words < 25:
        raise ValueError("No readable text layer found in PDF (scanned image-only PDF).")

    meta = doc.metadata or {}
    title = (meta.get("title") or "").strip()
    authors = (meta.get("author") or "").strip()

    first_text = pages[0]["text"]
    if not title:
        title = first_text.split("ABSTRACT")[0][:160].strip() or filename.replace(".pdf", "")
    if not authors:
        match = re.search(r"Authors?\s*:\s*([^.\n]{3,140})", first_text, re.IGNORECASE)
        authors = match.group(1).strip() if match else "Authors listed in manuscript"

    return {
        "title": title,
        "authors": authors,
        "pageCount": doc.page_count,
        "wordCount": total_words,
        "pages": pages,
    }


def chunk_pages(
    document_id: str,
    pages: List[Dict[str, Any]],
    chunk_size: int = 900,
    chunk_overlap: int = 150,
) -> List[Dict[str, Any]]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks: List[Dict[str, Any]] = []
    global_idx = 0

    for page in pages:
        text = page["text"].strip()
        if not text:
            continue
        for slice_text in splitter.split_text(text):
            chunks.append({
                "id": f"{document_id}_chunk_{global_idx}",
                "document_id": document_id,
                "chunk_index": global_idx,
                "page_number": page["pageNumber"],
                "section_hint": detect_section_hint(slice_text),
                "text": slice_text,
            })
            global_idx += 1

    return chunks
