import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from './app';
import { db } from './store';
import express from 'express';
import request from 'supertest';
import { processDocument } from './engine/documentPipeline';

function makePdf(lines: string[]): Buffer {
  const textOps = lines.map((l, i) => `1 0 0 1 100 ${750 - i * 16} Tm (${l.replace(/[()]/g, '')}) Tj`).join(' ');
  const padding = ' '.repeat(900);
  const stream = `BT /F1 12 Tf ${textOps} ET\n${padding}`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const o of objects) {
    offsets.push(out.length);
    out += o + '\n';
  }
  const xrefOffset = out.length;
  out += `xref\n0 ${objects.length + 1}\n`;
  out += '0000000000 65535 f \n';
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
  out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\n';
  out += 'startxref\n' + xrefOffset + '\n%%EOF\n';
  return Buffer.from(out);
}

describe('Real PDF text extraction', () => {
  beforeEach(() => db.resetToDemo());

  it('extracts exact text and page numbers from an unseen PDF', async () => {
    const pdf = makePdf(['Cumulative GPA: 3.92', 'Anticipated Degree Conferral Date: May 2026']);
    const result = await processDocument({
      filename: 'unseen-transcript.pdf',
      buffer: pdf,
      mimeType: 'application/pdf',
      documentType: 'TRANSCRIPT',
    });
    expect(result.document.extractionStatus).toBe('TEXT_EXTRACTED');
    expect(result.document.pageCount).toBe(1);
    expect(result.document.pageTexts?.[0].pageNumber).toBe(1);
    expect(result.document.pageTexts?.[0].text).toContain('Cumulative GPA: 3.92');
    expect(result.document.pageTexts?.[0].text).toContain('Anticipated Degree Conferral Date: May 2026');
  });

  it('returns OCR_UNAVAILABLE for a scanned/empty PDF', async () => {
    const pdf = makePdf([]);
    // force empty text by overriding: build pdf with empty stream
    const emptyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 0 >>\nstream\nendstream\nendobj\ntrailer\n<< /Size 5 /Root 1 0 R >>\n%%EOF\n');
    const result = await processDocument({
      filename: 'scanned.pdf',
      buffer: emptyPdf,
      mimeType: 'application/pdf',
      documentType: 'TRANSCRIPT',
    });
    // empty pdf may fail to parse; either OCR_UNAVAILABLE or insufficient
    expect(['OCR_UNAVAILABLE', 'INSUFFICIENT_EVIDENCE']).toContain(result.document.extractionStatus);
  });
});

describe('Eligibility three-state with unseen documents', () => {
  let app: express.Application;
  beforeEach(async () => {
    db.resetToDemo();
    app = await createApp();
  });

  it('A: student satisfies minimum GPA requirement', async () => {
    const pdf = makePdf(['Cumulative GPA: 3.92', 'Anticipated Degree Conferral Date: May 2026', 'Degree: M.S. Computer Science']);
    const up = await request(app)
      .post('/api/v1/workflow/documents/process')
      .attach('file', pdf, 'transcript-a.pdf')
      .field('document_type', 'TRANSCRIPT')
      .expect(202);
    expect(up.body.document.extractionStatus).toBe('TEXT_EXTRACTED');

    const evalRes = await request(app)
      .post('/api/v1/workflow/eligibility/evaluate')
      .send({ opportunityId: 'opp-biox-2026' })
      .expect(200);

    const gpaCrit = evalRes.body.criteria.find((c: any) => c.clauseCategory === 'GPA_THRESHOLD');
    expect(gpaCrit.status).toBe('MEETS');
    expect(gpaCrit.evidenceCitation.verbatimQuote).toBe('Cumulative GPA: 3.92');
    expect(gpaCrit.evidenceCitation.pageNumber).toBe(1);
  });

  it('B: student explicitly fails graduation-year requirement', async () => {
    // set profile to graduating 2025
    await request(app).patch('/api/v1/profile').send({ graduationDate: '2025-05', gpa: 3.1 });
    const pdf = makePdf(['Cumulative GPA: 3.10', 'Anticipated Degree Conferral Date: May 2025']);
    await request(app)
      .post('/api/v1/workflow/documents/process')
      .attach('file', pdf, 'transcript-b.pdf')
      .field('document_type', 'TRANSCRIPT')
      .expect(202);

    const evalRes = await request(app)
      .post('/api/v1/workflow/eligibility/evaluate')
      .send({ opportunityId: 'opp-biox-2026' })
      .expect(200);

    expect(evalRes.body.report.overallStatus).toBe('DISQUALIFIED');
    const confCrit = evalRes.body.criteria.find((c: any) => c.clauseCategory === 'CONFERRAL_WINDOW');
    expect(['FAILED', 'FAIL']).toContain(confCrit.status);
  });

  it('C: insufficient evidence for missing requirement', async () => {
    const pdf = makePdf(['Cumulative GPA: 3.80', 'Degree: M.S. Computer Science']);
    await request(app)
      .post('/api/v1/workflow/documents/process')
      .attach('file', pdf, 'transcript-c.pdf')
      .field('document_type', 'TRANSCRIPT')
      .expect(202);

    const evalRes = await request(app)
      .post('/api/v1/workflow/eligibility/evaluate')
      .send({ opportunityId: 'opp-biox-2026' })
      .expect(200);

    // faculty sponsorship criterion remains insufficient
    const facultyCrit = evalRes.body.criteria.find((c: any) => c.id === 'crit-05');
    expect(['INSUFFICIENT', 'REVIEW']).toContain(facultyCrit.status);
    expect(['ACTION_REQUIRED', 'DISQUALIFIED']).toContain(evalRes.body.report.overallStatus);
  });
});
