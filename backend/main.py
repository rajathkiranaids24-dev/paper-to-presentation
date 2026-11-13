import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from agents.concept_agent import ConceptExtractorAgent
from agents.slide_agent import SlideGeneratorAgent
from agents.summarizer_agent import SummarizerAgent
from agents.viva_agent import VivaAgent
from rag.retriever import PaperwiseRetrieverService
from rag.vector_store import PaperwiseChromaStore
from services.intent_router import IntentRouterService
from services.pdf_processor import chunk_pages, extract_pdf_pages
from services.pptx_generator import build_pptx_bytes

load_dotenv()

app = FastAPI(
    title="PAPERWISE AI — FastAPI + LangChain + ChromaDB Backend",
    version="1.0.0",
    description="Research Paper to Presentation & Viva Preparation Agentic AI Backend",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory workspace store (ChromaDB persists vectors on disk)
WORKSPACES: Dict[str, Dict[str, Any]] = {}


def get_llm() -> ChatGoogleGenerativeAI:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured in backend/.env")
    model_name = os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash")
    return ChatGoogleGenerativeAI(model=model_name, google_api_key=api_key, temperature=0.2)


_store: Optional[PaperwiseChromaStore] = None


def get_store() -> PaperwiseChromaStore:
    global _store
    if _store is None:
        _store = PaperwiseChromaStore()
    return _store


class SlideRequest(BaseModel):
    slideCount: int = 10
    theme: str = "oxford-navy"


class VivaGenRequest(BaseModel):
    minQuestions: int = 20


class VivaEvalRequest(BaseModel):
    questionId: str
    userAnswer: str


class ChatRequest(BaseModel):
    message: str


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {
        "ok": True,
        "runtime": "Python FastAPI + LangChain LCEL + PyMuPDF + ChromaDB + python-pptx",
        "geminiConfigured": bool(os.getenv("GEMINI_API_KEY")),
    }


@app.post("/api/papers/upload")
async def upload_paper(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are accepted.")
    pdf_bytes = await file.read()
    try:
        parsed = extract_pdf_pages(pdf_bytes, file.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    doc_id = f"doc_{uuid.uuid4().hex[:10]}"
    chunks = chunk_pages(
        document_id=doc_id,
        pages=parsed["pages"],
        chunk_size=int(os.getenv("CHUNK_SIZE", "900")),
        chunk_overlap=int(os.getenv("CHUNK_OVERLAP", "150")),
    )
    collection_name = get_store().index_chunks(doc_id, chunks)

    workspace = {
        "metadata": {
            "id": doc_id,
            "filename": file.filename,
            "title": parsed["title"],
            "authors": parsed["authors"],
            "pageCount": parsed["pageCount"],
            "chunkCount": len(chunks),
            "wordCount": parsed["wordCount"],
            "fileSizeBytes": len(pdf_bytes),
            "uploadedAt": datetime.now(timezone.utc).isoformat(),
            "collectionName": collection_name,
            "processingStatus": "ready",
        },
        "pages": parsed["pages"],
        "summary": None,
        "concepts": None,
        "presentation": None,
        "viva": None,
        "chatHistory": [],
        "evaluations": [],
        "activityLogs": [],
    }
    WORKSPACES[doc_id] = workspace
    return workspace


@app.get("/api/papers/{doc_id}")
def get_workspace(doc_id: str) -> Dict[str, Any]:
    if doc_id not in WORKSPACES:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return WORKSPACES[doc_id]


@app.post("/api/papers/{doc_id}/summarize")
def summarize_paper(doc_id: str) -> Dict[str, Any]:
    ws = WORKSPACES.get(doc_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    start = time.time()
    agent = SummarizerAgent(get_llm())
    summary = agent.run(ws["metadata"]["filename"], ws["metadata"]["pageCount"], ws["pages"])
    summary["generatedAt"] = datetime.now(timezone.utc).isoformat()
    ws["summary"] = summary
    ws["activityLogs"].insert(0, {
        "id": f"log_{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "documentId": doc_id,
        "detectedIntent": "SUMMARIZE_PAPER",
        "selectedAgent": "Summarizer Agent",
        "status": "completed",
        "processingTimeMs": int((time.time() - start) * 1000),
    })
    return {"summary": summary, "workspace": ws}


@app.post("/api/papers/{doc_id}/concepts")
def extract_concepts(doc_id: str) -> Dict[str, Any]:
    ws = WORKSPACES.get(doc_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    agent = ConceptExtractorAgent(get_llm())
    concepts = agent.run(ws["metadata"]["title"], ws["metadata"]["pageCount"], ws["pages"])
    concepts["generatedAt"] = datetime.now(timezone.utc).isoformat()
    ws["concepts"] = concepts
    return {"concepts": concepts, "workspace": ws}


@app.post("/api/papers/{doc_id}/slides")
def generate_slides(doc_id: str, req: SlideRequest) -> Dict[str, Any]:
    ws = WORKSPACES.get(doc_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    agent = SlideGeneratorAgent(get_llm())
    deck = agent.run(
        ws["metadata"]["title"],
        ws["metadata"]["authors"],
        ws["metadata"]["pageCount"],
        ws["pages"],
        slide_count=req.slideCount,
        theme=req.theme,
    )
    deck["generatedAt"] = datetime.now(timezone.utc).isoformat()
    ws["presentation"] = deck
    return {"presentation": deck, "workspace": ws}


@app.post("/api/papers/{doc_id}/viva")
def generate_viva(doc_id: str, req: VivaGenRequest) -> Dict[str, Any]:
    ws = WORKSPACES.get(doc_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    agent = VivaAgent(get_llm(), get_store())
    viva = agent.generate_questions(
        ws["metadata"]["title"],
        ws["metadata"]["pageCount"],
        ws["pages"],
        min_questions=req.minQuestions,
    )
    viva["generatedAt"] = datetime.now(timezone.utc).isoformat()
    ws["viva"] = viva
    return {"viva": viva, "workspace": ws}


@app.post("/api/papers/{doc_id}/viva/evaluate")
def evaluate_viva(doc_id: str, req: VivaEvalRequest) -> Dict[str, Any]:
    ws = WORKSPACES.get(doc_id)
    if not ws or not ws.get("viva"):
        raise HTTPException(status_code=404, detail="Workspace or viva bank not found.")
    question = next((q for q in ws["viva"]["questions"] if q["id"] == req.questionId), None)
    if not question:
        raise HTTPException(status_code=404, detail="Viva question not found.")
    agent = VivaAgent(get_llm(), get_store())
    evaluation = agent.evaluate_answer(doc_id, question, req.userAnswer)
    evaluation["evaluatedAt"] = datetime.now(timezone.utc).isoformat()
    ws["evaluations"].insert(0, evaluation)
    return {"evaluation": evaluation, "workspace": ws}


@app.post("/api/papers/{doc_id}/chat")
def chat_with_paper(doc_id: str, req: ChatRequest) -> Dict[str, Any]:
    ws = WORKSPACES.get(doc_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    llm = get_llm()
    router = IntentRouterService(llm)
    intent_res = router.classify(req.message)

    retriever = PaperwiseRetrieverService(get_store(), llm)
    chat_res = retriever.answer_question(
        document_id=doc_id,
        title=ws["metadata"]["title"],
        authors=ws["metadata"]["authors"],
        page_count=ws["metadata"]["pageCount"],
        user_question=req.message,
        chat_history=ws["chatHistory"],
        top_k=int(os.getenv("TOP_K", "5")),
    )

    assistant_msg = {
        "id": f"msg_{uuid.uuid4().hex[:8]}",
        "role": "assistant",
        "content": chat_res["answer"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "detectedIntent": intent_res["intent"],
        "selectedAgent": "RAG Chat Agent",
        "retrievalUsed": chat_res["retrieval_used"],
        "retrievedChunks": chat_res["retrieved_chunks"],
        "pageReferences": chat_res["page_references"],
        "processingTimeMs": chat_res["latency_ms"],
    }
    ws["chatHistory"].append({"id": f"msg_{uuid.uuid4().hex[:8]}", "role": "user", "content": req.message, "timestamp": datetime.now(timezone.utc).isoformat()})
    ws["chatHistory"].append(assistant_msg)
    return {"assistantMessage": assistant_msg, "workspace": ws}


@app.get("/api/papers/{doc_id}/rag-inspect")
def inspect_rag(
    doc_id: str,
    query: str = Query(default=""),
    topK: int = Query(default=5, ge=1, le=20),
) -> Dict[str, Any]:
    if doc_id not in WORKSPACES:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    res = get_store().query(document_id=doc_id, query_text=query, top_k=topK)
    return {
        "collectionName": res["collection_name"],
        "documentId": doc_id,
        "totalChunks": res["total_chunks"],
        "embeddingModel": res["embedding_model"],
        "query": query,
        "topK": topK,
        "retrievalStatus": "success" if res["chunks"] else "empty",
        "retrievedChunks": res["chunks"],
    }


@app.get("/api/papers/{doc_id}/download/pptx")
def download_pptx(doc_id: str) -> Response:
    ws = WORKSPACES.get(doc_id)
    if not ws or not ws.get("presentation"):
        raise HTTPException(status_code=404, detail="Generated slide deck not found.")
    pptx_bytes = build_pptx_bytes(ws["presentation"])
    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": 'attachment; filename="paperwise_slides.pptx"'},
    )
