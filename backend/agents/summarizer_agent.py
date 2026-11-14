from typing import List
from langchain_core.output_parsers import PydanticOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel
from backend.prompts.templates import SUMMARIZER_PROMPT


class SimpleExplanation(BaseModel):
    term: str
    explanation: str


class SectionPageRange(BaseModel):
    section: str
    pageRange: str


class StructuredSummaryModel(BaseModel):
    title: str
    authors: str
    abstractSummary: str
    introductionSummary: str
    problemStatement: str
    objectives: List[str]
    methodology: str
    results: str
    conclusion: str
    keyTakeaways: List[str]
    simpleExplanations: List[SimpleExplanation]
    sectionPages: List[SectionPageRange]


class SummarizerAgent:
    def __init__(self, llm: ChatGoogleGenerativeAI) -> None:
        self.parser = PydanticOutputParser(pydantic_object=StructuredSummaryModel)
        self.chain = SUMMARIZER_PROMPT | llm | self.parser

    def run(self, filename: str, page_count: int, pages: List[dict]) -> dict:
        pages_text = "\n\n".join(f"[PAGE {p['pageNumber']}]\n{p['text']}" for p in pages)
        result = self.chain.invoke({
            "filename": filename,
            "page_count": page_count,
            "paper_pages_text": pages_text[:48000],
            "format_instructions": self.parser.get_format_instructions(),
        })
        return result.model_dump()
