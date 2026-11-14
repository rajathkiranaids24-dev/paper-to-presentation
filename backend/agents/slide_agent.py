from typing import List, Optional
from langchain_core.output_parsers import PydanticOutputParser
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel
from backend.prompts.templates import SLIDE_PROMPT
from backend.utils.config import get_chat_llm


class ChartPoint(BaseModel):
    label: str
    value: float
    unit: Optional[str] = None


class SlideModel(BaseModel):
    slideNumber: int
    sectionType: str
    title: str
    subtitle: Optional[str] = None
    bullets: List[str]
    speakerNotes: str
    visualSuggestion: str
    diagramNodes: Optional[List[str]] = None
    chartData: Optional[List[ChartPoint]] = None
    pageReferences: str


class SlideDeckModel(BaseModel):
    paperTitle: str
    sourceInfo: str
    slides: List[SlideModel]


class SlideGeneratorAgent:
    def __init__(self, llm: Optional[ChatGoogleGenerativeAI] = None) -> None:
        resolved_llm = llm or get_chat_llm()
        self.parser = PydanticOutputParser(pydantic_object=SlideDeckModel)
        self.chain = SLIDE_PROMPT | resolved_llm | self.parser

    def run(
        self,
        title: str,
        authors: str,
        page_count: int,
        pages: List[dict],
        slide_count: int = 10,
        theme: str = "oxford-navy",
    ) -> dict:
        pages_text = "\n\n".join(f"[PAGE {p['pageNumber']}]\n{p['text']}" for p in pages)
        result = self.chain.invoke({
            "slide_count": slide_count,
            "theme": theme,
            "title": title,
            "authors": authors,
            "page_count": page_count,
            "paper_pages_text": pages_text[:48000],
            "format_instructions": self.parser.get_format_instructions(),
        })
        deck = result.model_dump()
        deck["theme"] = theme
        deck["slideCount"] = len(deck["slides"])
        return deck
