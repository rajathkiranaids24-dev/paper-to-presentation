import time
from typing import Literal, Optional
from langchain_core.output_parsers import JsonOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field
from backend.prompts.templates import INTENT_ROUTER_PROMPT
from backend.utils.config import get_chat_llm


class IntentDecision(BaseModel):
    intent: Literal[
        "SUMMARIZE_PAPER",
        "EXTRACT_CONCEPTS",
        "GENERATE_SLIDES",
        "GENERATE_VIVA",
        "ASK_PAPER_QUESTION",
        "EVALUATE_VIVA_ANSWER",
    ]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    selectedAgent: str
    needsRetrieval: bool


class IntentRouterService:
    """Few-Shot LCEL Intent Detection & Routing Service."""

    def __init__(self, llm: Optional[ChatGoogleGenerativeAI] = None) -> None:
        resolved_llm = llm or get_chat_llm()
        self.parser = JsonOutputParser(pydantic_object=IntentDecision)
        self.chain = INTENT_ROUTER_PROMPT | resolved_llm | self.parser

    def classify(self, user_query: str) -> dict:
        start = time.time()
        res = self.chain.invoke({
            "user_query": user_query,
            "format_instructions": self.parser.get_format_instructions(),
        })
        res["latency_ms"] = int((time.time() - start) * 1000)
        return res
