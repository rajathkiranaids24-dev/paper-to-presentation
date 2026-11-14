import io
from typing import Any, Dict
from docx import Document


def build_summary_docx_bytes(summary: Dict[str, Any]) -> bytes:
    doc = Document()
    doc.add_heading(summary.get("title", "Research Paper Summary"), level=0)
    doc.add_paragraph(f"Authors: {summary.get('authors', 'Unknown')}")

    for heading, key in [
        ("Abstract Summary", "abstractSummary"),
        ("Introduction Summary", "introductionSummary"),
        ("Problem Statement", "problemStatement"),
    ]:
        doc.add_heading(heading, level=1)
        doc.add_paragraph(summary.get(key, ""))

    doc.add_heading("Research Objectives", level=1)
    for obj in summary.get("objectives", []):
        doc.add_paragraph(obj, style="List Bullet")

    for heading, key in [
        ("Methodology", "methodology"),
        ("Results & Empirical Findings", "results"),
        ("Conclusion", "conclusion"),
    ]:
        doc.add_heading(heading, level=1)
        doc.add_paragraph(summary.get(key, ""))

    doc.add_heading("Key Takeaways", level=1)
    for item in summary.get("keyTakeaways", []):
        doc.add_paragraph(item, style="List Bullet")

    simple = summary.get("simpleExplanations", [])
    if simple:
        doc.add_heading("Complex Terms Explained Simply", level=1)
        for item in simple:
            p = doc.add_paragraph()
            run = p.add_run(f"{item.get('term', '')}: ")
            run.bold = True
            p.add_run(item.get("explanation", ""))

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


def build_viva_docx_bytes(paper_title: str, viva: Dict[str, Any]) -> bytes:
    doc = Document()
    doc.add_heading(f"Viva Voce Question Bank — {paper_title}", level=0)
    doc.add_paragraph(f"Total Examiner Questions: {viva.get('totalCount', 0)}")

    for idx, q in enumerate(viva.get("questions", []), start=1):
        p_head = doc.add_paragraph()
        r_meta = p_head.add_run(
            f"Q{idx}. [{q.get('category', '')} · {q.get('difficulty', '')} · {q.get('pageReference', '')}] "
        )
        r_meta.bold = True
        r_q = p_head.add_run(q.get("question", ""))
        r_q.bold = True

        p_ans = doc.add_paragraph()
        r_ans = p_ans.add_run("Model Answer: ")
        r_ans.bold = True
        p_ans.add_run(q.get("modelAnswer", ""))

        p_beg = doc.add_paragraph()
        r_beg = p_beg.add_run("Beginner Explanation: ")
        r_beg.bold = True
        p_beg.add_run(q.get("beginnerExplanation", ""))

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()
