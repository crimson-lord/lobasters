import { jsPDF } from 'jspdf';

export const runtime = 'nodejs';

type ReportTranscript = Record<string, any>;
type ReportFormat = 'pdf' | 'markdown';

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function safeTranscript(value: unknown): ReportTranscript {
  if (typeof value !== 'string' || value.length > 2_000_000) {
    throw new Error('The report payload is missing or too large.');
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The report payload is invalid.');
  }
  const copy = JSON.parse(JSON.stringify(parsed)) as ReportTranscript;
  if (copy.config?.teacher) delete copy.config.teacher.apiKey;
  if (copy.config?.student) delete copy.config.student.apiKey;
  return copy;
}

function markdownReport(transcript: ReportTranscript) {
  const teacher = transcript.config?.teacher ?? {};
  const student = transcript.config?.student ?? {};
  const turns = Array.isArray(transcript.turns) ? transcript.turns : [];
  const rankCounts = turns.reduce((counts: Record<string, number>, turn: Record<string, any>) => {
    const rank = text(turn.evaluation?.rank);
    if (rank) counts[rank] = (counts[rank] ?? 0) + 1;
    return counts;
  }, {});

  let report = '# Examination: Final Report\n\n';
  report += '## Examination Configuration\n';
  report += `- **Evaluation of**: "${text(student.nickname, 'Student')}" (Student)\n`;
  report += `- **Evaluated by**: "${text(teacher.nickname, 'Teacher')}" (Teacher)\n`;
  report += `- **Teacher Model**: \`${text(teacher.modelName)}\`\n`;
  report += `- **Student Model**: \`${text(student.modelName)}\`\n`;
  report += `- **Question Count**: ${Number(transcript.config?.questionCount) || turns.length}\n`;
  const domains = Array.isArray(transcript.config?.domains) ? transcript.config.domains : [];
  report += `- **Domains**: ${domains.length ? domains.join(', ') : 'Not specified'}\n`;
  report += `- **Grading Scale**: ${text(transcript.config?.gradingScale)}\n`;
  report += `- **Completed On**: ${text(transcript.finishedAt, new Date().toISOString())}\n\n`;

  const summary = text(transcript.finalSummary);
  if (summary) report += `## Teacher's Final Summary\n> ${summary.replace(/\n/g, '\n> ')}\n\n`;

  report += '## Performance Metrics\n';
  report += Object.entries(rankCounts).map(([rank, count]) => `- **${rank}-Rank**: ${count}`).join('\n') || '- No graded turns';
  report += '\n\n---\n\n## Full Transcript\n\n';

  for (const turn of turns) {
    report += `### Turn ${Number(turn.turnNumber) || '?'}\n\n`;
    report += `**Teacher's Question:**\n${text(turn.question)}\n\n`;
    report += `**Student's Answer:**\n${text(turn.answer)}\n\n`;
    if (turn.evaluation) {
      report += `**Evaluation:**\n- **Grade:** ${text(turn.evaluation.rank)}\n- **Reason:** ${text(turn.evaluation.reason)}\n`;
      const message = text(turn.evaluation.message_to_student);
      if (message) report += `- **Message to Student:** ${message}\n`;
    }
    report += '\n---\n\n';
  }
  return report;
}

function pdfReport(transcript: ReportTranscript) {
  const doc = new jsPDF();
  const margin = 15;
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  let y = margin;
  const write = (label: string, value: string, bold = false) => {
    const lines = doc.splitTextToSize(value, pageWidth - margin * 2 - (label ? 5 : 0));
    const needed = Math.max(8, lines.length * 5 + (label ? 6 : 0));
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    if (label) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(bold ? 14 : 11);
      doc.text(label, margin, y);
      y += 6;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(lines, margin + (label ? 5 : 0), y);
    y += lines.length * 5 + 6;
  };

  const teacher = transcript.config?.teacher ?? {};
  const student = transcript.config?.student ?? {};
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Examination: Final Report', margin, y);
  y += 12;
  write('', `Evaluation of "${text(student.nickname, 'Student')}" by "${text(teacher.nickname, 'Teacher')}"`);
  write('', `Completed on: ${text(transcript.finishedAt, new Date().toISOString())}`);
  const summary = text(transcript.finalSummary);
  if (summary) write("Teacher's Final Summary", summary, true);

  write('Full Transcript', '', true);
  const turns = Array.isArray(transcript.turns) ? transcript.turns : [];
  for (const turn of turns) {
    write(`Turn ${Number(turn.turnNumber) || '?'}`, '', false);
    write('Question', text(turn.question));
    write('Answer', text(turn.answer));
    if (turn.evaluation) write('Evaluation', `Grade: ${text(turn.evaluation.rank)}\nReason: ${text(turn.evaluation.reason)}`);
  }
  return new Uint8Array(doc.output('arraybuffer'));
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const format = form.get('format');
    if (format !== 'pdf' && format !== 'markdown') {
      return Response.json({ error: 'format must be pdf or markdown.' }, { status: 400 });
    }
    const transcript = safeTranscript(form.get('transcript'));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `Examination_Report_${timestamp}.${format === 'pdf' ? 'pdf' : 'md'}`;
    const body = format === 'pdf'
      ? pdfReport(transcript)
      : markdownReport(transcript);
    return new Response(body, {
      headers: {
        'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create report.' }, { status: 400 });
  }
}
