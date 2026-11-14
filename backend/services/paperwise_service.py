import hashlib
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from langchain_google_genai import ChatGoogleGenerativeAI

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
    get_chat_model_name,
    get_embedding_model_name,
    get_gemini_api_key,
)

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
SAMPLE_PAPER_PATH = ROOT_DIR / "sample_papers" / "adaptive_rag_academic_survey.pdf"

DEFAULT_SETTINGS: Dict[str, Any] = {
    "chunkSize": 900,
    "chunkOverlap": 150,
    "topK": 5,
    "defaultSlideCount": 10,
    "defaultSlideTheme": "oxford-navy",
    "activeModel": get_chat_model_name(),
    "embeddingModel": get_embedding_model_name(),
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _format_gemini_error(exc: Exception, operation: str) -> RuntimeError:
    msg = str(exc)
    lower = msg.lower()
    if "api_key" in lower or "api key" in lower or "401" in lower or "403" in lower:
        return RuntimeError(
            f"{operation} failed: Gemini API authentication error. "
            "Verify your GEMINI_API_KEY in Streamlit Cloud Secrets."
        )
    if "429" in lower or "quota" in lower or "rate" in lower or "resource_exhausted" in lower:
        return RuntimeError(
            f"{operation} paused due to Gemini API rate limit or quota exhaustion. "
            "Please wait a few seconds and retry."
        )
    if "404" in lower or "not found" in lower:
        return RuntimeError(
            f"{operation} failed: Configured Gemini model was not found ({msg}). "
            "Verify GEMINI_CHAT_MODEL and GEMINI_EMBEDDING_MODEL."
        )
    return RuntimeError(f"{operation} failed: {msg}")


def get_llm(model_name: Optional[str] = None, temperature: float = 0.2) -> ChatGoogleGenerativeAI:
    api_key = get_gemini_api_key()
    chosen_model = model_name or get_chat_model_name()
    return ChatGoogleGenerativeAI(
        model=chosen_model,
        google_api_key=api_key,
        temperature=temperature,
    )


def _append_log(ws: Dict[str, Any], log_entry: Dict[str, Any]) -> None:
    ws.setdefault("activityLogs", []).insert(0, log_entry)
    ws["activityLogs"] = ws["activityLogs"][:100]


def ingest_pdf_bytes(
    pdf_bytes: bytes,
    filename: str,
    store: PaperwiseChromaStore,
    chunk_size: int = 900,
    chunk_overlap: int = 150,
    is_sample: bool = False,
    existing_workspaces: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Extract PDF pages, chunk text, and index into ChromaDB directly in-process."""
    start = time.time()
    file_hash = hashlib.sha256(pdf_bytes).hexdigest()[:12]
    doc_id = f"doc_{file_hash}"

    # Avoid redundant re-embedding on Streamlit reruns if already processed with same chunking
    if existing_workspaces and doc_id in existing_workspaces:
        existing = existing_workspaces[doc_id]
        existing_meta = existing.get("metadata", {})
        if (
            existing_meta.get("chunkSize") == chunk_size
            and existing_meta.get("chunkOverlap") == chunk_overlap
            and existing.get("chunks")
        ):
            try:
                store.ensure_indexed(doc_id, existing["chunks"])
            except Exception as exc:
                raise _format_gemini_error(exc, "ChromaDB vector indexing") from exc
            return existing

    parsed = extract_pdf_pages(pdf_bytes, filename)
    chunks = chunk_pages(
        document_id=doc_id,
        pages=parsed["pages"],
        chunk_size=int(chunk_size),
        chunk_overlap=int(chunk_overlap),
    )
    if not chunks:
        raise ValueError("No text chunks could be created from the uploaded PDF.")

    try:
        collection_name = store.ensure_indexed(doc_id, chunks)
    except Exception as exc:
        raise _format_gemini_error(exc, "PDF vector indexing") from exc

    workspace: Dict[str, Any] = {
        "metadata": {
            "id": doc_id,
            "filename": filename,
            "title": parsed["title"],
            "authors": parsed["authors"],
            "pageCount": parsed["pageCount"],
            "chunkCount": len(chunks),
            "wordCount": parsed["wordCount"],
            "fileSizeBytes": len(pdf_bytes),
            "chunkSize": int(chunk_size),
            "chunkOverlap": int(chunk_overlap),
            "uploadedAt": _now_iso(),
            "collectionName": collection_name,
            "isSample": is_sample,
            "processingStatus": "ready",
        },
        "pages": parsed["pages"],
        "chunks": chunks,
        "summary": None,
        "concepts": None,
        "presentation": None,
        "viva": None,
        "chatHistory": [],
        "evaluations": [],
        "activityLogs": [
            {
                "id": f"log_{uuid.uuid4().hex[:8]}",
                "timestamp": _now_iso(),
                "documentId": doc_id,
                "detectedIntent": "INGEST_PDF",
                "intentConfidence": 1.0,
                "intentReasoning": "PDF ingestion, PyMuPDF page extraction, chunking, and ChromaDB indexing.",
                "selectedAgent": "Ingestion & ChromaDB Indexer",
                "status": "completed",
                "inputSummary": f"{filename} ({parsed['pageCount']} pages, {parsed['wordCount']} words)",
                "outputSummary": f"Indexed {len(chunks)} chunks into {collection_name}",
                "processingTimeMs": int((time.time() - start) * 1000),
                "selectedTools": ["PyMuPDF(fitz)", "RecursiveCharacterTextSplitter", "ChromaDB"],
                "lcelPipeline": "PDFBytes -> PyMuPDF -> Chunker -> GeminiEmbeddings -> ChromaDB",
                "ragUsed": True,
                "retrievedChunksCount": len(chunks),
            }
        ],
    }
    return workspace


def load_sample_paper(
    store: PaperwiseChromaStore,
    chunk_size: int = 900,
    chunk_overlap: int = 150,
    existing_workspaces: Optional[Dict[str, Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    if not SAMPLE_PAPER_PATH.exists():
        raise FileNotFoundError(
            f"Built-in sample PDF not found at {SAMPLE_PAPER_PATH}."
        )
    return ingest_pdf_bytes(
        pdf_bytes=SAMPLE_PAPER_PATH.read_bytes(),
        filename=SAMPLE_PAPER_PATH.name,
        store=store,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        is_sample=True,
        existing_workspaces=existing_workspaces,
    )


def run_summarizer(ws: Dict[str, Any], model_name: Optional[str] = None) -> Dict[str, Any]:
    start = time.time()
    try:
        agent = SummarizerAgent(get_llm(model_name=model_name))
        summary = agent.run(
            ws["metadata"]["filename"],
            ws["metadata"]["pageCount"],
            ws["pages"],
        )
    except Exception as exc:
        raise _format_gemini_error(exc, "Summarizer Agent") from exc

    summary["generatedAt"] = _now_iso()
    ws["summary"] = summary
    _append_log(
        ws,
        {
            "id": f"log_{uuid.uuid4().hex[:8]}",
            "timestamp": _now_iso(),
            "documentId": ws["metadata"]["id"],
            "detectedIntent": "SUMMARIZE_PAPER",
            "intentConfidence": 1.0,
            "intentReasoning": "Structured summarization and methodology synthesis requested.",
            "selectedAgent": "Summarizer Agent",
            "status": "completed",
            "inputSummary": ws["metadata"]["title"],
            "outputSummary": (
                f"Generated summary with {len(summary.get('objectives', []))} objectives "
                f"and {len(summary.get('keyTakeaways', []))} takeaways."
            ),
            "processingTimeMs": int((time.time() - start) * 1000),
            "selectedTools": ["PyMuPDFText", "GeminiChatModel", "PydanticOutputParser"],
            "lcelPipeline": "SUMMARIZER_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser",
            "ragUsed": False,
            "retrievedChunksCount": 0,
        },
    )
    return summary


def run_concept_extractor(ws: Dict[str, Any], model_name: Optional[str] = None) -> Dict[str, Any]:
    start = time.time()
    try:
        agent = ConceptExtractorAgent(get_llm(model_name=model_name))
        concepts = agent.run(
            ws["metadata"]["title"],
            ws["metadata"]["pageCount"],
            ws["pages"],
        )
    except Exception as exc:
        raise _format_gemini_error(exc, "Concept-Extractor Agent") from exc

    concepts["generatedAt"] = _now_iso()
    ws["concepts"] = concepts
    _append_log(
        ws,
        {
            "id": f"log_{uuid.uuid4().hex[:8]}",
            "timestamp": _now_iso(),
            "documentId": ws["metadata"]["id"],
            "detectedIntent": "EXTRACT_CONCEPTS",
            "intentConfidence": 1.0,
            "intentReasoning": "Concept, methodology, research gap, and glossary extraction requested.",
            "selectedAgent": "Concept-Extractor Agent",
            "status": "completed",
            "inputSummary": ws["metadata"]["title"],
            "outputSummary": (
                f"Extracted {len(concepts.get('importantConcepts', []))} concepts, "
                f"{len(concepts.get('algorithmsAndMethods', []))} methods, "
                f"and {len(concepts.get('limitations', []))} research gaps/limitations."
            ),
            "processingTimeMs": int((time.time() - start) * 1000),
            "selectedTools": ["GeminiChatModel", "PydanticOutputParser"],
            "lcelPipeline": "CONCEPT_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser",
            "ragUsed": False,
            "retrievedChunksCount": 0,
        },
    )
    return concepts


def run_slide_generator(
    ws: Dict[str, Any],
    slide_count: int = 10,
    theme: str = "oxford-navy",
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    start = time.time()
    try:
        agent = SlideGeneratorAgent(get_llm(model_name=model_name))
        deck = agent.run(
            ws["metadata"]["title"],
            ws["metadata"]["authors"],
            ws["metadata"]["pageCount"],
            ws["pages"],
            slide_count=int(slide_count),
            theme=theme,
        )
    except Exception as exc:
        raise _format_gemini_error(exc, "Slide-Generator Agent") from exc

    deck["generatedAt"] = _now_iso()
    ws["presentation"] = deck
    _append_log(
        ws,
        {
            "id": f"log_{uuid.uuid4().hex[:8]}",
            "timestamp": _now_iso(),
            "documentId": ws["metadata"]["id"],
            "detectedIntent": "GENERATE_SLIDES",
            "intentConfidence": 1.0,
            "intentReasoning": f"Presentation generation ({slide_count} slides, {theme}).",
            "selectedAgent": "Slide-Generator Agent",
            "status": "completed",
            "inputSummary": f"{ws['metadata']['title']} · {slide_count} slides",
            "outputSummary": f"Generated {deck['slideCount']} slides with speaker notes.",
            "processingTimeMs": int((time.time() - start) * 1000),
            "selectedTools": ["GeminiChatModel", "PydanticOutputParser", "python-pptx"],
            "lcelPipeline": "SLIDE_PROMPT | ChatGoogleGenerativeAI | PydanticOutputParser",
            "ragUsed": False,
            "retrievedChunksCount": 0,
        },
    )
    return deck


def run_viva_generator(
    ws: Dict[str, Any],
    store: PaperwiseChromaStore,
    min_questions: int = 20,
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    start = time.time()
    try:
        agent = VivaAgent(get_llm(model_name=model_name), store)
        viva = agent.generate_questions(
            ws["metadata"]["title"],
            ws["metadata"]["pageCount"],
            ws["pages"],
            min_questions=int(min_questions),
        )
    except Exception as exc:
        raise _format_gemini_error(exc, "Viva Generator Agent") from exc

    viva["generatedAt"] = _now_iso()
    ws["viva"] = viva
    _append_log(
        ws,
        {
            "id": f"log_{uuid.uuid4().hex[:8]}",
            "timestamp": _now_iso(),
            "documentId": ws["metadata"]["id"],
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
        },
    )
    return viva


def run_viva_evaluation(
    ws: Dict[str, Any],
    store: PaperwiseChromaStore,
    question_id: str,
    user_answer: str,
    top_k: int = 5,
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    if not ws.get("viva"):
        raise ValueError("Generate the Viva Question Bank before evaluating answers.")
    question = next((q for q in ws["viva"]["questions"] if q["id"] == question_id), None)
    if not question:
        raise ValueError("Selected viva question was not found.")
    if not user_answer.strip():
        raise ValueError("Please enter an answer before submitting for evaluation.")

    start = time.time()
    doc_id = ws["metadata"]["id"]
    try:
        agent = VivaAgent(get_llm(model_name=model_name), store)
        evaluation = agent.evaluate_answer(
            doc_id,
            question,
            user_answer.strip(),
            top_k=int(top_k),
            fallback_chunks=ws.get("chunks"),
        )
    except Exception as exc:
        raise _format_gemini_error(exc, "Viva Answer Evaluator") from exc

    evaluation["evaluatedAt"] = _now_iso()
    ws["evaluations"] = [evaluation] + [
        e for e in ws.get("evaluations", []) if e["questionId"] != question_id
    ]
    _append_log(
        ws,
        {
            "id": f"log_{uuid.uuid4().hex[:8]}",
            "timestamp": _now_iso(),
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
            "retrievedChunksCount": int(top_k),
        },
    )
    return evaluation


def run_rag_chat(
    ws: Dict[str, Any],
    store: PaperwiseChromaStore,
    user_message: str,
    top_k: int = 5,
    model_name: Optional[str] = None,
) -> Dict[str, Any]:
    clean_msg = user_message.strip()
    if not clean_msg:
        raise ValueError("Please enter a question to ask the research paper.")

    doc_id = ws["metadata"]["id"]
    try:
        llm = get_llm(model_name=model_name)
        router = IntentRouterService(llm)
        intent_res = router.classify(clean_msg)

        retriever = PaperwiseRetrieverService(store, llm)
        chat_res = retriever.answer_question(
            document_id=doc_id,
            title=ws["metadata"]["title"],
            authors=ws["metadata"]["authors"],
            page_count=ws["metadata"]["pageCount"],
            user_question=clean_msg,
            chat_history=ws.get("chatHistory", []),
            top_k=int(top_k),
            fallback_chunks=ws.get("chunks"),
        )
    except Exception as exc:
        raise _format_gemini_error(exc, "RAG Chat Agent") from exc

    user_msg = {
        "id": f"msg_{uuid.uuid4().hex[:8]}",
        "role": "user",
        "content": clean_msg,
        "timestamp": _now_iso(),
    }
    assistant_msg = {
        "id": f"msg_{uuid.uuid4().hex[:8]}",
        "role": "assistant",
        "content": chat_res["answer"],
        "timestamp": _now_iso(),
        "detectedIntent": intent_res["intent"],
        "selectedAgent": "RAG Chat Agent",
        "retrievalUsed": chat_res["retrieval_used"],
        "retrievedChunks": chat_res["retrieved_chunks"],
        "pageReferences": chat_res["page_references"],
        "processingTimeMs": chat_res["latency_ms"],
    }
    ws.setdefault("chatHistory", []).append(user_msg)
    ws["chatHistory"].append(assistant_msg)
    _append_log(
        ws,
        {
            "id": f"log_{uuid.uuid4().hex[:8]}",
            "timestamp": _now_iso(),
            "documentId": doc_id,
            "detectedIntent": intent_res["intent"],
            "intentConfidence": intent_res["confidence"],
            "intentReasoning": intent_res["reasoning"],
            "selectedAgent": "RAG Chat Agent",
            "status": "completed",
            "inputSummary": clean_msg[:120],
            "outputSummary": f"Retrieved {len(chat_res['retrieved_chunks'])} chunks from ChromaDB.",
            "processingTimeMs": chat_res["latency_ms"],
            "selectedTools": ["IntentRouter", "ChromaDBRetriever", "ReActRAGChain"],
            "lcelPipeline": "ChromaRetriever | RAG_CHAT_PROMPT | ChatGoogleGenerativeAI | StrOutputParser",
            "ragUsed": chat_res["retrieval_used"],
            "retrievedChunksCount": len(chat_res["retrieved_chunks"]),
        },
    )
    return assistant_msg


def route_natural_language_task(
    ws: Dict[str, Any],
    store: PaperwiseChromaStore,
    prompt: str,
    settings: Dict[str, Any],
) -> Dict[str, Any]:
    clean_prompt = prompt.strip()
    if not clean_prompt:
        raise ValueError("Please enter a natural-language instruction.")

    try:
        llm = get_llm(model_name=settings.get("activeModel"))
        router = IntentRouterService(llm)
        classification = router.classify(clean_prompt)
    except Exception as exc:
        raise _format_gemini_error(exc, "Intent Router") from exc

    intent = classification["intent"]
    model_name = settings.get("activeModel")

    if intent == "SUMMARIZE_PAPER":
        run_summarizer(ws, model_name=model_name)
        return {"classification": classification, "targetTab": "summary", "workspace": ws}
    if intent == "EXTRACT_CONCEPTS":
        run_concept_extractor(ws, model_name=model_name)
        return {"classification": classification, "targetTab": "concepts", "workspace": ws}
    if intent == "GENERATE_SLIDES":
        run_slide_generator(
            ws,
            slide_count=int(settings.get("defaultSlideCount", 10)),
            theme=str(settings.get("defaultSlideTheme", "oxford-navy")),
            model_name=model_name,
        )
        return {"classification": classification, "targetTab": "slides", "workspace": ws}
    if intent == "GENERATE_VIVA":
        run_viva_generator(ws, store, min_questions=20, model_name=model_name)
        return {"classification": classification, "targetTab": "viva", "workspace": ws}
    if intent == "EVALUATE_VIVA_ANSWER":
        return {"classification": classification, "targetTab": "practice", "workspace": ws}

    run_rag_chat(
        ws,
        store,
        user_message=clean_prompt,
        top_k=int(settings.get("topK", 5)),
        model_name=model_name,
    )
    return {"classification": classification, "targetTab": "chat", "workspace": ws}


def inspect_rag(
    ws: Dict[str, Any],
    store: PaperwiseChromaStore,
    query: str = "",
    top_k: int = 5,
) -> Dict[str, Any]:
    start = time.time()
    doc_id = ws["metadata"]["id"]
    try:
        res = store.query(
            document_id=doc_id,
            query_text=query,
            top_k=int(top_k),
            fallback_chunks=ws.get("chunks"),
        )
    except Exception as exc:
        raise _format_gemini_error(exc, "RAG Vector Inspector") from exc

    return {
        "collectionName": res["collection_name"],
        "documentId": doc_id,
        "totalChunks": res["total_chunks"],
        "embeddingModel": res["embedding_model"],
        "query": query,
        "topK": int(top_k),
        "retrievalStatus": "success" if res["chunks"] else "empty",
        "processingTimeMs": int((time.time() - start) * 1000),
        "retrievedChunks": res["chunks"],
    }


def get_pptx_bytes(ws: Dict[str, Any]) -> bytes:
    if not ws.get("presentation"):
        raise ValueError("Generate a presentation before exporting PPTX.")
    return build_pptx_bytes(ws["presentation"])


def get_summary_docx_bytes(ws: Dict[str, Any]) -> bytes:
    if not ws.get("summary"):
        raise ValueError("Generate a summary before exporting DOCX.")
    return build_summary_docx_bytes(ws["summary"])


def get_viva_docx_bytes(ws: Dict[str, Any]) -> bytes:
    if not ws.get("viva"):
        raise ValueError("Generate viva questions before exporting DOCX.")
    return build_viva_docx_bytes(ws["metadata"]["title"], ws["viva"])


def get_prompt_specs() -> List[Dict[str, Any]]:
    return [
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
            "technique": "Zero-Shot Entity, Methodology, Gap & Glossary Extraction",
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
