# PAPERWISE AI — Research Paper to Presentation & Viva Preparation System

An Agentic AI academic assistant that ingests PDF research papers, indexes page-numbered vector embeddings, routes tasks via Few-Shot Intent Detection, executes four specialized LCEL AI agents powered by Google Gemini, generates downloadable 16:9 PowerPoint decks (`.pptx`) and Word summaries (`.docx`), conducts interactive Viva Voce practice with RAG-verified rubric grading, and exposes full observability via an Agent Activity Monitor, RAG Inspector, and Prompt Engineering Registry.

---

## Architecture & Environment Note

This repository provides **both**:

1. **Live Full-Stack Preview Runtime (Node.js + Express + TypeScript LCEL + `@google/genai`)** — Configured in `server.ts` on Port `3000` so the entire application runs live inside environments without Python `pip` / `ensurepip` (such as the AI Studio sandbox, which runs Node 22 and Python 3.10 without `pip`). It implements real PDF page extraction (`pdfjs-dist`), real `gemini-embedding-2` vector indexing and cosine similarity search, real LCEL `PromptTemplate | Gemini | StructuredJsonParser` chains (`gemini-4-hydrogen`), real `.pptx` generation (`pptxgenjs`), and real `.docx` generation (`docx`).
2. **Complete Python FastAPI + LangChain + PyMuPDF + ChromaDB + python-pptx Backend (`/backend`)** — Full local Python 3.11+ implementation matching the exact FastAPI / LangChain / PyMuPDF / ChromaDB / `python-pptx` specification.

---

## Seven Mandatory Agentic AI Acceptance Criteria

1. **LLM Integration**: Server-side Google Gemini integration (`gemini-4-hydrogen` + `gemini-embedding-2`) with exponential backoff retries on 429/5xx and no client-side API key exposure.
2. **Interactive GUI**: 12-section academic SaaS dashboard (Dashboard, Upload Paper, AI Summary, Concept Extractor, Presentation Generator, Viva Preparation, Viva Practice, Research Paper Chat, Agent Activity Monitor, RAG Inspector, Prompt Engineering, Settings).
3. **Prompt Engineering**: Dedicated Prompt Engineering page displaying live System Prompts, User `PromptTemplate`s, Zero-Shot & Few-Shot examples, and ReAct reflection rules.
4. **LangChain Core Components**: Modular `PromptTemplate | LLM | OutputParser` LCEL pipelines across all four agents (`backend/agents/*.py` & `server/lcel.ts`).
5. **Agentic RAG**: Page-aware overlapping chunking, retrieval necessity checks, cosine similarity search, inline `[Page X]` citations, and explicit refusal when claims are unsupported by the uploaded PDF.
6. **Intent Detection & Routing**: Few-Shot LCEL Intent Router classifying `SUMMARIZE_PAPER`, `EXTRACT_CONCEPTS`, `GENERATE_SLIDES`, `GENERATE_VIVA`, `ASK_PAPER_QUESTION`, and `EVALUATE_VIVA_ANSWER`, logged in the Agent Activity Monitor.
7. **Vector Database**: Document-isolated vector collections (`paperwise_collection_<doc_id>`) using ChromaDB (Python backend) and persistent vector collections with real cosine similarity ranking (Node server), inspectable in the RAG Inspector.

---

## Running Locally (Option A: Full-Stack Node.js Runtime on Port 3000)

```bash
npm install
cp .env.example .env
# Add your GEMINI_API_KEY inside .env
npm run dev
```

Open `http://localhost:3000`.

---

## Running Locally (Option B: Python 3.11+ FastAPI + ChromaDB Backend + Vite Frontend)

```bash
# 1. Start the Python FastAPI backend
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Add your GEMINI_API_KEY inside backend/.env
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 2. In a second terminal, start the React frontend (proxy /api to port 8000)
npm install
npm run dev
```

---

## REST API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Runtime & Gemini configuration check |
| `POST` | `/api/papers/upload` | Multipart PDF validation, page extraction, chunking, and vector indexing |
| `POST` | `/api/papers/load-sample` | Ingests the built-in 6-page sample PDF (`sample_papers/adaptive_rag_academic_survey.pdf`) |
| `POST` | `/api/papers/:id/summarize` | Executes Summarizer Agent |
| `POST` | `/api/papers/:id/concepts` | Executes Concept-Extractor Agent |
| `POST` | `/api/papers/:id/slides` | Executes Slide-Generator Agent (`slideCount`, `theme`) |
| `POST` | `/api/papers/:id/viva` | Generates 20+ categorized viva questions |
| `POST` | `/api/papers/:id/viva/evaluate` | Grades typed viva response against retrieved paper passages |
| `POST` | `/api/papers/:id/chat` | Agentic RAG Q&A with page citations & retrieved context |
| `POST` | `/api/papers/:id/route` | Few-Shot Intent Router auto-dispatching natural-language tasks |
| `GET` | `/api/papers/:id/rag-inspect` | Queries document vector collection and returns cosine similarity scores |
| `GET` | `/api/papers/:id/download/pptx` | Downloads generated 16:9 PowerPoint deck (`.pptx`) |
| `GET` | `/api/papers/:id/download/summary-docx` | Downloads structured summary (`.docx`) |
| `GET` | `/api/papers/:id/download/viva-docx` | Downloads viva question bank (`.docx`) |

---

## Testing & Verification Checklist

1. Click **Load Sample Paper (ARAG-Lite 6-Page PDF)** on the Upload page (or upload your own `.pdf`).
2. Verify extracted page count (`6 pages`) and page-by-page text preview.
3. Open **RAG Inspector** and query `"ReAct faithfulness verification threshold"` to inspect real cosine similarity scores.
4. Run **AI Summary**, **Concept Extractor**, **Presentation Generator**, and **Viva Preparation** from the sidebar or Dashboard.
5. Download the compiled `.pptx` presentation and open it in PowerPoint / LibreOffice Impress to inspect 16:9 slides, charts, and speaker notes.
6. Test **Viva Practice** by submitting a typed answer and inspecting the 0–10 score, strengths, weaknesses, and improved model answer.
7. Test **Research Paper Chat** with both an in-paper question (e.g., `"What hallucination rate did ARAG-Lite achieve in Table 1?"`) and an out-of-scope question (e.g., `"Does this paper propose a quantum hardware accelerator?"`) to verify grounded refusal.
