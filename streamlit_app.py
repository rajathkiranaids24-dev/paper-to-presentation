import os
import sys
import uuid
from pathlib import Path

import streamlit as st

# Make the existing backend modules importable from the repository's backend folder.
ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

# Read the key from Streamlit Cloud Secrets (or local environment variables).
try:
    secret_key = st.secrets.get("GEMINI_API_KEY", "")
except Exception:
    secret_key = ""

api_key = secret_key or os.getenv("GEMINI_API_KEY", "")
if api_key:
    os.environ["GEMINI_API_KEY"] = api_key

from langchain_google_genai import ChatGoogleGenerativeAI
from services.pdf_processor import extract_pdf_pages, chunk_pages
from agents.summarizer_agent import SummarizerAgent
from agents.concept_agent import ConceptExtractorAgent
from agents.slide_agent import SlideGeneratorAgent
from agents.viva_agent import VivaAgent
from rag.vector_store import PaperwiseChromaStore
from rag.retriever import PaperwiseRetrieverService
from services.pptx_generator import build_pptx_bytes


st.set_page_config(
    page_title="Paper to Presentation | PAPERWISE AI",
    page_icon="📄",
    layout="wide",
)

st.markdown(
    """
    <style>
    .main-title {font-size: 2.25rem; font-weight: 800; margin-bottom: 0.15rem;}
    .sub-title {color: #8b95a7; margin-bottom: 1.5rem;}
    div[data-testid="stMetric"] {background: rgba(120,130,150,.08); padding: 12px; border-radius: 12px;}
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown('<div class="main-title">📄 PAPERWISE AI</div>', unsafe_allow_html=True)
st.markdown(
    '<div class="sub-title">Transform research papers into summaries, concepts, presentations and viva preparation.</div>',
    unsafe_allow_html=True,
)

if not api_key:
    st.error("Gemini API key is missing. Add GEMINI_API_KEY in Streamlit → App settings → Secrets.")
    st.stop()


@st.cache_resource
def get_llm():
    return ChatGoogleGenerativeAI(
        model=os.getenv("GEMINI_CHAT_MODEL", "gemini-2.5-flash"),
        google_api_key=os.environ["GEMINI_API_KEY"],
        temperature=0.2,
    )


@st.cache_resource
def get_vector_store():
    # Chroma data is stored on the app's local filesystem.
    return PaperwiseChromaStore()


def init_state():
    defaults = {
        "workspace": None,
        "chat_history": [],
        "viva_question_index": 0,
        "viva_evaluations": [],
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


init_state()
llm = get_llm()
store = get_vector_store()


def render_items(items, heading=None):
    if heading:
        st.markdown(f"**{heading}**")
    if not items:
        st.caption("No items returned.")
        return
    for item in items:
        if isinstance(item, dict):
            title = item.get("name") or item.get("term") or item.get("section") or item.get("question") or ""
            detail = item.get("definition") or item.get("explanation") or item.get("meaning") or item.get("purpose") or ""
            if title:
                st.markdown(f"**{title}**")
            if detail:
                st.write(detail)
            for key, value in item.items():
                if key not in {"name", "term", "section", "question", "definition", "explanation", "meaning", "purpose"} and value:
                    if isinstance(value, list):
                        st.write(", ".join(map(str, value)))
                    else:
                        st.caption(f"{key}: {value}")
        else:
            st.write(f"• {item}")


def current_workspace():
    return st.session_state.workspace


with st.sidebar:
    st.header("Workspace")
    st.caption("Upload a text-based research paper PDF to begin.")
    uploaded = st.file_uploader("Upload research paper", type=["pdf"])
    if st.button("Process PDF", type="primary", disabled=uploaded is None, use_container_width=True):
        try:
            with st.spinner("Extracting pages and indexing paper content..."):
                pdf_bytes = uploaded.getvalue()
                parsed = extract_pdf_pages(pdf_bytes, uploaded.name)
                document_id = f"doc_{uuid.uuid4().hex[:10]}"
                chunks = chunk_pages(
                    document_id=document_id,
                    pages=parsed["pages"],
                    chunk_size=int(os.getenv("CHUNK_SIZE", "900")),
                    chunk_overlap=int(os.getenv("CHUNK_OVERLAP", "150")),
                )
                collection_name = store.index_chunks(document_id, chunks)
                st.session_state.workspace = {
                    "metadata": {
                        "id": document_id,
                        "filename": uploaded.name,
                        "title": parsed["title"],
                        "authors": parsed["authors"],
                        "pageCount": parsed["pageCount"],
                        "wordCount": parsed["wordCount"],
                        "chunkCount": len(chunks),
                        "collectionName": collection_name,
                    },
                    "pages": parsed["pages"],
                    "summary": None,
                    "concepts": None,
                    "presentation": None,
                    "viva": None,
                }
                st.session_state.chat_history = []
                st.session_state.viva_evaluations = []
            st.success("PDF processed and indexed successfully.")
        except Exception as exc:
            st.error(f"PDF processing failed: {exc}")

    if st.button("Clear current workspace", use_container_width=True):
        st.session_state.workspace = None
        st.session_state.chat_history = []
        st.session_state.viva_evaluations = []
        st.rerun()

ws = current_workspace()

if ws is None:
    st.info("Upload a research paper PDF in the left sidebar, then select **Process PDF**.")
    st.markdown("### What you can do")
    c1, c2, c3 = st.columns(3)
    c1.markdown("#### 📝 Paper summary\nGenerate a structured academic summary.")
    c2.markdown("#### 🧠 Concepts\nExtract definitions, algorithms and findings.")
    c3.markdown("#### 🎞️ Presentation\nGenerate and download a PowerPoint deck.")
    c4, c5, c6 = st.columns(3)
    c4.markdown("#### 🎓 Viva preparation\nGenerate examiner-style questions.")
    c5.markdown("#### 💬 Ask your paper\nAsk questions grounded in retrieved paper passages.")
    c6.markdown("#### 📚 Page references\nReview source page references where available.")
    st.stop()

meta = ws["metadata"]
st.subheader(meta.get("title") or meta["filename"])
st.caption(f"Authors: {meta.get('authors', 'Not detected')}")

m1, m2, m3, m4 = st.columns(4)
m1.metric("Pages", meta["pageCount"])
m2.metric("Words", f'{meta["wordCount"]:,}')
m3.metric("Indexed chunks", meta["chunkCount"])
m4.metric("File", meta["filename"])

summary_tab, concepts_tab, slides_tab, viva_tab, chat_tab = st.tabs(
    ["📝 Summary", "🧠 Concepts", "🎞️ Slides", "🎓 Viva", "💬 Ask the Paper"]
)

with summary_tab:
    st.subheader("AI Research Paper Summary")
    if st.button("Generate structured summary", key="summarize", type="primary"):
        try:
            with st.spinner("Summarizer Agent is analyzing the paper..."):
                result = SummarizerAgent(llm).run(
                    meta["filename"], meta["pageCount"], ws["pages"]
                )
                ws["summary"] = result
            st.success("Summary generated.")
        except Exception as exc:
            st.error(f"Summary generation failed: {exc}")

    result = ws.get("summary")
    if result:
        st.markdown(f"### {result.get('title', meta['title'])}")
        st.markdown("**Abstract**")
        st.write(result.get("abstractSummary", ""))
        for label, key in [
            ("Introduction", "introductionSummary"),
            ("Problem statement", "problemStatement"),
            ("Methodology", "methodology"),
            ("Results", "results"),
            ("Conclusion", "conclusion"),
        ]:
            with st.expander(label, expanded=(key == "problemStatement")):
                st.write(result.get(key, ""))
        render_items(result.get("objectives", []), "Objectives")
        render_items(result.get("keyTakeaways", []), "Key takeaways")
        render_items(result.get("simpleExplanations", []), "Simple explanations")
        render_items(result.get("sectionPages", []), "Section page ranges")
        st.download_button(
            "Download summary as text",
            data="\n\n".join(
                f"{label}\n{result.get(key, '')}"
                for label, key in [
                    ("Abstract", "abstractSummary"),
                    ("Introduction", "introductionSummary"),
                    ("Problem statement", "problemStatement"),
                    ("Methodology", "methodology"),
                    ("Results", "results"),
                    ("Conclusion", "conclusion"),
                ]
            ),
            file_name="paper_summary.txt",
            mime="text/plain",
        )

with concepts_tab:
    st.subheader("Concept and Algorithm Extraction")
    if st.button("Extract concepts and methods", key="concepts", type="primary"):
        try:
            with st.spinner("Concept-Extractor Agent is working..."):
                ws["concepts"] = ConceptExtractorAgent(llm).run(
                    meta["title"], meta["pageCount"], ws["pages"]
                )
            st.success("Concept extraction completed.")
        except Exception as exc:
            st.error(f"Concept extraction failed: {exc}")

    concepts = ws.get("concepts")
    if concepts:
        render_items(concepts.get("importantConcepts", []), "Important concepts")
        render_items(concepts.get("algorithmsAndMethods", []), "Algorithms and methods")
        render_items(concepts.get("researchContributions", []), "Research contributions")
        render_items(concepts.get("importantFindings", []), "Important findings")
        render_items(concepts.get("limitations", []), "Limitations")
        render_items(concepts.get("futureScope", []), "Future scope")
        render_items(concepts.get("technicalGlossary", []), "Technical glossary")

with slides_tab:
    st.subheader("PowerPoint Presentation Generator")
    slide_count = st.slider("Number of slides", min_value=5, max_value=20, value=10)
    theme = st.selectbox(
        "Presentation theme",
        ["oxford-navy", "slate-academic", "violet-research"],
        format_func=lambda x: {
            "oxford-navy": "Oxford Navy",
            "slate-academic": "Slate Academic",
            "violet-research": "Violet Research",
        }[x],
    )
    if st.button("Generate PowerPoint", key="slides", type="primary"):
        try:
            with st.spinner("Slide-Generator Agent is creating your deck..."):
                ws["presentation"] = SlideGeneratorAgent(llm).run(
                    meta["title"],
                    meta["authors"],
                    meta["pageCount"],
                    ws["pages"],
                    slide_count=slide_count,
                    theme=theme,
                )
            st.success("Presentation generated.")
        except Exception as exc:
            st.error(f"Slide generation failed: {exc}")

    deck = ws.get("presentation")
    if deck:
        st.success(f'{deck.get("slideCount", len(deck.get("slides", [])))} slides ready.')
        for slide in deck.get("slides", []):
            with st.expander(f'Slide {slide.get("slideNumber")}: {slide.get("title", "")}'):
                st.write(slide.get("subtitle", ""))
                for bullet in slide.get("bullets", []):
                    st.write(f"• {bullet}")
                if slide.get("speakerNotes"):
                    st.markdown("**Speaker notes**")
                    st.write(slide["speakerNotes"])
                if slide.get("visualSuggestion"):
                    st.caption(f'Visual suggestion: {slide["visualSuggestion"]}')
        pptx_data = build_pptx_bytes(deck)
        st.download_button(
            "⬇️ Download PowerPoint (.pptx)",
            data=pptx_data,
            file_name="paperwise_presentation.pptx",
            mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            type="primary",
        )

with viva_tab:
    st.subheader("Viva Preparation")
    question_count = st.slider("Minimum viva questions", 20, 40, 20, step=5)
    if st.button("Generate viva questions", key="viva", type="primary"):
        try:
            with st.spinner("Viva Agent is preparing examiner-style questions..."):
                ws["viva"] = VivaAgent(llm, store).generate_questions(
                    meta["title"], meta["pageCount"], ws["pages"], min_questions=question_count
                )
                st.session_state.viva_question_index = 0
            st.success("Viva question bank generated.")
        except Exception as exc:
            st.error(f"Viva generation failed: {exc}")

    viva = ws.get("viva")
    if viva and viva.get("questions"):
        questions = viva["questions"]
        idx = min(st.session_state.viva_question_index, len(questions) - 1)
        q = questions[idx]
        st.caption(f'Question {idx + 1} of {len(questions)} · {q.get("category")} · {q.get("difficulty")}')
        st.markdown(f"**{q.get('question')}**")
        with st.expander("Show model answer"):
            st.write(q.get("modelAnswer", ""))
            st.info(q.get("beginnerExplanation", ""))
            st.caption(f'Page reference: {q.get("pageReference", "Not specified")}')
        answer = st.text_area("Your answer", key=f"answer_{q.get('id')}", height=130)
        if st.button("Evaluate my answer", key=f"evaluate_{q.get('id')}"):
            if not answer.strip():
                st.warning("Write an answer before evaluating.")
            else:
                try:
                    with st.spinner("Evaluating your answer against the paper..."):
                        evaluation = VivaAgent(llm, store).evaluate_answer(
                            meta["id"], q, answer
                        )
                        st.session_state.viva_evaluations.append(evaluation)
                    st.success(f'Score: {evaluation["score"]}/10 — {evaluation["verdict"]}')
                    render_items(evaluation.get("strengths", []), "Strengths")
                    render_items(evaluation.get("weaknesses", []), "Areas to improve")
                    render_items(evaluation.get("missingKeyPoints", []), "Missing key points")
                    st.markdown("**Improved answer**")
                    st.write(evaluation.get("improvedModelAnswer", ""))
                except Exception as exc:
                    st.error(f"Answer evaluation failed: {exc}")
        left, right = st.columns(2)
        with left:
            if st.button("← Previous", disabled=(idx == 0)):
                st.session_state.viva_question_index -= 1
                st.rerun()
        with right:
            if st.button("Next →", disabled=(idx >= len(questions) - 1)):
                st.session_state.viva_question_index += 1
                st.rerun()

with chat_tab:
    st.subheader("Ask questions about your research paper")
    st.caption("Answers use retrieved passages from the uploaded paper.")
    for message in st.session_state.chat_history:
        with st.chat_message(message["role"]):
            st.write(message["content"])

    prompt = st.chat_input("Ask something about the paper...")
    if prompt:
        st.session_state.chat_history.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.write(prompt)
        try:
            with st.chat_message("assistant"):
                with st.spinner("Searching the paper and preparing an answer..."):
                    response = PaperwiseRetrieverService(store, llm).answer_question(
                        document_id=meta["id"],
                        title=meta["title"],
                        authors=meta["authors"],
                        page_count=meta["pageCount"],
                        user_question=prompt,
                        chat_history=st.session_state.chat_history[:-1],
                        top_k=int(os.getenv("TOP_K", "5")),
                    )
                st.write(response["answer"])
                if response.get("page_references"):
                    st.caption("Relevant pages: " + ", ".join(map(str, response["page_references"])))
            st.session_state.chat_history.append(
                {"role": "assistant", "content": response["answer"]}
            )
        except Exception as exc:
            st.error(f"Paper chat failed: {exc}")
            st.session_state.chat_history.pop()

st.divider()
st.caption("PAPERWISE AI · Research Paper Analysis & Presentation Assistant")
