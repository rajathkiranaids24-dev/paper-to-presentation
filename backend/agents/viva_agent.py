from typing import Any, Dict, List, Literal, Optional
from langchain_core.output_parsers import PydanticOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel
from backend.prompts.templates import VIVA_EVAL_PROMPT, VIVA_PROMPT
from backend.rag.vector_store import PaperwiseChromaStore


class VivaQuestionModel(BaseModel):
    id: str
    category: Literal[
        "Basic",
        "Conceptual",
        "Technical",
        "Methodology",
        "Results-based",
        "Challenging Examiner",
    ]
    difficulty: Literal["Easy", "Medium", "Hard"]
    question: str
    modelAnswer: str
    beginnerExplanation: str
    pageReference: str


class VivaBankModel(BaseModel):
    questions: List[VivaQuestionModel]


class VivaEvalModel(BaseModel):
    score: int
    verdict: str
    strengths: List[str]
    weaknesses: List[str]
    missingKeyPoints: List[str]
    improvedModelAnswer: str
    pageReferences: List[str]


class VivaAgent:
    def __init__(self, llm: ChatGoogleGenerativeAI, store: PaperwiseChromaStore) -> None:
        self.store = store
        self.gen_parser = PydanticOutputParser(pydantic_object=VivaBankModel)
        self.eval_parser = PydanticOutputParser(pydantic_object=VivaEvalModel)
        self.gen_chain = VIVA_PROMPT | llm | self.gen_parser
        self.eval_chain = VIVA_EVAL_PROMPT | llm | self.eval_parser

    def generate_questions(
        self, title: str, page_count: int, pages: List[dict], min_questions: int = 20
    ) -> dict:
        pages_text = "\n\n".join(f"[PAGE {p['pageNumber']}]\n{p['text']}" for p in pages)
        res = self.gen_chain.invoke({
            "min_questions": max(20, min_questions),
            "title": title,
            "page_count": page_count,
            "paper_pages_text": pages_text[:48000],
            "format_instructions": self.gen_parser.get_format_instructions(),
        })
        questions = [q.model_dump() for q in res.questions]
        return {"totalCount": len(questions), "questions": questions}

    def evaluate_answer(
        self,
        document_id: str,
        question: dict,
        user_answer: str,
        top_k: int = 4,
        fallback_chunks: Optional[List[Dict[str, Any]]] = None,
    ) -> dict:
        retrieval = self.store.query(
            document_id=document_id,
            query_text=f"{question['question']} {user_answer}",
            top_k=top_k,
            fallback_chunks=fallback_chunks,
        )
        retrieved_ctx = "\n\n".join(
            f"[Page {c['page_number']} | Similarity {c['score']:.3f}]\n{c['text']}"
            for c in retrieval["chunks"]
        )
        res = self.eval_chain.invoke({
            "category": question["category"],
            "difficulty": question["difficulty"],
            "question": question["question"],
            "model_answer": question["modelAnswer"],
            "retrieved_context": retrieved_ctx,
            "user_answer": user_answer,
            "format_instructions": self.eval_parser.get_format_instructions(),
        })
        out = res.model_dump()
        out["score"] = max(0, min(10, int(out["score"])))
        out["maxScore"] = 10
        out["questionId"] = question["id"]
        out["question"] = question["question"]
        out["userAnswer"] = user_answer
        return out
