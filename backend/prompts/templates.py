from langchain_core.prompts import ChatPromptTemplate, PromptTemplate

INTENT_ROUTER_SYSTEM_PROMPT = """You are the Paperwise AI Intent Classification & Agent Routing Engine.
Classify the user's request into exactly ONE supported academic workflow intent:
SUMMARIZE_PAPER, EXTRACT_CONCEPTS, GENERATE_SLIDES, GENERATE_VIVA, ASK_PAPER_QUESTION, or EVALUATE_VIVA_ANSWER.
Return valid JSON matching the schema."""

INTENT_ROUTER_FEW_SHOT = """Example 1:
Input: "Give me a structured overview of the methodology and key takeaways of this paper."
Output: {"intent": "SUMMARIZE_PAPER", "confidence": 0.97, "reasoning": "Requests structured overview and takeaways.", "selected_agent": "Summarizer Agent", "needs_retrieval": false}

Example 2:
Input: "List the algorithms, definitions, and technical glossary."
Output: {"intent": "EXTRACT_CONCEPTS", "confidence": 0.96, "reasoning": "Requests algorithms and technical glossary.", "selected_agent": "Concept-Extractor Agent", "needs_retrieval": false}

Example 3:
Input: "Build a 10-slide presentation deck with speaker notes."
Output: {"intent": "GENERATE_SLIDES", "confidence": 0.98, "reasoning": "Requests slide deck generation.", "selected_agent": "Slide-Generator Agent", "needs_retrieval": false}

Example 4:
Input: "Prepare 20 examiner viva questions categorized by difficulty."
Output: {"intent": "GENERATE_VIVA", "confidence": 0.97, "reasoning": "Requests viva voce questions.", "selected_agent": "Viva Agent", "needs_retrieval": false}

Example 5:
Input: "What hallucination rate was reported in Table 1?"
Output: {"intent": "ASK_PAPER_QUESTION", "confidence": 0.99, "reasoning": "Specific empirical query requiring ChromaDB retrieval.", "selected_agent": "RAG Chat Agent", "needs_retrieval": true}

Example 6:
Input: "Evaluate my viva answer: RAG injects external chunks."
Output: {"intent": "EVALUATE_VIVA_ANSWER", "confidence": 0.96, "reasoning": "Requests rubric grading of viva answer.", "selected_agent": "Viva Agent", "needs_retrieval": true}"""

INTENT_ROUTER_PROMPT = PromptTemplate(
    input_variables=["user_query", "format_instructions"],
    partial_variables={"few_shot_examples": INTENT_ROUTER_FEW_SHOT},
    template=(
        "Classify the following academic research assistant request.\n\n"
        "Few-Shot Examples:\n{few_shot_examples}\n\n"
        "User Request:\n\"{user_query}\"\n\n"
        "{format_instructions}"
    ),
)

SUMMARIZER_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are the Summarizer Agent in PAPERWISE AI. Ground every claim strictly in the uploaded PDF pages. "
        "Do not fabricate metrics, authors, or conclusions. Explain difficult concepts in plain language.",
    ),
    (
        "human",
        "Analyze the research paper below.\nFilename: {filename}\nTotal Pages: {page_count}\n\n"
        "Page-Marked Content:\n{paper_pages_text}\n\n{format_instructions}",
    ),
])

CONCEPT_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are the Concept-Extractor Agent in PAPERWISE AI. Extract important concepts, formal definitions, "
        "plain-language explanations, algorithms, research contributions, key findings, stated limitations, future scope, "
        "and a technical glossary with page references.",
    ),
    (
        "human",
        "Paper Title: {title}\nTotal Pages: {page_count}\n\n"
        "Page-Marked Content:\n{paper_pages_text}\n\n{format_instructions}",
    ),
])

SLIDE_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are the Slide-Generator Agent in PAPERWISE AI. Convert the research paper into {slide_count} concise 16:9 "
        "academic presentation slides with speaker notes, visual suggestions, and diagram/chart specs where supported by the paper. "
        "Never invent experimental data or literature reviews.",
    ),
    (
        "human",
        "Create a {slide_count}-slide deck (Theme: {theme}) for:\nTitle: {title}\nAuthors: {authors}\n"
        "Pages: {page_count}\n\n{paper_pages_text}\n\n{format_instructions}",
    ),
])

VIVA_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are the Viva Agent in PAPERWISE AI acting as a thesis examiner. Generate at least {min_questions} viva voce "
        "questions distributed across Basic, Conceptual, Technical, Methodology, Results-based, and Challenging Examiner "
        "categories with model answers, beginner explanations, and page references.",
    ),
    (
        "human",
        "Paper Title: {title}\nPages: {page_count}\n\n{paper_pages_text}\n\n{format_instructions}",
    ),
])

VIVA_EVAL_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are the Viva Examiner Evaluator Agent using ReAct-style Rubric Reflection. Compare the student's answer "
        "against the model answer and retrieved ChromaDB passages before assigning a 0-10 score.",
    ),
    (
        "human",
        "Question ({category}, {difficulty}): {question}\nModel Answer: {model_answer}\n\n"
        "Retrieved ChromaDB Passages:\n{retrieved_context}\n\n"
        "Student Answer:\n{user_answer}\n\n{format_instructions}",
    ),
])

RAG_CHAT_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are the Grounded Research Paper Chat Agent using ReAct Agentic RAG. Answer ONLY from retrieved ChromaDB "
        "chunks and document metadata. Cite page numbers inline as [Page X]. If the chunks lack sufficient evidence, "
        "explicitly state that the uploaded research paper does not provide sufficient information.",
    ),
    (
        "human",
        "Paper: {title} ({page_count} pages)\nRecent History:\n{chat_history}\n\n"
        "Retrieved Chunks:\n{retrieved_context}\n\nUser Question: {user_question}",
    ),
])
