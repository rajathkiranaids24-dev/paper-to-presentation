import fs from 'fs';
import path from 'path';

// Pure minimal valid PDF 1.4 generator for a 6-page sample research paper
const pagesContent = [
  [
    'Adaptive Retrieval-Augmented Generation for Resource-Constrained Academic Question Answering',
    'Authors: Dr. Ananya Rao, Prof. Vikram Menon, and Siddharth Kulkarni',
    'Department of Computer Science & Engineering, Indian Institute of Technology Madras',
    'Published in: Proceedings of the International Conference on Applied Agentic Systems (ICAAS 2025)',
    '',
    'ABSTRACT',
    'Large Language Models (LLMs) demonstrate strong generative fluency yet remain prone to factual',
    'hallucinations when queried on specialized academic literature not present in pre-training corpora.',
    'Standard Retrieval-Augmented Generation (RAG) mitigates this issue by retrieving fixed top-k text',
    'chunks for every incoming query. However, static retrieval introduces unnecessary latency on simple',
    'queries and insufficient context coverage on multi-hop technical questions.',
    '',
    'In this paper, we propose ARAG-Lite (Adaptive Retrieval-Augmented Generation for Academic',
    'Documents), a multi-agent pipeline combining lightweight intent classification, dynamic chunk',
    'sizing, and ReAct-style self-reflection. Evaluated across 420 peer-reviewed computer science',
    'papers and 1,800 examiner-style viva questions, ARAG-Lite improves citation faithfulness by 18.4%',
    'over fixed-k RAG while reducing average token overhead by 27.2% and end-to-end latency by 31.5%.',
    '',
    '1. INTRODUCTION',
    'Academic researchers, postgraduate students, and examiners routinely process dense 10-to-30 page',
    'research manuscripts under tight time constraints. Preparing structured lecture slides and viva',
    'voce defense questions manually requires extracting problem formulations, algorithmic workflows,',
    'empirical tables, and limitations without distorting original author claims.',
    '',
    'Conventional summarization pipelines feed entire documents into long-context models, which leads',
    'to "lost-in-the-middle" degradation when key experimental baselines reside on intermediate pages.',
    'Conversely, naive RAG architectures trigger vector similarity searches indiscriminately—even when',
    'a user requests a high-level structural synthesis—and fail to verify whether retrieved chunks',
    'genuinely support generated claims.'
  ],
  [
    '1.1 Research Problem Statement',
    'Existing document-grounded assistants suffer from three interconnected bottlenecks:',
    '1) Hallucinated Extrapolation: Generative models frequently invent baseline numbers, dataset',
    'sizes, or future work items that do not appear in the source manuscript.',
    '2) Static Retrieval Blindness: Fixed top-k cosine similarity retrieval cannot distinguish between',
    'global structural queries (e.g., summarizing contributions) and localized factoid queries (e.g.,',
    'checking Table 2 hyperparameter values).',
    '3) Unstructured Pedagogical Output: Standard Q&A systems fail to scaffold explanations across',
    'cognitive difficulty tiers suitable for viva examination preparation.',
    '',
    '1.2 Research Objectives',
    'The primary objectives of this work are:',
    '- Objective 1: Design an intent-driven multi-agent router that classifies academic tasks into',
    '  summarization, concept extraction, slide synthesis, viva generation, and grounded Q&A.',
    '- Objective 2: Implement page-aware overlapping chunking paired with dense vector indexing',
    '  to preserve exact provenance metadata ([Page X]) for every generated claim.',
    '- Objective 3: Introduce a ReAct-based faithfulness verification loop that rejects unsupported',
    '  claims when cosine similarity falls below an empirical grounding threshold (tau = 0.42).',
    '- Objective 4: Benchmark ARAG-Lite against Zero-Shot LLM and Fixed-K RAG baselines.',
    '',
    '2. LITERATURE REVIEW',
    'Lewis et al. (2020) formalized Retrieval-Augmented Generation by coupling parametric sequence-to-',
    'sequence models with non-parametric dense passage retrieval over Wikipedia. Subsequent work by',
    'Asai et al. (2023) introduced Self-RAG, training models to emit reflection tokens indicating',
    'retrieval necessity. While Self-RAG improves factuality on open-domain QA, it requires fine-tuning',
    '7B-13B parameter weights, making deployment impractical in university labs.',
    'Gao et al. (2024) surveyed modular RAG architectures and highlighted query routing and',
    'reranking as decisive factors in domain-specific precision. Building on LangChain Expression',
    'Language (LCEL), recent agentic workflows compose PromptTemplates, structured output parsers,',
    'and vector stores without weight fine-tuning. However, prior systems lack unified multi-agent',
    'orchestration tailored specifically to academic slide generation and viva evaluation.'
  ],
  [
    '3. PROPOSED METHODOLOGY & SYSTEM ARCHITECTURE',
    'ARAG-Lite operates as a four-stage deterministic-plus-agentic pipeline:',
    '',
    'Stage 1: Page-Aware PDF Ingestion & Recursive Chunking',
    'Incoming PDF documents are parsed page-by-page using PyMuPDF (fitz) to retain exact physical',
    'page indices. Text is normalized to strip running headers and segmented using a recursive',
    'character splitter with chunk size C = 900 characters and overlap O = 150 characters. Each',
    'chunk stores metadata: {document_id, page_number, chunk_index, section_hint}.',
    '',
    'Stage 2: Dense Vector Embedding & Isolated Collection Indexing',
    'Each chunk is encoded into a 768-dimensional dense vector using Gemini Embedding-2 (or',
    'all-MiniLM-L6-v2 for offline deployments) and persisted inside a document-isolated ChromaDB',
    'collection. Isolation guarantees zero cross-paper contamination when multiple papers are active.',
    '',
    'Stage 3: Few-Shot Intent Detection & Agent Routing',
    'User requests pass through an LCEL Intent Router (FewShotPromptTemplate | LLM | JSONParser)',
    'which classifies the request into six intents: SUMMARIZE_PAPER, EXTRACT_CONCEPTS,',
    'GENERATE_SLIDES, GENERATE_VIVA, ASK_PAPER_QUESTION, and EVALUATE_VIVA_ANSWER.',
    '',
    'Stage 4: Specialized LCEL Agents & ReAct Grounding Loop',
    '- Summarizer Agent: Synthesizes abstract, problem statement, objectives, methodology, and',
    '  conclusions using map-reduce section prompts.',
    '- Concept-Extractor Agent: Extracts algorithms, formal definitions, contributions, and glossary.',
    '- Slide-Generator Agent: Produces 8-12 structured 16:9 slides with speaker notes and charts.',
    '- Viva Agent: Generates multi-difficulty examiner questions and evaluates student responses',
    '  against retrieved ground-truth passages using rubric-guided reflection.'
  ],
  [
    '3.1 ReAct Faithfulness Reflection Algorithm',
    'For every user question Q in Research Paper Chat, the RAG Chat Agent executes a 4-step loop:',
    'Step 1 (Thought): Determine whether Q requires localized evidence retrieval or document metadata.',
    'Step 2 (Action): Query ChromaDB collection with cosine similarity search for top-k = 5 chunks.',
    'Step 3 (Observation): Inspect retrieved similarity scores S = {s_1, ..., s_k} and page tags.',
    'Step 4 (Reflection & Response): If max(S) < 0.35 or evidence is absent, explicitly state that',
    'the paper does not contain the requested information. Otherwise synthesize an answer citing',
    'exact page references [Page P].',
    '',
    '4. IMPLEMENTATION DETAILS',
    'The reference prototype is implemented with a FastAPI REST backend (Python 3.11) and a React',
    'TypeScript client. Prompt orchestration uses LangChain Expression Language (LCEL) chains of the',
    'form `prompt | chat_model | pydantic_output_parser`. PowerPoint decks are compiled natively',
    'in 16:9 widescreen format (13.333 x 7.5 inches) using python-pptx with speaker notes attached',
    'to each slide XML node. The embedding batch processor enforces exponential backoff (base 500ms,',
    'max 3 retries) to handle API rate limits gracefully.',
    '',
    '5. EXPERIMENTAL RESULTS AND DISCUSSION',
    'We evaluated ARAG-Lite on the ScholarBench-420 dataset comprising 420 arXiv papers across',
    'Machine Learning, Distributed Systems, and Cybersecurity, paired with 1,800 human-verified',
    'viva questions. Three configurations were compared:',
    '1) Zero-Shot Full-Text LLM (no retrieval routing)',
    '2) Fixed-K Standard RAG (k = 4, no ReAct reflection)',
    '3) ARAG-Lite (Intent Router + Dynamic k = 5 + ReAct Faithfulness Guard)'
  ],
  [
    '5.1 Quantitative Benchmark Comparison (Table 1)',
    'Metric                          Zero-Shot LLM    Fixed-K RAG    ARAG-Lite (Proposed)',
    'Citation Faithfulness (%)            71.2            79.8            94.5',
    'Answer Completeness (%)              82.4            80.1            91.8',
    'Hallucination Rate (%)               19.6            11.4             3.2',
    'Average End-to-End Latency (s)        4.8             3.5             2.4',
    'Token Overhead per Query (tokens)   6,420           3,810           2,774',
    '',
    'As shown in Table 1, ARAG-Lite achieves 94.5% citation faithfulness (+14.7 percentage points',
    'over Fixed-K RAG, representing an 18.4% relative improvement) while cutting hallucination rate',
    'from 19.6% (Zero-Shot) and 11.4% (Fixed-K RAG) down to 3.2%. Latency drops by 31.5% compared',
    'to Fixed-K RAG because structural queries bypass unnecessary vector search reranking.',
    '',
    '5.2 Ablation Study on Viva Evaluation Accuracy',
    'We asked 30 university faculty examiners to blind-rate 300 student viva answers graded by',
    'ARAG-Lite on a 0-10 scale. Pearson correlation between human examiner scores and ARAG-Lite',
    'scores reached r = 0.89 (p < 0.001) when rubric-guided few-shot reflection was enabled, versus',
    'r = 0.71 without RAG ground-truth chunk injection.',
    '',
    '6. ADVANTAGES AND LIMITATIONS',
    'Advantages:',
    '- Zero model fine-tuning required; operates purely via modular LCEL prompt chains and RAG.',
    '- High citation verifiability with explicit page-level provenance.',
    '- Automated generation of editable 16:9 PowerPoint presentations and tiered viva banks.',
    'Limitations:',
    '- Scanned image-only PDFs without an embedded OCR text layer yield empty extraction.',
    '- Complex multi-column mathematical equations in LaTeX PDFs may lose spatial symbol alignment',
    '  during plain-text extraction.',
    '- ChromaDB cosine similarity relies on lexical-semantic overlap and can miss implicit visual',
    '  trends encoded solely inside raster figures.'
  ],
  [
    '7. FUTURE SCOPE',
    'Future extensions of ARAG-Lite will focus on three concrete directions:',
    '1) Multimodal Figure & Chart Parsing: Integrating vision-language embeddings to index plots,',
    '   circuit diagrams, and confusion matrices directly from PDF page renders.',
    '2) Hybrid BM25 + Dense Reciprocal Rank Fusion: Combining sparse keyword matching for rare',
    '   mathematical symbols and acronyms with dense semantic retrieval.',
    '3) Interactive Voice Viva Simulator: Extending the Viva Practice module with low-latency',
    '   real-time speech recognition and spoken follow-up probing.',
    '',
    '8. CONCLUSION',
    'This paper presented ARAG-Lite, an adaptive multi-agent RAG framework designed for automated',
    'research paper comprehension, presentation synthesis, and viva preparation. By combining',
    'page-aware PDF chunking, isolated ChromaDB vector collections, few-shot intent routing,',
    'and ReAct faithfulness verification, ARAG-Lite achieves 94.5% citation faithfulness and 3.2%',
    'hallucination rate while reducing token consumption by 27.2%.',
    '',
    'REFERENCES',
    '[1] Lewis, P., Perez, E., Piktus, A., et al. (2020). Retrieval-Augmented Generation for',
    '    Knowledge-Intensive NLP Tasks. Advances in Neural Information Processing Systems (NeurIPS).',
    '[2] Asai, A., Wu, Z., Wang, Y., Sil, A., & Hajishirzi, H. (2023). Self-RAG: Learning to',
    '    Retrieve, Generate, and Critique through Self-Reflection. ICLR 2024.',
    '[3] Gao, Y., Xiong, Y., Gao, X., et al. (2024). Retrieval-Augmented Generation for Large',
    '    Language Models: A Survey. arXiv preprint arXiv:2312.10997.',
    '[4] Yao, S., Zhao, J., Yu, D., et al. (2023). ReAct: Synergizing Reasoning and Acting in',
    '    Language Models. International Conference on Learning Representations (ICLR).'
  ]
];

function escapePdfText(str) {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildPdf(pages) {
  const objects = [];
  // 1: Catalog, 2: Pages, 3: Font
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  const pageObjIds = [];
  const baseObjId = 4;
  for (let i = 0; i < pages.length; i++) {
    pageObjIds.push(baseObjId + i * 2);
  }
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`
  );
  objects.push(
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  );

  for (let i = 0; i < pages.length; i++) {
    const pageObjId = baseObjId + i * 2;
    const contentObjId = pageObjId + 1;
    const lines = pages[i];
    const streamLines = [
      'BT',
      '/F1 10.5 Tf',
      '54 745 Td',
      '15 TL',
    ];
    for (const line of lines) {
      streamLines.push(`(${escapePdfText(line)}) Tj T*`);
    }
    streamLines.push('ET');
    const stream = streamLines.join('\n');

    objects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjId} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjId} 0 obj\n<< /Length ${Buffer.byteLength(stream, 'utf8')} >>\nstream\n${stream}\nendstream\nendobj\n`
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

const outDir = path.resolve(process.cwd(), 'sample_papers');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'adaptive_rag_academic_survey.pdf');
fs.writeFileSync(outPath, buildPdf(pagesContent));
console.log(`Generated ${outPath} (${fs.statSync(outPath).size} bytes)`);
