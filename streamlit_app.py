import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd
import streamlit as st
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

load_dotenv(ROOT_DIR / ".env")
load_dotenv(ROOT_DIR / "backend" / ".env")

from backend.rag.vector_store import PaperwiseChromaStore
from backend.services.paperwise_service import (
    DEFAULT_SETTINGS,
    get_pptx_bytes,
    get_prompt_specs,
    get_summary_docx_bytes,
    get_viva_docx_bytes,
    ingest_pdf_bytes,
    inspect_rag,
    load_sample_paper,
    route_natural_language_task,
    run_concept_extractor,
    run_rag_chat,
    run_slide_generator,
    run_summarizer,
    run_viva_evaluation,
    run_viva_generator,
    verify_gemini_models,
)
from backend.utils.config import (
    get_chat_model_name,
    get_embedding_model_name,
    has_gemini_api_key,
)

st.set_page_config(
    page_title="PAPERWISE — AI Research Command Center",
    page_icon="📘",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Academic Navy Sidebar & Crisp Command-Center Styling
st.markdown(
    """
    <style>
      [data-testid="stSidebar"] {
        background-color: #0B1120;
        color: #E2E8F0;
      }
      [data-testid="stSidebar"] h1,
      [data-testid="stSidebar"] h2,
      [data-testid="stSidebar"] h3,
      [data-testid="stSidebar"] label,
      [data-testid="stSidebar"] p,
      [data-testid="stSidebar"] span {
        color: #E2E8F0;
      }
      .paperwise-slide {
        border: 1px solid #CBD5E1;
        border-radius: 12px;
        padding: 1.5rem 2rem;
        background-color: #FFFFFF;
        margin-bottom: 1rem;
      }
      .paperwise-slide-title {
        border-radius: 12px;
        padding: 2rem 2.25rem;
        background-color: #0F172A;
        color: #F8FAFC;
        margin-bottom: 1rem;
      }
      .paperwise-meta {
        font-size: 0.85rem;
        color: #475569;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        margin-bottom: 0.75rem;
      }
      .paperwise-gap-box {
        border-left: 4px solid #F59E0B;
        background-color: #FFFBEB;
        padding: 0.9rem 1.1rem;
        border-radius: 6px;
        margin-bottom: 0.75rem;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

PAGES = [
    "Dashboard",
    "Upload Research Paper",
    "AI Summary",
    "Concept Extractor",
    "Presentation Generator",
    "Viva Preparation",
    "Viva Practice",
    "Research Paper Chat",
    "Agent Activity Monitor",
    "RAG Inspector",
    "Prompt Engineering",
    "Settings",
]


@st.cache_resource(show_spinner=False)
def get_vector_store() -> PaperwiseChromaStore:
    return PaperwiseChromaStore()


if "workspaces" not in st.session_state:
    st.session_state.workspaces = {}
if "active_paper_id" not in st.session_state:
    st.session_state.active_paper_id = None
if "nav_page" not in st.session_state:
    st.session_state.nav_page = "Dashboard"
if "viva_practice_idx" not in st.session_state:
    st.session_state.viva_practice_idx = 0
if "settings" not in st.session_state:
    st.session_state.settings = dict(DEFAULT_SETTINGS)
st.session_state.settings["activeModel"] = get_chat_model_name()
st.session_state.settings["embeddingModel"] = get_embedding_model_name()
if "last_route_notice" not in st.session_state:
    st.session_state.last_route_notice = None


def get_papers_list() -> List[Dict[str, Any]]:
    workspaces: Dict[str, Dict[str, Any]] = st.session_state.workspaces
    return sorted(
        (ws["metadata"] for ws in workspaces.values()),
        key=lambda m: m.get("uploadedAt", ""),
        reverse=True,
    )


def get_active_workspace() -> Optional[Dict[str, Any]]:
    papers = get_papers_list()
    if not papers:
        st.session_state.active_paper_id = None
        return None
    target_id = st.session_state.active_paper_id
    if not target_id or target_id not in st.session_state.workspaces:
        target_id = papers[0]["id"]
        st.session_state.active_paper_id = target_id
    return st.session_state.workspaces.get(target_id)


def clear_single_workspace(doc_id: str) -> None:
    st.session_state.workspaces.pop(doc_id, None)
    try:
        get_vector_store().delete_document(doc_id)
    except Exception:
        pass
    if st.session_state.active_paper_id == doc_id:
        remaining = get_papers_list()
        st.session_state.active_paper_id = remaining[0]["id"] if remaining else None
    st.session_state.viva_practice_idx = 0


def reset_entire_workspace() -> None:
    store = get_vector_store()
    for doc_id in list(st.session_state.workspaces.keys()):
        try:
            store.delete_document(doc_id)
        except Exception:
            pass
    st.session_state.workspaces = {}
    st.session_state.active_paper_id = None
    st.session_state.viva_practice_idx = 0
    st.session_state.last_route_notice = None


def handle_load_sample() -> None:
    store = get_vector_store()
    cfg = st.session_state.settings
    ws = load_sample_paper(
        store=store,
        chunk_size=int(cfg["chunkSize"]),
        chunk_overlap=int(cfg["chunkOverlap"]),
        existing_workspaces=st.session_state.workspaces,
    )
    doc_id = ws["metadata"]["id"]
    st.session_state.workspaces[doc_id] = ws
    st.session_state.active_paper_id = doc_id


def render_api_key_guard() -> bool:
    if has_gemini_api_key():
        return True
    st.error(
        "**GEMINI_API_KEY is not configured.** Add `GEMINI_API_KEY` in Streamlit Cloud "
        "(`Settings → Secrets → GEMINI_API_KEY = \"your_key\"`) or in `.streamlit/secrets.toml` locally."
    )
    return False


def render_empty_paper_cta() -> None:
    st.info(
        "No research paper is currently loaded. Upload a PDF manuscript or load the built-in 6-page sample paper."
    )
    col1, col2 = st.columns([1, 1])
    with col1:
        if st.button("Go to Upload Research Paper", use_container_width=True):
            st.session_state.nav_page = "Upload Research Paper"
            st.rerun()
    with col2:
        if st.button(
            "Load Sample Paper (ARAG-Lite 6-Page PDF)",
            type="primary",
            use_container_width=True,
        ):
            if not render_api_key_guard():
                return
            with st.spinner("Extracting PDF pages, chunking, and indexing Gemini embeddings into ChromaDB..."):
                try:
                    handle_load_sample()
                    st.success("Sample paper indexed successfully.")
                    st.rerun()
                except Exception as exc:
                    st.error(str(exc))


# --- Sidebar ---
with st.sidebar:
    logo_path = ROOT_DIR / "assets" / "paperwise_logo.svg"
    if logo_path.exists():
        st.image(str(logo_path), width=42)
    st.markdown("## PAPERWISE")
    st.caption("AI Research Command Center")

    selected_page = st.radio(
        "Navigation",
        PAGES,
        index=PAGES.index(st.session_state.nav_page) if st.session_state.nav_page in PAGES else 0,
        label_visibility="collapsed",
    )
    if selected_page != st.session_state.nav_page:
        st.session_state.nav_page = selected_page

    st.divider()
    papers_list = get_papers_list()
    if papers_list:
        titles = {p["id"]: f"{p['title'][:40]} ({p['pageCount']}p)" for p in papers_list}
        ids = [p["id"] for p in papers_list]
        current_idx = ids.index(st.session_state.active_paper_id) if st.session_state.active_paper_id in ids else 0
        chosen_id = st.selectbox(
            "Active Manuscript",
            options=ids,
            index=current_idx,
            format_func=lambda pid: titles.get(pid, pid),
        )
        st.session_state.active_paper_id = chosen_id

        if st.button("Clear Workspace", use_container_width=True):
            reset_entire_workspace()
            st.rerun()
    else:
        st.caption("No PDF loaded yet")

    st.divider()
    api_ready = has_gemini_api_key()
    st.caption(
        f"Runtime: In-Process Python + ChromaDB  \n"
        f"Chat: `{get_chat_model_name()}`  \n"
        f"Embeddings: `{get_embedding_model_name()}`  \n"
        f"Gemini Secret: {'Configured' if api_ready else 'Missing'}"
    )


workspace = get_active_workspace()
page = st.session_state.nav_page
store = get_vector_store()
settings = st.session_state.settings

# ==============================================================================
# 1. DASHBOARD
# ==============================================================================
if page == "Dashboard":
    st.title("PAPERWISE — AI RESEARCH COMMAND CENTER")
    st.caption("Single-service Streamlit runtime · PyMuPDF · LangChain LCEL · Google Gemini · ChromaDB RAG")
    render_api_key_guard()

    if st.session_state.last_route_notice:
        st.success(st.session_state.last_route_notice)
        st.session_state.last_route_notice = None

    if not workspace:
        render_empty_paper_cta()
    else:
        meta = workspace["metadata"]
        st.subheader(meta["title"])
        st.markdown(
            f"<div class='paperwise-meta'>{meta['authors']} · {meta['filename']} · Collection: {meta['collectionName']}</div>",
            unsafe_allow_html=True,
        )

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Pages", meta["pageCount"])
        m2.metric("Vector Chunks", meta["chunkCount"])
        m3.metric("Total Words", f"{meta['wordCount']:,}")
        m4.metric("Viva Questions", workspace["viva"]["totalCount"] if workspace.get("viva") else 0)

        st.markdown("### Intent Router Dispatch")
        with st.form("intent_dispatch_form", clear_on_submit=True):
            c1, c2 = st.columns([5, 1.4])
            with c1:
                task_prompt = st.text_input(
                    "Ask or request any task in plain language",
                    placeholder='e.g. "Summarize this paper", "Create 10 slides", "Generate 20 viva questions", or "What hallucination rate is reported?"',
                    label_visibility="collapsed",
                )
            with c2:
                submitted = st.form_submit_button("Detect Intent & Run", type="primary", use_container_width=True)
            if submitted and task_prompt.strip():
                if render_api_key_guard():
                    with st.spinner("Classifying intent via Few-Shot LCEL router and executing selected agent..."):
                        try:
                            res = route_natural_language_task(workspace, store, task_prompt, settings)
                            clf = res.get("classification", {})
                            st.session_state.last_route_notice = (
                                f"Detected Intent: `{clf.get('intent')}` → Routed to **{clf.get('selectedAgent')}**"
                            )
                            tab_map = {
                                "summary": "AI Summary",
                                "concepts": "Concept Extractor",
                                "slides": "Presentation Generator",
                                "viva": "Viva Preparation",
                                "practice": "Viva Practice",
                                "chat": "Research Paper Chat",
                            }
                            if res.get("targetTab") in tab_map:
                                st.session_state.nav_page = tab_map[res["targetTab"]]
                            st.rerun()
                        except Exception as exc:
                            st.error(str(exc))

        st.markdown("### Specialized AI Agents")
        a1, a2, a3, a4 = st.columns(4)
        with a1:
            st.markdown("**Summarizer Agent**")
            st.caption("Completed" if workspace.get("summary") else "Pending")
            if st.button("Run Summarizer", key="dash_sum", use_container_width=True):
                if render_api_key_guard():
                    with st.spinner("Running Summarizer Agent..."):
                        try:
                            run_summarizer(workspace, model_name=settings.get("activeModel"))
                            st.rerun()
                        except Exception as exc:
                            st.error(str(exc))
        with a2:
            st.markdown("**Concept & Gap Extractor**")
            st.caption("Completed" if workspace.get("concepts") else "Pending")
            if st.button("Run Extractor", key="dash_con", use_container_width=True):
                if render_api_key_guard():
                    with st.spinner("Running Concept, Methodology & Research Gap Agent..."):
                        try:
                            run_concept_extractor(workspace, model_name=settings.get("activeModel"))
                            st.rerun()
                        except Exception as exc:
                            st.error(str(exc))
        with a3:
            st.markdown("**Slide-Generator Agent**")
            st.caption(
                f"{workspace['presentation']['slideCount']} slides ready"
                if workspace.get("presentation")
                else "Pending"
            )
            if st.button("Generate Slides", key="dash_sli", use_container_width=True):
                if render_api_key_guard():
                    with st.spinner("Running Slide-Generator Agent..."):
                        try:
                            run_slide_generator(
                                workspace,
                                slide_count=int(settings.get("defaultSlideCount", 10)),
                                theme=str(settings.get("defaultSlideTheme", "oxford-navy")),
                                model_name=settings.get("activeModel"),
                            )
                            st.rerun()
                        except Exception as exc:
                            st.error(str(exc))
        with a4:
            st.markdown("**Viva Agent**")
            st.caption(
                f"{workspace['viva']['totalCount']} questions ready"
                if workspace.get("viva")
                else "Pending"
            )
            if st.button("Generate Viva", key="dash_viv", use_container_width=True):
                if render_api_key_guard():
                    with st.spinner("Generating 20+ Viva questions..."):
                        try:
                            run_viva_generator(workspace, store, min_questions=20, model_name=settings.get("activeModel"))
                            st.rerun()
                        except Exception as exc:
                            st.error(str(exc))

        col_left, col_right = st.columns([5, 7])
        with col_left:
            st.markdown("### Extracted Words per PDF Page")
            page_df = pd.DataFrame(
                [{"Page": f"P.{p['pageNumber']}", "Words": p["wordCount"]} for p in workspace.get("pages", [])]
            )
            if not page_df.empty:
                st.bar_chart(page_df.set_index("Page"))
        with col_right:
            st.markdown("### Recent Agent Executions")
            logs = workspace.get("activityLogs", [])[:8]
            if logs:
                log_df = pd.DataFrame(
                    [
                        {
                            "Agent": l.get("selectedAgent", ""),
                            "Intent": l.get("detectedIntent", ""),
                            "Outcome": l.get("outputSummary", "")[:70],
                            "Latency (ms)": l.get("processingTimeMs", 0),
                        }
                        for l in logs
                    ]
                )
                st.dataframe(log_df, use_container_width=True, hide_index=True)

# ==============================================================================
# 2. UPLOAD RESEARCH PAPER
# ==============================================================================
elif page == "Upload Research Paper":
    st.title("Upload Research Paper")
    st.caption("Upload a text-selectable PDF research paper (max 25 MB) or load the built-in 6-page sample paper.")
    render_api_key_guard()

    u1, u2 = st.columns([3, 2])
    with u1:
        uploaded = st.file_uploader("Choose a PDF file", type=["pdf"])
        if uploaded is not None:
            if st.button("Process & Index Uploaded PDF", type="primary"):
                if render_api_key_guard():
                    with st.spinner("Extracting PDF pages and indexing Gemini embeddings into ChromaDB..."):
                        try:
                            ws = ingest_pdf_bytes(
                                pdf_bytes=uploaded.getvalue(),
                                filename=uploaded.name,
                                store=store,
                                chunk_size=int(settings["chunkSize"]),
                                chunk_overlap=int(settings["chunkOverlap"]),
                                is_sample=False,
                                existing_workspaces=st.session_state.workspaces,
                            )
                            doc_id = ws["metadata"]["id"]
                            st.session_state.workspaces[doc_id] = ws
                            st.session_state.active_paper_id = doc_id
                            st.success(
                                f"Indexed {ws['metadata']['chunkCount']} chunks across {ws['metadata']['pageCount']} pages."
                            )
                            st.rerun()
                        except Exception as exc:
                            st.error(str(exc))
    with u2:
        st.markdown("**Quick Demo Paper**")
        st.caption("Loads the built-in 6-page ARAG-Lite PDF (`sample_papers/adaptive_rag_academic_survey.pdf`).")
        if st.button("Load Sample Paper (ARAG-Lite 6-Page PDF)", use_container_width=True):
            if render_api_key_guard():
                with st.spinner("Ingesting sample PDF and indexing embeddings..."):
                    try:
                        handle_load_sample()
                        st.success("Sample paper indexed successfully.")
                        st.rerun()
                    except Exception as exc:
                        st.error(str(exc))

    papers = get_papers_list()
    if papers:
        st.markdown(f"### Indexed Document Collections ({len(papers)})")
        for p in papers:
            c1, c2, c3, c4 = st.columns([5, 2, 1, 1])
            c1.markdown(f"**{p['title']}**  \n`{p['filename']}` · `{p['collectionName']}`")
            c2.caption(f"{p['pageCount']} pages · {p['chunkCount']} chunks")
            if c3.button("Select", key=f"sel_{p['id']}"):
                st.session_state.active_paper_id = p["id"]
                st.rerun()
            if c4.button("Remove", key=f"del_{p['id']}"):
                clear_single_workspace(p["id"])
                st.rerun()

    if workspace and workspace.get("pages"):
        st.markdown("### Extracted PDF Page Preview")
        page_nums = [p["pageNumber"] for p in workspace["pages"]]
        chosen_p = st.selectbox("Select Page", page_nums)
        page_obj = next((p for p in workspace["pages"] if p["pageNumber"] == chosen_p), None)
        if page_obj:
            st.caption(f"Page {page_obj['pageNumber']} · {page_obj['wordCount']} words")
            st.text_area("Extracted Text", value=page_obj["text"], height=240, disabled=True)

# ==============================================================================
# 3. AI SUMMARY (includes Methodology Analysis)
# ==============================================================================
elif page == "AI Summary":
    st.title("AI Structured Summary & Methodology Analysis")
    if not workspace:
        render_empty_paper_cta()
    else:
        meta = workspace["metadata"]
        b1, b2, b3 = st.columns([2, 1, 1])
        with b1:
            if st.button(
                "Regenerate Summary" if workspace.get("summary") else "Generate Structured Summary",
                type="primary",
            ):
                if render_api_key_guard():
                    with st.spinner("Running Summarizer Agent via LCEL..."):
                        try:
                            run_summarizer(workspace, model_name=settings.get("activeModel"))
                            st.rerun()
                        except Exception as exc:
                            st.error(str(exc))
        summary = workspace.get("summary")
        if summary:
            with b2:
                try:
                    docx_bytes = get_summary_docx_bytes(workspace)
                    st.download_button(
                        "Download .docx",
                        data=docx_bytes,
                        file_name=f"{meta['filename'].replace('.pdf', '')}_summary.docx",
                        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        use_container_width=True,
                    )
                except Exception as exc:
                    st.error(str(exc))
            with b3:
                md_text = (
                    f"# {summary['title']}\n**Authors:** {summary['authors']}\n\n"
                    f"## Abstract Summary\n{summary['abstractSummary']}\n\n"
                    f"## Problem Statement\n{summary['problemStatement']}\n\n"
                    f"## Methodology\n{summary['methodology']}\n\n"
                    f"## Results\n{summary['results']}\n\n"
                    f"## Conclusion\n{summary['conclusion']}\n"
                )
                st.download_button(
                    "Download .md",
                    data=md_text,
                    file_name=f"{meta['filename'].replace('.pdf', '')}_summary.md",
                    mime="text/markdown",
                    use_container_width=True,
                )

            st.subheader(summary["title"])
            st.caption(f"Authors: {summary['authors']}")

            col_a, col_b = st.columns(2)
            with col_a:
                st.markdown("#### Abstract Summary")
                st.write(summary["abstractSummary"])
                st.markdown("#### Problem Statement")
                st.write(summary["problemStatement"])
            with col_b:
                st.markdown("#### Introduction Summary")
                st.write(summary["introductionSummary"])
                st.markdown("#### Research Objectives")
                for idx, obj in enumerate(summary.get("objectives", []), 1):
                    st.markdown(f"{idx}. {obj}")

            st.markdown("#### Research Methodology Analysis")
            st.info(summary["methodology"])

            col_c, col_d = st.columns(2)
            with col_c:
                st.markdown("#### Results & Findings")
                st.write(summary["results"])
            with col_d:
                st.markdown("#### Conclusion")
                st.write(summary["conclusion"])

            col_e, col_f = st.columns(2)
            with col_e:
                st.markdown("#### Key Takeaways")
                for item in summary.get("keyTakeaways", []):
                    st.markdown(f"- {item}")
            with col_f:
                st.markdown("#### Complex Terms Explained Simply")
                for item in summary.get("simpleExplanations", []):
                    st.markdown(f"**{item['term']}:** {item['explanation']}")

            if workspace.get("concepts") and workspace["concepts"].get("limitations"):
                st.markdown("#### Identified Research Gaps & Limitations")
                for lim in workspace["concepts"]["limitations"]:
                    st.markdown(f"- {lim}")

# ==============================================================================
# 4. CONCEPT EXTRACTOR (Concepts, Methodology & Research Gap Identification)
# ==============================================================================
elif page == "Concept Extractor":
    st.title("Concept, Methodology & Research Gap Extractor")
    if not workspace:
        render_empty_paper_cta()
    else:
        if st.button(
            "Re-Extract Concepts & Research Gaps" if workspace.get("concepts") else "Extract Concepts, Methodology & Gaps",
            type="primary",
        ):
            if render_api_key_guard():
                with st.spinner("Running Concept-Extractor Agent..."):
                    try:
                        run_concept_extractor(workspace, model_name=settings.get("activeModel"))
                        st.rerun()
                    except Exception as exc:
                        st.error(str(exc))

        concepts = workspace.get("concepts")
        if concepts:
            st.markdown(f"### Important Concepts ({len(concepts.get('importantConcepts', []))})")
            for c in concepts.get("importantConcepts", []):
                with st.expander(f"{c['name']} ({c['pageReference']})", expanded=True):
                    st.write(c["definition"])
                    st.caption(f"In simple terms: {c['simpleExplanation']}")

            st.markdown(f"### Research Methodology & Algorithms ({len(concepts.get('algorithmsAndMethods', []))})")
            for alg in concepts.get("algorithmsAndMethods", []):
                st.markdown(f"**{alg['name']}** (`{alg['pageReference']}`)")
                st.markdown(f"- **Purpose:** {alg['purpose']}")
                st.markdown(f"- **Workflow:** {alg['workflow']}")

            c1, c2 = st.columns(2)
            with c1:
                st.markdown("### Research Contributions")
                for r in concepts.get("researchContributions", []):
                    st.markdown(f"- {r}")
                st.markdown("### Research Gaps & Stated Limitations")
                limitations = concepts.get("limitations", [])
                if limitations:
                    items_html = "".join(f"<li>{lim}</li>" for lim in limitations)
                    st.markdown(f"<div class='paperwise-gap-box'><ul>{items_html}</ul></div>", unsafe_allow_html=True)
                else:
                    st.caption("No explicit limitations were identified in the extracted text.")
            with c2:
                st.markdown("### Important Findings")
                for f_item in concepts.get("importantFindings", []):
                    st.markdown(f"- {f_item}")
                st.markdown("### Future Scope & Open Directions")
                for fs_item in concepts.get("futureScope", []):
                    st.markdown(f"- {fs_item}")

            st.markdown("### Technical Glossary")
            q_term = st.text_input("Filter glossary terms", "")
            glossary = [
                g
                for g in concepts.get("technicalGlossary", [])
                if q_term.lower() in g["term"].lower() or q_term.lower() in g["meaning"].lower()
            ]
            if glossary:
                st.table(pd.DataFrame(glossary))

# ==============================================================================
# 5. PRESENTATION GENERATOR
# ==============================================================================
elif page == "Presentation Generator":
    st.title("Presentation Generator & PPTX Export")
    if not workspace:
        render_empty_paper_cta()
    else:
        meta = workspace["metadata"]
        c1, c2, c3, c4 = st.columns([1.5, 2, 1.5, 1.5])
        with c1:
            slide_count = st.selectbox("Slide Count", [8, 10, 12], index=1)
        with c2:
            theme = st.selectbox("Theme", ["oxford-navy", "slate-academic", "violet-research"])
        with c3:
            st.write("")
            if st.button("Generate Presentation", type="primary", use_container_width=True):
                if render_api_key_guard():
                    with st.spinner(f"Generating {slide_count} slides via Slide-Generator Agent..."):
                        try:
                            run_slide_generator(
                                workspace,
                                slide_count=slide_count,
                                theme=theme,
                                model_name=settings.get("activeModel"),
                            )
                            st.rerun()
                        except Exception as exc:
                            st.error(str(exc))
        deck = workspace.get("presentation")
        if deck:
            with c4:
                st.write("")
                try:
                    pptx_bytes = get_pptx_bytes(workspace)
                    st.download_button(
                        "Download .pptx",
                        data=pptx_bytes,
                        file_name=f"{meta['filename'].replace('.pdf', '')}_slides.pptx",
                        mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        use_container_width=True,
                    )
                except Exception as exc:
                    st.error(str(exc))

            slides = deck.get("slides", [])
            if slides:
                slide_labels = [f"Slide {s['slideNumber']}: {s['title']}" for s in slides]
                chosen_idx = st.selectbox(
                    "Select Slide to Preview",
                    range(len(slides)),
                    format_func=lambda idx: slide_labels[idx],
                )
                slide = slides[chosen_idx]
                box_class = "paperwise-slide-title" if slide["slideNumber"] == 1 else "paperwise-slide"
                bullets_html = "".join(f"<li>{b}</li>" for b in slide.get("bullets", []))
                st.markdown(
                    f"""
                    <div class="{box_class}">
                      <div style="font-size:12px; opacity:0.8; margin-bottom:6px;">
                        {slide.get('sectionType', '')} · {slide.get('pageReferences', '')} · Slide {slide['slideNumber']} / {deck['slideCount']}
                      </div>
                      <h2 style="margin-top:0;">{slide['title']}</h2>
                      <ul style="line-height:1.65;">{bullets_html}</ul>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                if slide.get("chartData") and len(slide["chartData"]) >= 2:
                    st.markdown("**Quantitative Chart Extracted from Paper**")
                    cdf = pd.DataFrame(slide["chartData"])
                    st.bar_chart(cdf.set_index("label")["value"])
                if slide.get("diagramNodes"):
                    st.markdown("**Architecture / Workflow Flow:** " + " → ".join(slide["diagramNodes"]))
                st.info(f"**Speaker Notes:** {slide.get('speakerNotes', '')}")

# ==============================================================================
# 6. VIVA PREPARATION
# ==============================================================================
elif page == "Viva Preparation":
    st.title("Viva Voce Preparation Bank")
    if not workspace:
        render_empty_paper_cta()
    else:
        meta = workspace["metadata"]
        c1, c2 = st.columns([2, 1])
        with c1:
            if st.button(
                "Regenerate Question Bank" if workspace.get("viva") else "Generate 20+ Viva Questions",
                type="primary",
            ):
                if render_api_key_guard():
                    with st.spinner("Generating 20+ categorized viva questions..."):
                        try:
                            run_viva_generator(
                                workspace,
                                store,
                                min_questions=20,
                                model_name=settings.get("activeModel"),
                            )
                            st.rerun()
                        except Exception as exc:
                            st.error(str(exc))
        viva = workspace.get("viva")
        if viva:
            with c2:
                try:
                    viva_docx = get_viva_docx_bytes(workspace)
                    st.download_button(
                        "Download Viva .docx",
                        data=viva_docx,
                        file_name=f"{meta['filename'].replace('.pdf', '')}_viva.docx",
                        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        use_container_width=True,
                    )
                except Exception as exc:
                    st.error(str(exc))

            f1, f2, f3, f4 = st.columns([2, 2, 1.5, 1])
            with f1:
                search_q = st.text_input("Search questions", "")
            with f2:
                cat = st.selectbox(
                    "Category",
                    ["All", "Basic", "Conceptual", "Technical", "Methodology", "Results-based", "Challenging Examiner"],
                )
            with f3:
                diff = st.selectbox("Difficulty", ["All", "Easy", "Medium", "Hard"])
            with f4:
                reveal_all = st.checkbox("Reveal All", value=False)

            filtered = [
                q
                for q in viva.get("questions", [])
                if (cat == "All" or q["category"] == cat)
                and (diff == "All" or q["difficulty"] == diff)
                and (search_q.lower() in q["question"].lower() or search_q.lower() in q["modelAnswer"].lower())
            ]
            st.caption(f"Showing {len(filtered)} of {viva['totalCount']} examiner questions")
            for idx, q in enumerate(filtered, 1):
                with st.expander(
                    f"Q{idx}. [{q['category']} · {q['difficulty']} · {q['pageReference']}] {q['question']}",
                    expanded=reveal_all,
                ):
                    st.markdown(f"**Model Answer:** {q['modelAnswer']}")
                    st.info(f"**Beginner Explanation:** {q['beginnerExplanation']}")

# ==============================================================================
# 7. VIVA PRACTICE
# ==============================================================================
elif page == "Viva Practice":
    st.title("Interactive Viva Practice & Answer Evaluation")
    if not workspace:
        render_empty_paper_cta()
    elif not workspace.get("viva"):
        st.warning("Generate the Viva Question Bank first before starting practice mode.")
        if st.button("Generate 20+ Viva Questions", type="primary"):
            if render_api_key_guard():
                with st.spinner("Generating questions..."):
                    try:
                        run_viva_generator(
                            workspace,
                            store,
                            min_questions=20,
                            model_name=settings.get("activeModel"),
                        )
                        st.rerun()
                    except Exception as exc:
                        st.error(str(exc))
    else:
        questions = workspace["viva"]["questions"]
        evals = workspace.get("evaluations", [])
        avg = round(sum(e["score"] for e in evals) / len(evals), 1) if evals else None

        s1, s2 = st.columns(2)
        s1.metric("Questions Evaluated", f"{len(evals)} / {len(questions)}")
        s2.metric("Practice Average Score", f"{avg} / 10" if avg is not None else "—")

        idx = st.session_state.viva_practice_idx % len(questions)
        n1, n2, n3 = st.columns([1, 4, 1])
        with n1:
            if st.button("← Previous", disabled=idx == 0):
                st.session_state.viva_practice_idx = max(0, idx - 1)
                st.rerun()
        with n2:
            st.markdown(
                f"<div style='text-align:center; padding-top:6px;'>Question {idx + 1} of {len(questions)} · {questions[idx]['category']} ({questions[idx]['difficulty']})</div>",
                unsafe_allow_html=True,
            )
        with n3:
            if st.button("Next →", disabled=idx >= len(questions) - 1):
                st.session_state.viva_practice_idx = min(len(questions) - 1, idx + 1)
                st.rerun()

        q = questions[idx]
        st.subheader(q["question"])

        with st.form(f"viva_eval_{q['id']}"):
            user_ans = st.text_area("Your Viva Defense Answer", height=150)
            submit_ans = st.form_submit_button("Submit Answer for AI Evaluation", type="primary")
            if submit_ans and user_ans.strip():
                if render_api_key_guard():
                    with st.spinner("Retrieving ground-truth passages from ChromaDB and grading via Gemini..."):
                        try:
                            run_viva_evaluation(
                                workspace,
                                store,
                                question_id=q["id"],
                                user_answer=user_ans.strip(),
                                top_k=int(settings.get("topK", 5)),
                                model_name=settings.get("activeModel"),
                            )
                            st.rerun()
                        except Exception as exc:
                            st.error(str(exc))

        latest = next((e for e in workspace.get("evaluations", []) if e["questionId"] == q["id"]), None)
        if latest:
            st.success(f"**Score: {latest['score']} / {latest['maxScore']}** — {latest['verdict']}")
            c_left, c_right = st.columns(2)
            with c_left:
                st.markdown("**Strengths**")
                for s in latest.get("strengths", []):
                    st.markdown(f"- {s}")
            with c_right:
                st.markdown("**Weaknesses & Missing Points**")
                for w in latest.get("weaknesses", []) + latest.get("missingKeyPoints", []):
                    st.markdown(f"- {w}")
            st.info(f"**Improved Model Answer:** {latest['improvedModelAnswer']}")

# ==============================================================================
# 8. RESEARCH PAPER CHAT
# ==============================================================================
elif page == "Research Paper Chat":
    st.title("Grounded Research Paper Chat (Agentic RAG)")
    if not workspace:
        render_empty_paper_cta()
    else:
        meta = workspace["metadata"]
        st.caption(
            f"Vector Collection: `{meta['collectionName']}` · Strict page citation & unsupported-claim refusal enabled"
        )

        for msg in workspace.get("chatHistory", []):
            with st.chat_message(msg["role"]):
                st.markdown(msg["content"])
                if msg["role"] == "assistant":
                    pages = msg.get("pageReferences") or []
                    st.caption(
                        f"Intent: {msg.get('detectedIntent', 'ASK_PAPER_QUESTION')} · "
                        f"Sources: Pages {', '.join(map(str, pages)) if pages else 'Metadata'} · "
                        f"{msg.get('processingTimeMs', 0)} ms"
                    )
                    chunks = msg.get("retrievedChunks") or []
                    if chunks:
                        with st.expander("Inspect Retrieved Vector Chunks"):
                            for ch in chunks:
                                st.markdown(
                                    f"**Page {ch['page_number']} · Chunk #{ch['chunk_index']} · Similarity: `{ch['score']:.4f}`**"
                                )
                                st.write(ch["text"])

        prompt = st.chat_input("Ask a question grounded in this research paper...")
        if prompt:
            if render_api_key_guard():
                with st.spinner("Running Intent Router → ChromaDB Similarity Search → ReAct Grounding..."):
                    try:
                        run_rag_chat(
                            workspace,
                            store,
                            user_message=prompt,
                            top_k=int(settings.get("topK", 5)),
                            model_name=settings.get("activeModel"),
                        )
                        st.rerun()
                    except Exception as exc:
                        st.error(str(exc))

# ==============================================================================
# 9. AGENT ACTIVITY MONITOR
# ==============================================================================
elif page == "Agent Activity Monitor":
    st.title("Agent Activity Monitor & Intent Router")
    if not workspace:
        render_empty_paper_cta()
    else:
        logs = workspace.get("activityLogs", [])
        if not logs:
            st.info("No agent executions logged yet.")
        else:
            df = pd.DataFrame(
                [
                    {
                        "Timestamp": l.get("timestamp", ""),
                        "Agent": l.get("selectedAgent", ""),
                        "Intent": l.get("detectedIntent", ""),
                        "Confidence": l.get("intentConfidence", 1.0),
                        "RAG": "Yes" if l.get("ragUsed") else "No",
                        "Chunks": l.get("retrievedChunksCount", 0),
                        "Latency (ms)": l.get("processingTimeMs", 0),
                        "LCEL Pipeline": l.get("lcelPipeline", ""),
                    }
                    for l in logs
                ]
            )
            st.dataframe(df, use_container_width=True, hide_index=True)

# ==============================================================================
# 10. RAG INSPECTOR
# ==============================================================================
elif page == "RAG Inspector":
    st.title("Vector Store & RAG Inspector")
    if not workspace:
        render_empty_paper_cta()
    else:
        c1, c2, c3 = st.columns([5, 1.5, 1.5])
        with c1:
            rag_query = st.text_input(
                "Semantic Similarity Query",
                placeholder="e.g., ReAct faithfulness threshold and hallucination rate",
            )
        with c2:
            top_k = st.selectbox("Top-K", [3, 5, 8, 10], index=1)
        with c3:
            st.write("")
            run_search = st.button("Run Vector Search", type="primary", use_container_width=True)

        if not rag_query or render_api_key_guard():
            try:
                inspection = inspect_rag(
                    workspace,
                    store,
                    query=rag_query if (run_search or rag_query) else "",
                    top_k=top_k,
                )
                m1, m2, m3, m4 = st.columns(4)
                m1.metric("Collection", inspection["collectionName"][-16:])
                m2.metric("Indexed Chunks", inspection["totalChunks"])
                m3.metric("Embedding Model", inspection["embeddingModel"])
                m4.metric("Status", inspection["retrievalStatus"])

                chunks = inspection.get("retrievedChunks", [])
                if rag_query and chunks:
                    cdf = pd.DataFrame(
                        [
                            {
                                "Chunk": f"C#{c['chunk_index']} (P.{c['page_number']})",
                                "Similarity": c["score"],
                            }
                            for c in chunks
                        ]
                    )
                    st.bar_chart(cdf.set_index("Chunk"))

                for c in chunks:
                    with st.expander(
                        f"Chunk #{c['chunk_index']} · Page {c['page_number']} · {c['section_hint']} · Score: {c['score']:.4f}",
                        expanded=True,
                    ):
                        st.write(c["text"])
            except Exception as exc:
                st.error(str(exc))

# ==============================================================================
# 11. PROMPT ENGINEERING
# ==============================================================================
elif page == "Prompt Engineering":
    st.title("Prompt Engineering & LCEL Architecture")
    for spec in get_prompt_specs():
        with st.expander(f"{spec['agentName']} — {spec['technique']}", expanded=False):
            st.code(spec["lcelExpression"], language="text")
            st.markdown("**System Prompt**")
            st.code(spec["systemPrompt"], language="text")
            st.markdown("**User PromptTemplate**")
            st.code(spec["userPromptTemplate"], language="text")
            st.caption("Input Variables: " + ", ".join(spec.get("inputVariables", [])))

# ==============================================================================
# 12. SETTINGS
# ==============================================================================
elif page == "Settings":
    st.title("Pipeline & Workspace Settings")
    current = st.session_state.settings
    with st.form("settings_form"):
        c1, c2 = st.columns(2)
        with c1:
            chunk_size = st.number_input("Chunk Size (chars)", 300, 2400, int(current.get("chunkSize", 900)), step=50)
            top_k = st.number_input("Top-K Chunks", 1, 15, int(current.get("topK", 5)))
            default_theme = st.selectbox(
                "Default Slide Theme",
                ["oxford-navy", "slate-academic", "violet-research"],
                index=["oxford-navy", "slate-academic", "violet-research"].index(
                    current.get("defaultSlideTheme", "oxford-navy")
                ),
            )
        with c2:
            chunk_overlap = st.number_input("Chunk Overlap (chars)", 0, 500, int(current.get("chunkOverlap", 150)), step=25)
            default_slides = st.selectbox(
                "Default Slide Count",
                [8, 10, 12],
                index=[8, 10, 12].index(int(current.get("defaultSlideCount", 10))),
            )
        if st.form_submit_button("Save Preferences", type="primary"):
            st.session_state.settings.update(
                {
                    "chunkSize": int(chunk_size),
                    "chunkOverlap": int(chunk_overlap),
                    "topK": int(top_k),
                    "defaultSlideCount": int(default_slides),
                    "defaultSlideTheme": default_theme,
                }
            )
            st.success("Preferences updated for this session.")

    st.divider()
    st.subheader("Gemini Model Configuration Check")
    st.caption(
        f"Active Chat Model: `{get_chat_model_name()}` · "
        f"Active Embedding Model: `{get_embedding_model_name()}`"
    )
    if st.button("Verify Gemini Chat & Embedding Connection"):
        if render_api_key_guard():
            with st.spinner("Verifying Gemini chat and embedding models..."):
                try:
                    info = verify_gemini_models()
                    st.success(
                        f"Connected! Chat `{info['chatModel']}` replied `{info['chatReply']}` · "
                        f"Embedding `{info['embeddingModel']}` produced {info['embeddingDimensions']}-dim vector."
                    )
                except Exception as exc:
                    st.error(str(exc))

    st.divider()
    st.subheader("Workspace Maintenance")
    col_r1, col_r2 = st.columns(2)
    with col_r1:
        if workspace and st.button("Clear Active Paper Only", use_container_width=True):
            clear_single_workspace(workspace["metadata"]["id"])
            st.success("Active paper removed from session and ChromaDB.")
            st.rerun()
    with col_r2:
        if st.button("Reset Entire Workspace & ChromaDB", use_container_width=True):
            reset_entire_workspace()
            st.success("Workspace cleared.")
            st.rerun()
