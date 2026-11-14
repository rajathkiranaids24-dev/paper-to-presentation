from typing import List, Optional
from langchain_core.output_parsers import PydanticOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel
from backend.prompts.templates import CONCEPT_PROMPT
from backend.utils.config import get_chat_llm


class ConceptItem(BaseModel):
    name: str
    definition: str
    simpleExplanation: str
    pageReference: str


class AlgorithmItem(BaseModel):
    name: str
    purpose: str
    workflow: str
    pageReference: str


class GlossaryItem(BaseModel):
    term: str
    meaning: str


class ExtractedConceptsModel(BaseModel):
    importantConcepts: List[ConceptItem]
    algorithmsAndMethods: List[AlgorithmItem]
    researchContributions: List[str]
    importantFindings: List[str]
    limitations: List[str]
    futureScope: List[str]
    technicalGlossary: List[GlossaryItem]


class ConceptExtractorAgent:
    def __init__(self, llm: Optional[ChatGoogleGenerativeAI] = None) -> None:
        resolved_llm = llm or get_chat_llm()
        self.parser = PydanticOutputParser(pydantic_object=ExtractedConceptsModel)
        self.chain = CONCEPT_PROMPT | resolved_llm | self.parser

    def run(self, title: str, page_count: int, pages: List[dict]) -> dict:
        pages_text = "\n\n".join(f"[PAGE {p['pageNumber']}]\n{p['text']}" for p in pages)
        result = self.chain.invoke({
            "title": title,
            "page_count": page_count,
            "paper_pages_text": pages_text[:48000],
            "format_instructions": self.parser.get_format_instructions(),
        })
        return result.model_dump()
