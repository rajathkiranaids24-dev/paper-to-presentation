import io
from typing import Any, Dict
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt

THEMES = {
    "oxford-navy": {
        "bg": RGBColor(0xF8, 0xFA, 0xFC),
        "title_bg": RGBColor(0x0F, 0x17, 0x2A),
        "accent": RGBColor(0x3B, 0x82, 0xF6),
        "heading": RGBColor(0x0F, 0x17, 0x2A),
        "body": RGBColor(0x1E, 0x29, 0x3B),
        "muted": RGBColor(0x64, 0x74, 0x8B),
        "title_text": RGBColor(0xF8, 0xFA, 0xFC),
    },
    "slate-academic": {
        "bg": RGBColor(0xFF, 0xFF, 0xFF),
        "title_bg": RGBColor(0x1E, 0x29, 0x3B),
        "accent": RGBColor(0x25, 0x63, 0xEB),
        "heading": RGBColor(0x0F, 0x17, 0x2A),
        "body": RGBColor(0x33, 0x41, 0x55),
        "muted": RGBColor(0x64, 0x74, 0x8B),
        "title_text": RGBColor(0xFF, 0xFF, 0xFF),
    },
    "violet-research": {
        "bg": RGBColor(0xF8, 0xFA, 0xFC),
        "title_bg": RGBColor(0x17, 0x15, 0x3B),
        "accent": RGBColor(0x7C, 0x3A, 0xED),
        "heading": RGBColor(0x1E, 0x1B, 0x4B),
        "body": RGBColor(0x1E, 0x29, 0x3B),
        "muted": RGBColor(0x64, 0x74, 0x8B),
        "title_text": RGBColor(0xF8, 0xFA, 0xFC),
    },
}


def build_pptx_bytes(deck: Dict[str, Any]) -> bytes:
    prs = Presentation()
    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]
    palette = THEMES.get(deck.get("theme", "oxford-navy"), THEMES["oxford-navy"])

    slides = deck.get("slides", [])
    total = len(slides)

    for slide_data in slides:
        slide = prs.slides.add_slide(blank_layout)
        is_title = slide_data.get("slideNumber") == 1

        bg_fill = slide.background.fill
        bg_fill.solid()
        bg_fill.fore_color.rgb = palette["title_bg"] if is_title else palette["bg"]

        if is_title:
            bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.9), Inches(1.3), Inches(1.4), Inches(0.08))
            bar.fill.solid()
            bar.fill.fore_color.rgb = palette["accent"]
            bar.line.fill.background()

            tb = slide.shapes.add_textbox(Inches(0.9), Inches(1.9), Inches(11.5), Inches(2.2))
            tf = tb.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.text = slide_data.get("title", deck.get("paperTitle", "Research Presentation"))
            p.font.size = Pt(32)
            p.font.bold = True
            p.font.color.rgb = palette["title_text"]

            sub = slide.shapes.add_textbox(Inches(0.9), Inches(4.2), Inches(11.5), Inches(0.9))
            stf = sub.text_frame
            stf.word_wrap = True
            sp = stf.paragraphs[0]
            sp.text = slide_data.get("subtitle") or deck.get("sourceInfo", "")
            sp.font.size = Pt(16)
            sp.font.color.rgb = RGBColor(0xCB, 0xD5, 0xE1)
        else:
            top_bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), Inches(13.333), Inches(0.1))
            top_bar.fill.solid()
            top_bar.fill.fore_color.rgb = palette["accent"]
            top_bar.line.fill.background()

            kicker = slide.shapes.add_textbox(Inches(0.75), Inches(0.35), Inches(10), Inches(0.3))
            kp = kicker.text_frame.paragraphs[0]
            kp.text = f"{slide_data.get('sectionType', '').upper()}  ·  {slide_data.get('pageReferences', '')}"
            kp.font.size = Pt(10)
            kp.font.bold = True
            kp.font.color.rgb = palette["accent"]

            heading_box = slide.shapes.add_textbox(Inches(0.75), Inches(0.65), Inches(11.8), Inches(0.65))
            hp = heading_box.text_frame.paragraphs[0]
            hp.text = slide_data.get("title", "")
            hp.font.size = Pt(24)
            hp.font.bold = True
            hp.font.color.rgb = palette["heading"]

            body_box = slide.shapes.add_textbox(Inches(0.75), Inches(1.6), Inches(11.6), Inches(4.8))
            btf = body_box.text_frame
            btf.word_wrap = True
            for idx, bullet in enumerate(slide_data.get("bullets", [])):
                bp = btf.paragraphs[0] if idx == 0 else btf.add_paragraph()
                bp.text = f"• {bullet}"
                bp.font.size = Pt(16)
                bp.font.color.rgb = palette["body"]
                bp.space_after = Pt(10)

            footer = slide.shapes.add_textbox(Inches(0.75), Inches(6.95), Inches(11.8), Inches(0.3))
            fp = footer.text_frame.paragraphs[0]
            fp.text = f"{deck.get('paperTitle', '')[:85]}   |   Slide {slide_data.get('slideNumber')} / {total}"
            fp.font.size = Pt(9.5)
            fp.font.color.rgb = palette["muted"]

        notes_text = slide_data.get("speakerNotes", "")
        if notes_text:
            slide.notes_slide.notes_text_frame.text = notes_text

    buffer = io.BytesIO()
    prs.save(buffer)
    buffer.seek(0)
    return buffer.read()
