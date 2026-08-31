import { jsPDF } from 'jspdf';
import { inlineCode } from './markdown';

export const runtime = 'nodejs';

type LabReportFormat = 'markdown' | 'pdf' | 'json' | 'zip';
type JsonObject = Record<string, any>;

const sensitiveKeyPattern = /^(?:api[_-]?key|authorization|access[_-]?token|secret)$/i;

function collectSecrets(value: unknown) {
  const secrets = new Set<string>();
  const visit = (current: unknown) => {
    if (current === null || typeof current !== 'object') return;
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    for (const [key, entry] of Object.entries(current as Record<string, unknown>)) {
      if (sensitiveKeyPattern.test(key) && typeof entry === 'string' && entry) secrets.add(entry);
      else visit(entry);
    }
  };
  visit(value);
  return [...secrets].sort((left, right) => right.length - left.length);
}

function sanitize(value: unknown, secrets: string[]): unknown {
  if (typeof value === 'string') {
    return secrets.reduce((text, secret) => text.split(secret).join('[REDACTED]'), value);
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(entry => sanitize(entry, secrets));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !sensitiveKeyPattern.test(key) && key !== 'turnCheckpoints')
      .map(([key, entry]) => [key, sanitize(entry, secrets)]),
  );
}

function safeState(value: unknown): JsonObject {
  if (typeof value !== 'string' || value.length > 10_000_000) {
    throw new Error('The LAB report payload is missing or too large.');
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('The LAB report payload is invalid.');
  }
  return sanitize(parsed, collectSecrets(parsed)) as JsonObject;
}

function string(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function sectionText(value: unknown, fallback = '*No data captured.*') {
  const text = string(value).trim();
  return text || fallback;
}

function markdownReport(state: JsonObject) {
  const config = state.config ?? {};
  const master = config.masterAgent ?? {};
  const helpers = Array.isArray(config.llmConnections) ? config.llmConnections : [];
  const challenges = Array.isArray(state.challenges) ? state.challenges : [];
  const virtualFiles = state.virtualFiles && typeof state.virtualFiles === 'object' ? state.virtualFiles : {};
  const completedChallenges = challenges.filter((challenge: JsonObject) => challenge?.isCompleted).length;
  const started = Number(state.sessionStartTime);

  let report = '# Lobasters LAB: Research Session Report\n\n';
  report += `- **Status:** ${string(state.status, 'unknown')}\n`;
  report += `- **Current turn:** ${Number(state.turnNumber) || 0}\n`;
  report += `- **Started:** ${Number.isFinite(started) && started > 0 ? new Date(started).toISOString() : 'Not recorded'}\n`;
  report += `- **Exported:** ${new Date().toISOString()}\n`;
  report += `- **Challenge source:** ${string(config.questionSource, 'unknown')}\n`;
  report += `- **Challenges complete:** ${completedChallenges}/${challenges.length}\n\n`;

  report += '## Model Configuration\n\n';
  report += `- **Master model:** ${inlineCode(master.modelName)}\n`;
  report += `- **Master base URL:** ${inlineCode(master.baseURL)}\n`;
  report += `- **Master temperature:** ${Number.isFinite(Number(master.temperature)) ? Number(master.temperature) : 'Not configured'}\n`;
  report += `- **Reasoning capture:** ${string(master.reasoningCaptureMethod, 'none')}\n`;
  report += `- **Helper agents enabled:** ${Boolean(config.allowHelperAgents)}\n`;
  if (helpers.length) {
    report += helpers.map((helper: JsonObject) =>
      `  - **${string(helper.nickname, string(helper.id, 'Helper'))}:** ${inlineCode(helper.modelName)} via ${inlineCode(helper.baseURL)}`,
    ).join('\n');
    report += '\n';
  }
  report += '\n> Provider API keys are intentionally excluded from this report.\n\n';

  report += '## Challenge Results\n\n';
  if (!challenges.length) {
    report += '*This session did not track structured challenge records.*\n\n';
  } else {
    for (const challenge of challenges) {
      report += `### Challenge ${Number(challenge.challengeNumber) || '?'} — ${challenge.isCompleted ? 'Complete' : 'Incomplete'}\n\n`;
      report += `**Question**\n\n${sectionText(challenge.question, '*Not uploaded.*')}\n\n`;
      report += `**Submitted answer**\n\n${sectionText(challenge.submittedAnswer, '*Not uploaded.*')}\n\n`;
      report += `**Final answer**\n\n${sectionText(challenge.finalAnswer, '*Not provided.*')}\n\n`;
    }
  }

  report += '## Final Virtual Workspace\n\n';
  for (const [fileName, fileValue] of Object.entries(virtualFiles)) {
    const file = fileValue as JsonObject;
    report += `### ${fileName}\n\n${sectionText(file?.content)}\n\n`;
  }

  report += '## Activity Log\n\n';
  const log = Array.isArray(state.log) ? state.log : [];
  report += log.length ? log.map((entry: unknown, index: number) => `${index + 1}. ${string(entry)}`).join('\n') : '*No activity logged.*';
  report += '\n\n';

  report += '## Errors\n\n';
  const errors = Array.isArray(state.errors) ? state.errors : [];
  report += errors.length ? errors.map((entry: unknown, index: number) => `${index + 1}. ${string(entry)}`).join('\n') : '*No errors captured.*';
  report += '\n\n';

  report += '## Helper-Agent Hub\n\n';
  const hub = Array.isArray(state.hubMessages) ? state.hubMessages : [];
  if (hub.length) {
    report += hub.map((message: JsonObject) =>
      `### ${string(message.agentNickname, 'Helper')} — ${string(message.timestamp, 'time not recorded')}\n\n${sectionText(message.content)}`,
    ).join('\n\n');
  } else {
    report += '*No helper-agent messages captured.*';
  }
  report += '\n\n## Raw Master-Agent Transcript\n\n```json\n';
  report += JSON.stringify(Array.isArray(state.history) ? state.history : [], null, 2);
  report += '\n```\n';
  return report;
}

function pdfReport(markdown: string) {
  const doc = new jsPDF();
  const margin = 15;
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const writeLine = (rawLine: string) => {
    const heading = rawLine.match(/^(#{1,3})\s+(.*)$/);
    const line = (heading ? heading[2] : rawLine)
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/^>\s?/, '') || ' ';
    const fontSize = heading ? (heading[1].length === 1 ? 18 : heading[1].length === 2 ? 14 : 12) : 9;
    const style = heading ? 'bold' : 'normal';
    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(line, maxWidth) as string[];
    const lineHeight = heading ? 7 : 4.5;
    for (const wrappedLine of lines) {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(wrappedLine, margin, y);
      y += lineHeight;
    }
    if (heading) y += 2;
  };

  for (const line of markdown.split(/\r?\n/)) writeLine(line);
  return new Uint8Array(doc.output('arraybuffer'));
}

let crcTable: Uint32Array | undefined;

function crc32(data: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index++) {
      let value = index;
      for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f),
  };
}

function zipArchive(files: Array<{ name: string; content: string }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const stamp = dosDateTime(new Date());

  for (const file of files) {
    const name = Buffer.from(file.name.replace(/\\/g, '/'), 'utf8');
    const data = Buffer.from(file.content, 'utf8');
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(stamp.time, 10);
    localHeader.writeUInt16LE(stamp.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, name, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(stamp.time, 12);
    centralHeader.writeUInt16LE(stamp.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return new Uint8Array(Buffer.concat([...localParts, centralDirectory, end]));
}

function safeFileName(name: string) {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
  return cleaned || 'unnamed-file.md';
}

function zipReport(state: JsonObject, markdown: string) {
  const files: Array<{ name: string; content: string }> = [
    { name: 'LAB_Report.md', content: markdown },
    { name: 'LAB_Session.json', content: JSON.stringify(state, null, 2) },
    { name: 'Raw_Transcript.json', content: JSON.stringify(Array.isArray(state.history) ? state.history : [], null, 2) },
    { name: 'Activity_Log.txt', content: (Array.isArray(state.log) ? state.log : []).join('\n') },
    { name: 'Errors.txt', content: (Array.isArray(state.errors) ? state.errors : []).join('\n') },
  ];
  const workspace = state.virtualFiles && typeof state.virtualFiles === 'object' ? state.virtualFiles : {};
  for (const [name, fileValue] of Object.entries(workspace)) {
    files.push({ name: `workspace/${safeFileName(name)}`, content: string((fileValue as JsonObject)?.content) });
  }
  return zipArchive(files);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const format = form.get('format');
    if (format !== 'markdown' && format !== 'pdf' && format !== 'json' && format !== 'zip') {
      return Response.json({ error: 'format must be markdown, pdf, json, or zip.' }, { status: 400 });
    }
    const state = safeState(form.get('state'));
    const markdown = markdownReport(state);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = format === 'markdown' ? 'md' : format;
    const filename = `LAB_Report_${timestamp}.${extension}`;
    let body: string | Uint8Array;
    let contentType: string;
    if (format === 'markdown') {
      body = markdown;
      contentType = 'text/markdown; charset=utf-8';
    } else if (format === 'pdf') {
      body = pdfReport(markdown);
      contentType = 'application/pdf';
    } else if (format === 'json') {
      body = JSON.stringify(state, null, 2);
      contentType = 'application/json; charset=utf-8';
    } else {
      body = zipReport(state, markdown);
      contentType = 'application/zip';
    }
    const responseBody: BodyInit = typeof body === 'string'
      ? body
      : body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    return new Response(responseBody, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Could not create LAB report.' }, { status: 400 });
  }
}
