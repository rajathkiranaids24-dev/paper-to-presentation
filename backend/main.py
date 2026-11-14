import os
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ROOT_DIR = str(Path(__file__).resolve().parent.parent)
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel

from backend.agents.concept_agent import ConceptExtractorAgent
from backend.agents.slide_agent import SlideGeneratorAgent
from backend.agents.summarizer_agent import SummarizerAgent
from backend.agents.viva_agent import VivaAgent
from backend.prompts.templates import (
    CONCEPT_PROMPT,
    INTENT_ROUTER_FEW_SHOT,
    INTENT_ROUTER_PROMPT,
    INTENT_ROUTER_SYSTEM_PROMPT,
    RAG_CHAT_PROMPT,
    SLIDE_PROMPT,
    SUMMARIZER_PROMPT,
    VIVA_EVAL_PROMPT,
    VIVA_PROMPT,
)
from backend.rag.retriever import PaperwiseRetrieverService
from backend.rag.vector_store import PaperwiseChromaStore
from backend.services.docx_generator import build_summary_docx_bytes, build_viva_docx_bytes
from backend.services.intent_router import IntentRouterService
from backend.services.pdf_processor import chunk_pages, extract_pdf_pages
from backend.services.pptx_generator import build_pptx_bytes
from backend.utils.config import (
    get_chat_llm,
    get_chat_model_name,
    get_embedding_model_name,
    has_gemini_api_key,
)

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

WORKSPACES: Dict[str, Dict[str, Any]] = {}
SETTINGS: Dict[str, Any] = {
    "chunkSize": int(os.getenv("CHUNK_SIZE", "900")),
    "chunkOverlap": int(os.getenv("CHUNK_OVERLAP", "150")),
    "topK": int(os.getenv("TOP_K", "5")),
    "defaultSlideCount": 10,
    "defaultSlideTheme": "oxford-navy",
    "activeModel": get_chat_model_name(),
    "embeddingModel": get_embedding_model_name(),
}


def get_llm() -> ChatGoogleGenerativeAI:
    if not has_gemini_api_key():
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured in backend/.env")
    return get_chat_llm(model_name=SETTINGS.get("activeModel"), temperature=0.2)


_store: Optional[PaperwiseChromaStore] = None


def get_store() -> PaperwiseChromaStore:
    global _store
    if _store is None:
        _store = PaperwiseChromaStore()
    return _store


def _append_log(ws: Dict[str, Any], log_entry: Dict[str, Any]) -> None:
    ws["activityLogs"].insert(0, log_entry)
    ws["activityLogs"] = ws["activityLogs"][:100]


def _ingest_pdf_bytes(pdf_bytes: bytes, filename: str, is_sample: bool = False) -> Dict[str, Any]:
    start = time.time()
    parsed = extract_pdf_pages(pdf_bytes, filename)
    doc_id = f"doc_{uuid.uuid4().hex[:10]}"
    chunks = chunk_pages(
        document_id=doc_id,
        pages=parsed["pages"],
        chunk_size=int(SETTINGS["chunkSize"]),
        chunk_overlap=int(SETTINGS["chunkOverlap"]),
    )
    collection_name = get_store().index_chunks(doc_id, chunks)

    workspace = {
        "metadata": {
            "id": doc_id,
            "filename": filename,
            "title": parsed["title"],
            "authors": parsed["authors"],
            "pageCount": parsed["pageCount"],
            "chunkCount": len(chunks),
            "wordCount": parsed["wordCount"],
            "fileSizeBytes": len(pdf_bytes),
            "uploadedAt": datetime.now(timezone.utc).isoformat(),
            "collectionName": collection_name,
            "isSample": is_sample,
            "processingStatus": "ready",
        },
        "pages": parsed["pages"],
        "summary": None,
        "concepts": None,
        "presentation": None,
        "viva": None,
        "chatHistory": [],
        "evaluations": [],
        "activityLogs": [
            {
                "id": f"log_{uuid.uuid4().hex[:8]}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "documentId": doc_id,
                "detectedIntent": "SUMMARIZE_PAPER",
                "intentConfidence": 1.0,
                "intentReasoning": "PDF ingestion, PyMuPDF page extraction, chunking, and ChromaDB indexing.",
                "selectedAgent": "Ingestion & ChromaDB Indexer",
                "status": "completed",
                "inputSummary": f"{filename} ({parsed['pageCount']} pages, {parsed['wordCount']} words)",
                "outputSummary": f"Indexed {len(chunks)} chunks into ChromaDB collection {collection_name}",
                "processingTimeMs": int((time.time() - start) * 1000),
                "selectedTools": ["PyMuPDF(fitz)", "RecursiveCharacterTextSplitter", "ChromaDB"],
                "lcelPipeline": "PDFBytes -> PyMuPDF -> Chunker -> ChromaDB",
                "ragUsed": True,
                "retrievedChunksCount": len(chunks),
            }
        ],
    }
    WORKSPACES[doc_id] = workspace
    return workspace


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


class RouteRequest(BaseModel):
    prompt: str


class SettingsUpdateRequest(BaseModel):
    chunkSize: Optional[int] = None
    chunkOverlap: Optional[int] = None
    topK: Optional[int] = None
    defaultSlideCount: Optional[int] = None
    defaultSlideTheme: Optional[str] = None


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {
        "ok": True,
        "runtime": "Python FastAPI + LangChain LCEL + PyMuPDF + ChromaDB + python-pptx",
        "chatModel": SETTINGS["activeModel"],
        "embeddingModel": SETTINGS["embeddingModel"],
        "geminiConfigured": bool(os.getenv("GEMINI_API_KEY")),
        "pythonBackendIncluded": True,
    }


@app.get("/api/settings")
def get_settings() -> Dict[str, Any]:
    return SETTINGS


@app.put("/api/settings")
def update_settings(req: SettingsUpdateRequest) -> Dict[str, Any]:
    for key, val in req.model_dump(exclude_none=True).items():
        SETTINGS[key] = val
    return SETTINGS


@app.get("/api/prompts")
def get_prompts() -> Dict[str, List[Dict[str, Any]]]:
    prompts = [
        {
            "id": "intent-router",
            "agentName": "Intent Router",
            "technique": "Few-Shot Prompting + Structured Classification",
            "lcelExpression": "INTENT_ROUTER_PROMPT | ChatGoogleGenerativeAI | JsonOutputParser(IntentDecision)",
            "systemPrompt": INTENT_ROUTER_SYSTEM_PROMPT,
            "userPromptTemplate": INTENT_ROUTER_PROMPT.template,
            "inputVariables": INTENT_ROUTER_PROMPT.input_variables,
            "outputSchemaName": "IntentDecision",
            "fewShotExamples": [{"input": "Few-shot block", "output": INTENT_ROUTER_FEW_SHOT}],
        },
        {
            "id": "summarizer-agent",
            "agentName": "Summarizer Agent",
            "technique": "Zero-Shot Structured Synthesis + Role Prompting",
            "lcelExpression": "SUMMARIZER_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser(StructuredSummaryModel)",
            "systemPrompt": SUMMARIZER_PROMPT.messages[0].prompt.template,
            "userPromptTemplate": SUMMARIZER_PROMPT.messages[1].prompt.template,
            "inputVariables": ["filename", "page_count", "paper_pages_text"],
            "outputSchemaName": "StructuredSummaryModel",
        },
        {
            "id": "concept-agent",
            "agentName": "Concept-Extractor Agent",
            "technique": "Zero-Shot Entity & Glossary Extraction",
            "lcelExpression": "CONCEPT_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser(ExtractedConceptsModel)",
            "systemPrompt": CONCEPT_PROMPT.messages[0].prompt.template,
            "userPromptTemplate": CONCEPT_PROMPT.messages[1].prompt.template,
            "inputVariables": ["title", "page_count", "paper_pages_text"],
            "outputSchemaName": "ExtractedConceptsModel",
        },
        {
            "id": "slide-agent",
            "agentName": "Slide-Generator Agent",
            "technique": "Zero-Shot Pedagogical Decomposition + Anti-Hallucination Guard",
            "lcelExpression": "SLIDE_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser(SlideDeckModel)",
            "systemPrompt": SLIDE_PROMPT.messages[0].prompt.template,
            "userPromptTemplate": SLIDE_PROMPT.messages[1].prompt.template,
            "inputVariables": ["slide_count", "theme", "title", "authors", "page_count", "paper_pages_text"],
            "outputSchemaName": "SlideDeckModel",
        },
        {
            "id": "viva-agent",
            "agentName": "Viva Agent (Generator & Evaluator)",
            "technique": "Multi-Tier Taxonomy + ReAct Rubric Reflection",
            "lcelExpression": "VIVA_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser(VivaBankModel)",
            "systemPrompt": VIVA_PROMPT.messages[0].prompt.template,
            "userPromptTemplate": VIVA_EVAL_PROMPT.messages[1].prompt.template,
            "inputVariables": ["min_questions", "title", "page_count", "paper_pages_text"],
            "outputSchemaName": "VivaBankModel / VivaEvalModel",
            "reflectionRule": "Compare student claims against retrieved ChromaDB passages before assigning score.",
        },
        {
            "id": "rag-chat-agent",
            "agentName": "RAG Chat Agent",
            "technique": "ReAct-Style Retrieval Decision & Faithfulness Reflection",
            "lcelExpression": "ChromaRetriever(top_k) | RAG_CHAT_PROMPT | ChatGoogleGenerativeAI | StrOutputParser()",
            "systemPrompt": RAG_CHAT_PROMPT.messages[0].prompt.template,
            "userPromptTemplate": RAG_CHAT_PROMPT.messages[1].prompt.template,
            "inputVariables": ["title", "page_count", "chat_history", "retrieved_context", "user_question"],
            "outputSchemaName": "GroundedMarkdownWithCitations",
            "reflectionRule": "Cite [Page X] and refuse unsupported claims not found in retrieved ChromaDB chunks.",
        },
    ]
    return {"prompts": prompts}


@app.get("/api/papers")
def list_papers() -> Dict[str, Any]:
    ordered = sorted(
        (ws["metadata"] for ws in WORKSPACES.values()),
        key=lambda m: m["uploadedAt"],
        reverse=True,
    )
    return {"papers": ordered}


@app.post("/api/papers/upload")
async def upload_paper(file: UploadFile = File(...)) -> Dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are accepted.")
    pdf_bytes = await file.read()
    try:
        return _ingest_pdf_bytes(pdf_bytes, file.filename, is_sample=False)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/papers/load-sample")
def load_sample_paper() -> Dict[str, Any]:
    sample_path = Path(__file__).resolve().parent.parent / "sample_papers" / "adaptive_rag_academic_survey.pdf"
    if not sample_path.exists():
        raise HTTPException(status_code=404, detail="Sample research paper PDF not found.")
    return _ingest_pdf_bytes(sample_path.read_bytes(), sample_path.name, is_sample=True)


@app.get("/api/papers/{doc_id}")
def get_workspace(doc_id: str) -> Dict[str, Any]:
    if doc_id not in WORKSPACES:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    return WORKSPACES[doc_id]


@app.delete("/api/papers/{doc_id}")
def delete_workspace(doc_id: str) -> Dict[str, bool]:
    WORKSPACES.pop(doc_id, None)
    get_store().delete_document(doc_id)
    return {"deleted": True}


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
    _append_log(ws, {
        "id": f"log_{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "documentId": doc_id,
        "detectedIntent": "SUMMARIZE_PAPER",
        "intentConfidence": 1.0,
        "intentReasoning": "Structured summarization requested.",
        "selectedAgent": "Summarizer Agent",
        "status": "completed",
        "inputSummary": ws["metadata"]["title"],
        "outputSummary": f"Generated summary with {len(summary['objectives'])} objectives and {len(summary['keyTakeaways'])} takeaways.",
        "processingTimeMs": int((time.time() - start) * 1000),
        "selectedTools": ["PyMuPDFText", "GeminiChatModel", "PydanticOutputParser"],
        "lcelPipeline": "SUMMARIZER_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser",
        "ragUsed": False,
        "retrievedChunksCount": 0,
    })
    return {"summary": summary, "workspace": ws}


@app.post("/api/papers/{doc_id}/concepts")
def extract_concepts(doc_id: str) -> Dict[str, Any]:
    ws = WORKSPACES.get(doc_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    start = time.time()
    agent = ConceptExtractorAgent(get_llm())
    concepts = agent.run(ws["metadata"]["title"], ws["metadata"]["pageCount"], ws["pages"])
    concepts["generatedAt"] = datetime.now(timezone.utc).isoformat()
    ws["concepts"] = concepts
    _append_log(ws, {
        "id": f"log_{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "documentId": doc_id,
        "detectedIntent": "EXTRACT_CONCEPTS",
        "intentConfidence": 1.0,
        "intentReasoning": "Concept and glossary extraction requested.",
        "selectedAgent": "Concept-Extractor Agent",
        "status": "completed",
        "inputSummary": ws["metadata"]["title"],
        "outputSummary": f"Extracted {len(concepts['importantConcepts'])} concepts and {len(concepts['technicalGlossary'])} glossary terms.",
        "processingTimeMs": int((time.time() - start) * 1000),
        "selectedTools": ["GeminiChatModel", "PydanticOutputParser"],
        "lcelPipeline": "CONCEPT_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser",
        "ragUsed": False,
        "retrievedChunksCount": 0,
    })
    return {"concepts": concepts, "workspace": ws}


@app.post("/api/papers/{doc_id}/slides")
def generate_slides(doc_id: str, req: SlideRequest) -> Dict[str, Any]:
    ws = WORKSPACES.get(doc_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    start = time.time()
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
    _append_log(ws, {
        "id": f"log_{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "documentId": doc_id,
        "detectedIntent": "GENERATE_SLIDES",
        "intentConfidence": 1.0,
        "intentReasoning": f"Presentation generation ({req.slideCount} slides, {req.theme}).",
        "selectedAgent": "Slide-Generator Agent",
        "status": "completed",
        "inputSummary": f"{ws['metadata']['title']} · {req.slideCount} slides",
        "outputSummary": f"Generated {deck['slideCount']} slides with speaker notes.",
        "processingTimeMs": int((time.time() - start) * 1000),
        "selectedTools": ["GeminiChatModel", "PydanticOutputParser", "python-pptx"],
        "lcelPipeline": "SLIDE_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser",
        "ragUsed": False,
        "retrievedChunksCount": 0,
    })
    return {"presentation": deck, "workspace": ws}


@app.post("/api/papers/{doc_id}/viva")
def generate_viva(doc_id: str, req: VivaGenRequest) -> Dict[str, Any]:
    ws = WORKSPACES.get(doc_id)
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    start = time.time()
    agent = VivaAgent(get_llm(), get_store())
    viva = agent.generate_questions(
        ws["metadata"]["title"],
        ws["metadata"]["pageCount"],
        ws["pages"],
        min_questions=req.minQuestions,
    )
    viva["generatedAt"] = datetime.now(timezone.utc).isoformat()
    ws["viva"] = viva
    _append_log(ws, {
        "id": f"log_{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "documentId": doc_id,
        "detectedIntent": "GENERATE_VIVA",
        "intentConfidence": 1.0,
        "intentReasoning": "Viva question bank generation requested.",
        "selectedAgent": "Viva Agent",
        "status": "completed",
        "inputSummary": ws["metadata"]["title"],
        "outputSummary": f"Generated {viva['totalCount']} viva questions.",
        "processingTimeMs": int((time.time() - start) * 1000),
        "selectedTools": ["GeminiChatModel", "PydanticOutputParser"],
        "lcelPipeline": "VIVA_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser",
        "ragUsed": False,
        "retrievedChunksCount": 0,
    })
    return {"viva": viva, "workspace": ws}


@app.post("/api/papers/{doc_id}/viva/evaluate")
def evaluate_viva(doc_id: str, req: VivaEvalRequest) -> Dict[str, Any]:
    ws = WORKSPACES.get(doc_id)
    if not ws or not ws.get("viva"):
        raise HTTPException(status_code=404, detail="Workspace or viva bank not found.")
    question = next((q for q in ws["viva"]["questions"] if q["id"] == req.questionId), None)
    if not question:
        raise HTTPException(status_code=404, detail="Viva question not found.")
    start = time.time()
    agent = VivaAgent(get_llm(), get_store())
    evaluation = agent.evaluate_answer(doc_id, question, req.userAnswer, top_k=int(SETTINGS["topK"]))
    evaluation["evaluatedAt"] = datetime.now(timezone.utc).isoformat()
    ws["evaluations"] = [evaluation] + [e for e in ws["evaluations"] if e["questionId"] != req.questionId]
    _append_log(ws, {
        "id": f"log_{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "documentId": doc_id,
        "detectedIntent": "EVALUATE_VIVA_ANSWER",
        "intentConfidence": 0.99,
        "intentReasoning": "Rubric evaluation against ChromaDB ground-truth passages.",
        "selectedAgent": "Viva Agent",
        "status": "completed",
        "inputSummary": question["question"][:90],
        "outputSummary": f"Scored {evaluation['score']}/10 ({evaluation['verdict']}).",
        "processingTimeMs": int((time.time() - start) * 1000),
        "selectedTools": ["ChromaDBRetriever", "GeminiChatModel", "VivaEvalModel"],
        "lcelPipeline": "ChromaRetriever | VIVA_EVAL_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser",
        "ragUsed": True,
        "retrievedChunksCount": int(SETTINGS["topK"]),
    })
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
        top_k=int(SETTINGS["topK"]),
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
    _append_log(ws, {
        "id": f"log_{uuid.uuid4().hex[:8]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "documentId": doc_id,
        "detectedIntent": intent_res["intent"],
        "intentConfidence": intent_res["confidence"],
        "intentReasoning": intent_res["reasoning"],
        "selectedAgent": "RAG Chat Agent",
        "status": "completed",
        "inputSummary": req.message[:120],
        "outputSummary": f"Retrieved {len(chat_res['retrieved_chunks'])} chunks from ChromaDB.",
        "processingTimeMs": chat_res["latency_ms"],
        "selectedTools": ["IntentRouter", "ChromaDBRetriever", "ReActRAGChain"],
        "lcelPipeline": "ChromaRetriever | RAG_CHAT_PROMPT | ChatGoogleGenerativeAI | StrOutputParser",
        "ragUsed": chat_res["retrieval_used"],
        "retrievedChunksCount": len(chat_res["retrieved_chunks"]),
    })
    return {"assistantMessage": assistant_msg, "workspace": ws}


@app.post("/api/papers/{doc_id}/route")
def route_natural_language_task(doc_id: str, req: RouteRequest) -> Dict[str, Any]:
    if doc_id not in WORKSPACES:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    router = IntentRouterService(get_llm())
    classification = router.classify(req.prompt)
    intent = classification["intent"]

    if intent == "SUMMARIZE_PAPER":
        res = summarize_paper(doc_id)
        return {"classification": classification, "targetTab": "summary", "workspace": res["workspace"]}
    if intent == "EXTRACT_CONCEPTS":
        res = extract_concepts(doc_id)
        return {"classification": classification, "targetTab": "concepts", "workspace": res["workspace"]}
    if intent == "GENERATE_SLIDES":
        res = generate_slides(
            doc_id,
            SlideRequest(slideCount=int(SETTINGS["defaultSlideCount"]), theme=str(SETTINGS["defaultSlideTheme"])),
        )
        return {"classification": classification, "targetTab": "slides", "workspace": res["workspace"]}
    if intent == "GENERATE_VIVA":
        res = generate_viva(doc_id, VivaGenRequest(minQuestions=20))
        return {"classification": classification, "targetTab": "viva", "workspace": res["workspace"]}
    if intent == "EVALUATE_VIVA_ANSWER":
        return {"classification": classification, "targetTab": "practice", "workspace": WORKSPACES[doc_id]}

    res = chat_with_paper(doc_id, ChatRequest(message=req.prompt))
    return {"classification": classification, "targetTab": "chat", "workspace": res["workspace"]}


@app.get("/api/papers/{doc_id}/rag-inspect")
def inspect_rag(
    doc_id: str,
    query: str = Query(default=""),
    topK: int = Query(default=5, ge=1, le=20),
) -> Dict[str, Any]:
    if doc_id not in WORKSPACES:
        raise HTTPException(status_code=404, detail="Workspace not found.")
    start = time.time()
    res = get_store().query(document_id=doc_id, query_text=query, top_k=topK)
    return {
        "collectionName": res["collection_name"],
        "documentId": doc_id,
        "totalChunks": res["total_chunks"],
        "embeddingModel": res["embedding_model"],
        "query": query,
        "topK": topK,
        "retrievalStatus": "success" if res["chunks"] else "empty",
        "processingTimeMs": int((time.time() - start) * 1000),
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


@app.get("/api/papers/{doc_id}/download/summary-docx")
def download_summary_docx(doc_id: str) -> Response:
    ws = WORKSPACES.get(doc_id)
    if not ws or not ws.get("summary"):
        raise HTTPException(status_code=404, detail="Generated summary not found.")
    docx_bytes = build_summary_docx_bytes(ws["summary"])
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="paperwise_summary.docx"'},
    )


@app.get("/api/papers/{doc_id}/download/viva-docx")
def download_viva_docx(doc_id: str) -> Response:
    ws = WORKSPACES.get(doc_id)
    if not ws or not ws.get("viva"):
        raise HTTPException(status_code=404, detail="Generated viva bank not found.")
    docx_bytes = build_viva_docx_bytes(ws["metadata"]["title"], ws["viva"])
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": 'attachment; filename="paperwise_viva_questions.docx"'},
    )
