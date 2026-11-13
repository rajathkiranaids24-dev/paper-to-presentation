import type { PromptEngineeringSpec } from '../../src/types/paperwise.ts';

export class PromptTemplate {
  public readonly template: string;
  public readonly inputVariables: string[];

  constructor(template: string, inputVariables: string[]) {
    this.template = template;
    this.inputVariables = inputVariables;
  }

  format(values: Record<string, string | number>): string {
    let rendered = this.template;
    for (const key of this.inputVariables) {
      const val = values[key] !== undefined ? String(values[key]) : '';
      rendered = rendered.split(`{${key}}`).join(val);
    }
    return rendered;
  }
}

export const INTENT_ROUTER_SYSTEM_PROMPT = `You are the Paperwise AI Intent Classification & Agent Routing Engine.
Classify the user's request into exactly ONE supported academic workflow intent and identify which specialized agent and tools should execute it.
Never invent unsupported intents. Always return strict JSON matching the output schema.`;

export const INTENT_ROUTER_FEW_SHOT = [
  {
    input: 'Give me a structured overview of the methodology and key takeaways of this paper.',
    output:
      '{"intent":"SUMMARIZE_PAPER","confidence":0.97,"reasoning":"User asks for structured overview, methodology, and takeaways.","selectedAgent":"Summarizer Agent","needsRetrieval":false}',
  },
  {
    input: 'List the algorithms, formal definitions, and technical glossary from the manuscript.',
    output:
      '{"intent":"EXTRACT_CONCEPTS","confidence":0.96,"reasoning":"User requests technical concepts, algorithms, and glossary.","selectedAgent":"Concept-Extractor Agent","needsRetrieval":false}',
  },
  {
    input: 'Build a 10-slide presentation deck with speaker notes for my seminar defense.',
    output:
      '{"intent":"GENERATE_SLIDES","confidence":0.98,"reasoning":"User explicitly requests presentation slides and speaker notes.","selectedAgent":"Slide-Generator Agent","needsRetrieval":false}',
  },
  {
    input: 'Prepare 20 examiner viva questions categorized by difficulty.',
    output:
      '{"intent":"GENERATE_VIVA","confidence":0.97,"reasoning":"User requests viva voce examination questions and answers.","selectedAgent":"Viva Agent","needsRetrieval":false}',
  },
  {
    input: 'What hallucination rate did ARAG-Lite report in Table 1 compared to Fixed-K RAG?',
    output:
      '{"intent":"ASK_PAPER_QUESTION","confidence":0.99,"reasoning":"Specific empirical question requiring vector retrieval from paper chunks.","selectedAgent":"RAG Chat Agent","needsRetrieval":true}',
  },
  {
    input: 'Grade my viva answer: RAG combines retrieval with LLMs to reduce hallucinations.',
    output:
      '{"intent":"EVALUATE_VIVA_ANSWER","confidence":0.96,"reasoning":"User submits a practice answer for rubric evaluation.","selectedAgent":"Viva Agent","needsRetrieval":true}',
  },
];

export const INTENT_ROUTER_PROMPT = new PromptTemplate(
  `Classify the following user request for an academic research paper assistant.

Few-Shot Examples:
{few_shot_examples}

User Request:
"{user_query}"

Return JSON with: intent, confidence (0-1), reasoning, selectedAgent, needsRetrieval (boolean).`,
  ['few_shot_examples', 'user_query']
);

export const SUMMARIZER_SYSTEM_PROMPT = `You are the Summarizer Agent in PAPERWISE AI.
Your responsibility is to read extracted research paper pages and produce an accurate, structured academic synthesis.
STRICT GROUNDING RULES:
1. Ground every statement strictly in the provided research paper text.
2. Do NOT fabricate authors, metrics, datasets, baselines, or conclusions not present in the paper.
3. Explain complex technical concepts in clear, simple language in the simpleExplanations field.
4. Provide accurate page ranges (e.g., "Page 1", "Pages 3-4") for major sections found in the manuscript.`;

export const SUMMARIZER_PROMPT = new PromptTemplate(
  `Analyze the following research paper extracted page-by-page and produce a structured summary.

Document Filename: {filename}
Total Pages: {page_count}

Page-Marked Paper Content:
{paper_pages_text}

Produce a complete JSON summary covering: title, authors, abstractSummary, introductionSummary, problemStatement, objectives, methodology, results, conclusion, keyTakeaways, simpleExplanations (4-6 difficult terms explained simply), and sectionPages.`,
  ['filename', 'page_count', 'paper_pages_text']
);

export const CONCEPT_SYSTEM_PROMPT = `You are the Concept-Extractor Agent in PAPERWISE AI.
Extract core scientific concepts, formal technical definitions, beginner-friendly explanations, algorithms/methodologies, explicit research contributions, empirical findings, stated limitations, future scope, and a technical glossary.
STRICT GROUNDING RULES:
1. Only include limitations and future scope if stated or clearly implied by the uploaded paper; if not stated, explicitly note "Not explicitly specified in the paper."
2. Attach exact page references (e.g., "Page 3") to concepts and algorithms.
3. Never invent metrics or citations absent from the manuscript.`;

export const CONCEPT_PROMPT = new PromptTemplate(
  `Extract structured technical knowledge from this research paper.

Paper Title: {title}
Total Pages: {page_count}

Page-Marked Paper Content:
{paper_pages_text}

Return strict JSON containing: importantConcepts, algorithmsAndMethods, researchContributions, importantFindings, limitations, futureScope, and technicalGlossary.`,
  ['title', 'page_count', 'paper_pages_text']
);

export const SLIDE_SYSTEM_PROMPT = `You are the Slide-Generator Agent in PAPERWISE AI.
Convert the uploaded research paper into a clear, presentation-ready academic slide deck (16:9).
DESIGN & GROUNDING RULES:
1. Generate exactly {slide_count} slides adapted strictly to the paper's actual content.
2. Follow a logical academic sequence across: Title, Introduction, Problem Statement, Objectives, Literature Review, Proposed Methodology, System Architecture, Implementation, Results & Discussion, Advantages & Limitations, Future Scope, and Conclusion (adapting/merging cleanly to hit {slide_count} slides).
3. Keep each slide uncluttered: 3 to 5 concise bullet points (max 15 words per bullet).
4. Include rich speaker notes (2-4 sentences) for the presenter on every slide.
5. Never invent experimental numbers, architectures, or literature reviews if the paper does not contain them. Only populate chartData when quantitative numbers actually appear in the paper. Populate diagramNodes (3-5 sequential steps/components) when describing architecture or methodology.`;

export const SLIDE_PROMPT = new PromptTemplate(
  `Create a {slide_count}-slide academic presentation deck for the theme "{theme}" from this research paper.

Paper Title: {title}
Authors: {authors}
Total Pages: {page_count}

Page-Marked Paper Content:
{paper_pages_text}

Return strict JSON with paperTitle, sourceInfo, and slides array (length {slide_count}).`,
  ['slide_count', 'theme', 'title', 'authors', 'page_count', 'paper_pages_text']
);

export const VIVA_SYSTEM_PROMPT = `You are the Viva Agent in PAPERWISE AI, acting as an experienced university thesis/research examiner.
Generate at least 20 realistic viva voce defense questions grounded strictly in the uploaded research paper.
REQUIREMENTS:
1. Produce at least 20 questions distributed across all 6 categories:
   - Basic
   - Conceptual
   - Technical
   - Methodology
   - Results-based
   - Challenging Examiner
2. Assign balanced difficulty levels ("Easy", "Medium", "Hard").
3. For every question, provide:
   - modelAnswer: precise, academically rigorous answer grounded in the paper
   - beginnerExplanation: clear, intuitive explanation in plain English
   - pageReference: exact page(s) supporting the answer (e.g., "Page 4", "Pages 2-3")`;

export const VIVA_PROMPT = new PromptTemplate(
  `Generate at least {min_questions} viva examination questions with model answers and beginner-friendly explanations from the research paper below.

Paper Title: {title}
Total Pages: {page_count}

Page-Marked Paper Content:
{paper_pages_text}

Return strict JSON containing the questions array.`,
  ['min_questions', 'title', 'page_count', 'paper_pages_text']
);

export const VIVA_EVAL_SYSTEM_PROMPT = `You are the Viva Examiner Evaluator Agent in PAPERWISE AI using ReAct-style Rubric Reflection.
Evaluate the student's typed viva answer against BOTH the official model answer and the retrieved ground-truth passages from the research paper.
FEW-SHOT RUBRIC SCALE:
- 9-10: Accurate, complete, cites core mechanism/results accurately.
- 6-8: Fundamentally correct but omits key quantitative metrics, assumptions, or edge cases.
- 3-5: Partially relevant, vague, or contains minor technical inaccuracies.
- 0-2: Incorrect, off-topic, or contradicts the research paper.
Provide constructive strengths, specific weaknesses, missing key points, an improved model answer, and page references.`;

export const VIVA_EVAL_PROMPT = new PromptTemplate(
  `Evaluate the student's viva defense response.

Question ({category}, {difficulty}): {question}
Official Model Answer: {model_answer}
Retrieved Paper Passages (Vector RAG):
{retrieved_context}

Student's Submitted Answer:
"{user_answer}"

Reflection Step: Compare student claims against Retrieved Paper Passages before assigning a score out of 10.
Return strict JSON with score (0-10 integer), verdict, strengths, weaknesses, missingKeyPoints, improvedModelAnswer, and pageReferences.`,
  ['category', 'difficulty', 'question', 'model_answer', 'retrieved_context', 'user_answer']
);

export const RAG_CHAT_SYSTEM_PROMPT = `You are the Grounded Research Paper Chat Agent in PAPERWISE AI using ReAct (Reason + Act + Reflect) Agentic RAG.
STRICT ANTI-HALLUCINATION PROTOCOL:
1. Answer ONLY using the Retrieved Paper Chunks provided in the context (and basic metadata such as title/page count).
2. Cite explicit page numbers inline as [Page X] whenever stating facts, numbers, definitions, or results.
3. Reflection Check: If the retrieved chunks do NOT contain enough evidence to answer the user's question, you MUST explicitly state: "The uploaded research paper does not provide sufficient information to answer this question," and summarize what related topics ARE covered in the retrieved pages.
4. Never rely on outside general knowledge to invent paper results, equations, or datasets.`;

export const RAG_CHAT_PROMPT = new PromptTemplate(
  `ReAct Grounding Context for Paper: "{title}" ({page_count} pages)

Recent Conversation History:
{chat_history}

Retrieved Chunks from Vector Store (sorted by cosine similarity):
{retrieved_context}

User Question:
{user_question}

Thought & Reflection: Check whether the retrieved chunks directly answer the question. Cite [Page X] for every grounded claim.`,
  ['title', 'page_count', 'chat_history', 'retrieved_context', 'user_question']
);

export const PROMPT_SPECS: PromptEngineeringSpec[] = [
  {
    id: 'intent-router',
    agentName: 'Intent Router',
    technique: 'Few-Shot Prompting + Structured Classification',
    lcelExpression: 'INTENT_ROUTER_PROMPT | ChatGemini(gemini-4-hydrogen) | JsonOutputParser(IntentSchema)',
    systemPrompt: INTENT_ROUTER_SYSTEM_PROMPT,
    userPromptTemplate: INTENT_ROUTER_PROMPT.template,
    inputVariables: INTENT_ROUTER_PROMPT.inputVariables,
    outputSchemaName: 'IntentClassificationSchema',
    fewShotExamples: INTENT_ROUTER_FEW_SHOT,
  },
  {
    id: 'summarizer-agent',
    agentName: 'Summarizer Agent',
    technique: 'Zero-Shot Structured Synthesis + Role Prompting',
    lcelExpression: 'SUMMARIZER_PROMPT | ChatGemini(gemini-4-hydrogen) | JsonOutputParser(SummarySchema)',
    systemPrompt: SUMMARIZER_SYSTEM_PROMPT,
    userPromptTemplate: SUMMARIZER_PROMPT.template,
    inputVariables: SUMMARIZER_PROMPT.inputVariables,
    outputSchemaName: 'StructuredSummarySchema',
  },
  {
    id: 'concept-agent',
    agentName: 'Concept-Extractor Agent',
    technique: 'Zero-Shot Entity & Glossary Extraction with Grounding Constraints',
    lcelExpression: 'CONCEPT_PROMPT | ChatGemini(gemini-4-hydrogen) | JsonOutputParser(ConceptsSchema)',
    systemPrompt: CONCEPT_SYSTEM_PROMPT,
    userPromptTemplate: CONCEPT_PROMPT.template,
    inputVariables: CONCEPT_PROMPT.inputVariables,
    outputSchemaName: 'ExtractedConceptsSchema',
  },
  {
    id: 'slide-agent',
    agentName: 'Slide-Generator Agent',
    technique: 'Zero-Shot Pedagogical Decomposition + Anti-Hallucination Guard',
    lcelExpression: 'SLIDE_PROMPT | ChatGemini(gemini-4-hydrogen) | JsonOutputParser(PresentationDeckSchema)',
    systemPrompt: SLIDE_SYSTEM_PROMPT,
    userPromptTemplate: SLIDE_PROMPT.template,
    inputVariables: SLIDE_PROMPT.inputVariables,
    outputSchemaName: 'PresentationDeckSchema',
  },
  {
    id: 'viva-agent',
    agentName: 'Viva Agent (Generator & Evaluator)',
    technique: 'Multi-Tier Taxonomy + Few-Shot Rubric + ReAct Reflection',
    lcelExpression: 'VIVA_PROMPT | ChatGemini(gemini-4-hydrogen) | JsonOutputParser(VivaBankSchema)',
    systemPrompt: `${VIVA_SYSTEM_PROMPT}\n\n--- EVALUATOR SYSTEM PROMPT ---\n${VIVA_EVAL_SYSTEM_PROMPT}`,
    userPromptTemplate: `${VIVA_PROMPT.template}\n\n--- EVALUATOR TEMPLATE ---\n${VIVA_EVAL_PROMPT.template}`,
    inputVariables: [...VIVA_PROMPT.inputVariables, ...VIVA_EVAL_PROMPT.inputVariables],
    outputSchemaName: 'VivaQuestionBankSchema / VivaEvaluationSchema',
    reflectionRule: 'Compare student claims against retrieved ground-truth paper passages before scoring.',
  },
  {
    id: 'rag-chat-agent',
    agentName: 'RAG Chat Agent',
    technique: 'ReAct-Style Retrieval Decision & Faithfulness Reflection',
    lcelExpression: 'VectorRetriever(top_k) | RAG_CHAT_PROMPT | ChatGemini(gemini-4-hydrogen) | StrOutputParser()',
    systemPrompt: RAG_CHAT_SYSTEM_PROMPT,
    userPromptTemplate: RAG_CHAT_PROMPT.template,
    inputVariables: RAG_CHAT_PROMPT.inputVariables,
    outputSchemaName: 'GroundedMarkdownWithCitations',
    reflectionRule:
      'If max similarity < threshold or retrieved chunks lack supporting facts, refuse unsupported extrapolation and report retrieved scope.',
  },
];
