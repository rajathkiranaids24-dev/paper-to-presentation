import time
from typing import Any, Dict, List, Optional
from langchain_core.output_parsers import StrOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from backend.prompts.templates import RAG_CHAT_PROMPT
from backend.rag.vector_store import PaperwiseChromaStore


class PaperwiseRetrieverService:
    """ReAct-style Agentic RAG retriever and grounded QA chain."""

    def __init__(self, store: PaperwiseChromaStore, llm: ChatGoogleGenerativeAI) -> None:
        self.store = store
        self.chain = RAG_CHAT_PROMPT | llm | StrOutputParser()

    @staticmethod
    def needs_retrieval(question: str) -> bool:
        q = question.strip().lower()
        return q not in {
            "what is the title?",
            "how many pages does this paper have?",
            "who are the authors?",
        }

    def answer_question(
        self,
        document_id: str,
        title: str,
        authors: str,
        page_count: int,
        user_question: str,
        chat_history: List[Dict[str, str]],
        top_k: int = 5,
        fallback_chunks: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        start = time.time()
        use_rag = self.needs_retrieval(user_question)
        retrieved_chunks: List[Dict[str, Any]] = []

        if use_rag:
            res = self.store.query(
                document_id=document_id,
                query_text=user_question,
                top_k=top_k,
                fallback_chunks=fallback_chunks,
            )
            retrieved_chunks = res["chunks"]
            context_str = "\n\n---\n\n".join(
                f"Chunk #{idx + 1} [Page {c['page_number']} | Score: {c['score']:.4f} | {c['section_hint']}]\n{c['text']}"
                for idx, c in enumerate(retrieved_chunks)
            )
        else:
            context_str = f"Title: {title}\nAuthors: {authors}\nPages: {page_count}"

        history_str = "\n".join(
            f"{m['role'].capitalize()}: {m['content']}" for m in chat_history[-6:]
        ) or "No prior conversation."

        answer = self.chain.invoke({
            "title": title,
            "page_count": page_count,
            "chat_history": history_str,
            "retrieved_context": context_str,
            "user_question": user_question,
        })

        pages = sorted({c["page_number"] for c in retrieved_chunks if c["score"] >= 0.35})
        return {
            "answer": answer,
            "retrieval_used": use_rag,
            "retrieved_chunks": retrieved_chunks,
            "page_references": pages,
            "latency_ms": int((time.time() - start) * 1000),
        }
