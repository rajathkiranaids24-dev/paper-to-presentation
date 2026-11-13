import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import type { StructuredSummary, VivaQuestionBank } from '../../src/types/paperwise.ts';

export async function buildSummaryDocxBuffer(summary: StructuredSummary): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      text: summary.title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Authors: ${summary.authors}`, italics: true, color: '475569' }),
      ],
      spacing: { after: 280 },
    }),
  ];

  const addSection = (heading: string, body: string) => {
    children.push(
      new Paragraph({
        text: heading,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 220, after: 100 },
      }),
      new Paragraph({
        text: body,
        spacing: { after: 160 },
      })
    );
  };

  addSection('Abstract Summary', summary.abstractSummary);
  addSection('Introduction Summary', summary.introductionSummary);
  addSection('Problem Statement', summary.problemStatement);

  children.push(
    new Paragraph({
      text: 'Research Objectives',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 220, after: 100 },
    })
  );
  for (const obj of summary.objectives) {
    children.push(
      new Paragraph({
        text: obj,
        bullet: { level: 0 },
        spacing: { after: 80 },
      })
    );
  }

  addSection('Methodology', summary.methodology);
  addSection('Results & Findings', summary.results);
  addSection('Conclusion', summary.conclusion);

  children.push(
    new Paragraph({
      text: 'Key Takeaways',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 220, after: 100 },
    })
  );
  for (const item of summary.keyTakeaways) {
    children.push(
      new Paragraph({
        text: item,
        bullet: { level: 0 },
        spacing: { after: 80 },
      })
    );
  }

  if (summary.simpleExplanations.length > 0) {
    children.push(
      new Paragraph({
        text: 'Complex Concepts Explained Simply',
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 220, after: 100 },
      })
    );
    for (const item of summary.simpleExplanations) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${item.term}: `, bold: true }),
            new TextRun({ text: item.explanation }),
          ],
          spacing: { after: 100 },
        })
      );
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

export async function buildVivaDocxBuffer(
  paperTitle: string,
  viva: VivaQuestionBank
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      text: `Viva Voce Question Bank — ${paperTitle}`,
      heading: HeadingLevel.TITLE,
      spacing: { after: 160 },
    }),
    new Paragraph({
      text: `Total Examiner Questions: ${viva.totalCount}`,
      spacing: { after: 280 },
    }),
  ];

  viva.questions.forEach((q, idx) => {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Q${idx + 1}. [${q.category} · ${q.difficulty} · ${q.pageReference}] `,
            bold: true,
            color: '1E3A8A',
          }),
          new TextRun({ text: q.question, bold: true }),
        ],
        spacing: { before: 180, after: 80 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Model Answer: ', bold: true }),
          new TextRun({ text: q.modelAnswer }),
        ],
        spacing: { after: 60 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Beginner Explanation: ', bold: true, color: '475569' }),
          new TextRun({ text: q.beginnerExplanation, color: '475569' }),
        ],
        spacing: { after: 140 },
      })
    );
  });

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
