/**
 * Integration Tests for Quali Application Workflow
 * 
 * Tests cover:
 * 1. Profile validation and submission
 * 2. Document upload and processing
 * 3. Evidence extraction
 * 4. Eligibility evaluation
 * 5. Checklist generation
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { createApp } from './app';
import { db } from './store';
import express from 'express';
import request from 'supertest';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Create test app instance
function createTestApp() {
  const app = createApp();
  return app;
}

describe('Workflow Integration Tests', () => {
  let app: express.Application;

  // Helper to create unique test PDFs with sufficient size
  const createTestPdf = (seed: string): Buffer => {
    // Create a larger PDF content to pass minimum size validation (>1024 bytes)
    const padding = ' '.repeat(800); // Add padding to ensure >1024 bytes
    const pdfContent = `
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R /Custom "${seed}" >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length ${padding.length} >>
stream
${padding}
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000060 00000 n 
0000000120 00000 n 
0000000190 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
${500 + padding.length}
%%EOF
`.trim();
    return Buffer.from(pdfContent);
  };

  beforeEach(() => {
    // Reset store to clean state before each test to avoid duplicate document conflicts
    db.resetToDemo();
  });

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => {
    // Cleanup if needed
  });

  afterEach(() => {
    // Reset store after each test as well
    db.resetToDemo();
  });

  describe('Profile Validation & Submission', () => {
    const validProfile = {
      fullName: 'Test Candidate',
      email: 'test@example.edu',
      institution: 'Test University',
      degree: 'M.S. Computer Science',
      educationTier: 'masters' as const,
      graduationDate: '2026-06',
      gpa: 3.85,
      workAuthorization: 'f1-opt' as const,
      domainTags: [{ name: 'Machine Learning', verified: true }],
    };

    it('should validate a correct profile submission', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/profile/validate')
        .send(validProfile)
        .expect(200);

      expect(response.body).toHaveProperty('valid', true);
      expect(response.body.errors).toHaveLength(0);
    });

    it('should reject profile with invalid email', async () => {
      const invalidProfile = { ...validProfile, email: 'not-an-email' };
      
      const response = await request(app)
        .post('/api/v1/workflow/profile/validate')
        .send(invalidProfile)
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors.some((e: { field: string }) => e.field === 'email')).toBe(true);
    });

    it('should reject profile with GPA out of range', async () => {
      const invalidProfile = { ...validProfile, gpa: 5.0 };
      
      const response = await request(app)
        .post('/api/v1/workflow/profile/validate')
        .send(invalidProfile)
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors.some((e: { field: string }) => e.field === 'gpa')).toBe(true);
    });

    it('should reject profile with invalid education tier', async () => {
      const invalidProfile = { ...validProfile, educationTier: 'high-school' as any };
      
      const response = await request(app)
        .post('/api/v1/workflow/profile/validate')
        .send(invalidProfile)
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors.some((e: { field: string }) => e.field === 'educationTier')).toBe(true);
    });

    it('should accept valid profile submission', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/profile/submit')
        .send(validProfile)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.fullName).toBe(validProfile.fullName);
      expect(response.body.email).toBe(validProfile.email);
      expect(response.body.institution).toBe(validProfile.institution);
      expect(response.body.educationTier).toBe(validProfile.educationTier);
    });

    it('should reject profile submission with validation errors', async () => {
      const invalidProfile = { ...validProfile, email: 'invalid' };
      
      const response = await request(app)
        .post('/api/v1/workflow/profile/submit')
        .send(invalidProfile)
        .expect(400);

      expect(response.body).toHaveProperty('code', 'VALIDATION_FAILED');
      expect(response.body).toHaveProperty('detail');
    });
  });

  describe('Document Upload & Processing', () => {
    it('should accept valid PDF upload', async () => {
      const pdfBuffer = createTestPdf('test-doc');
      
      const response = await request(app)
        .post('/api/v1/workflow/documents/process')
        .attach('file', pdfBuffer, 'test-document.pdf')
        .field('document_type', 'TRANSCRIPT')
        .expect(202);

      expect(response.body).toHaveProperty('requestId');
      expect(response.body).toHaveProperty('document');
      expect(response.body.document.name).toBe('test-document.pdf');
      expect(response.body.document.documentType).toBe('TRANSCRIPT');
      expect(response.body.document.status).toBe('INDEXED');
      expect(response.body).toHaveProperty('extractedCitations');
    });

    it('should reject upload without file', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/documents/process')
        .field('document_type', 'TRANSCRIPT')
        .expect(400);

      expect(response.body.code).toBe('MISSING_FILE');
    });

    it('should reject upload of unsupported file type', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/documents/process')
        .attach('file', Buffer.from('not a pdf'), 'test.txt')
        .field('document_type', 'TRANSCRIPT')
        .expect(400);

      expect(response.body.code).toBe('INVALID_MIME_TYPE');
    });

    it('should detect duplicate documents via SHA-256', async () => {
      const pdfBuffer = createTestPdf('duplicate-test');
      
      // First upload should succeed
      const firstResponse = await request(app)
        .post('/api/v1/workflow/documents/process')
        .attach('file', pdfBuffer, 'unique-doc.pdf')
        .field('document_type', 'TRANSCRIPT')
        .expect(202);

      // Second upload with same content should fail
      const secondResponse = await request(app)
        .post('/api/v1/workflow/documents/process')
        .attach('file', pdfBuffer, 'duplicate-doc.pdf')
        .field('document_type', 'TRANSCRIPT')
        .expect(409);

      expect(secondResponse.body.code).toBe('DUPLICATE_DOCUMENT');
      expect(secondResponse.body).toHaveProperty('meta.existingDocumentId');
    });

    it('should track processing status', async () => {
      const pdfBuffer = createTestPdf('status-test-2');
      
      // Upload and get document info
      const uploadResponse = await request(app)
        .post('/api/v1/workflow/documents/process')
        .attach('file', pdfBuffer, 'status-test.pdf')
        .field('document_type', 'CV')
        .expect(202);

      const documentId = uploadResponse.body.document.id;

      // Check status using document ID
      const statusResponse = await request(app)
        .get(`/api/v1/workflow/documents/status/${documentId}`)
        .expect(200);

      expect(statusResponse.body).toHaveProperty('document');
      expect(statusResponse.body.document.id).toBe(documentId);
      expect(statusResponse.body.document.status).toBe('INDEXED');
      expect(statusResponse.body.citations).toBeInstanceOf(Array);
    });

    it('should return 404 for non-existent processing request', async () => {
      const response = await request(app)
        .get('/api/v1/workflow/documents/status/non-existent-id')
        .expect(404);

      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('Evidence Extraction', () => {    it('should return extracted citations with document details', async () => {
      const pdfBuffer = createTestPdf('evidence-citation');
      
      // Upload document
      const uploadResponse = await request(app)
        .post('/api/v1/workflow/documents/process')
        .attach('file', pdfBuffer, 'evidence-test.pdf')
        .field('document_type', 'TRANSCRIPT')
        .expect(202);

      const document = uploadResponse.body.document;

      // First evaluate eligibility to populate citations in criteriaRubrics
      await request(app)
        .post('/api/v1/workflow/eligibility/evaluate')
        .send({ opportunityId: 'opp-biox-2026' })
        .expect(200);

      // Get status which includes citations (populated after eligibility evaluation)
      const statusResponse = await request(app)
        .get(`/api/v1/workflow/documents/status/${document.id}`)
        .expect(200);

      // Citations should be populated after eligibility evaluation
      expect(statusResponse.body.citations.length).toBeGreaterThan(0);
      
      const citation = statusResponse.body.citations[0];
      expect(citation).toHaveProperty('id');
      expect(citation).toHaveProperty('documentId', document.id);
      expect(citation).toHaveProperty('documentName');
      expect(citation).toHaveProperty('pageNumber');
      expect(citation).toHaveProperty('verbatimQuote');
      expect(citation).toHaveProperty('confidence');
      expect(citation).toHaveProperty('sha256Hash');
      expect(citation).toHaveProperty('reasonCode');
      expect(citation).toHaveProperty('extractedDate');
    });

    it('should maintain source document reference in evidence', async () => {
      const pdfBuffer = createTestPdf('source-ref');

      const uploadResponse = await request(app)
        .post('/api/v1/workflow/documents/process')
        .attach('file', pdfBuffer, 'source-ref-test.pdf')
        .field('document_type', 'PREPRINT')
        .expect(202);

      const document = uploadResponse.body.document;

      // Verify document has proper provenance
      expect(document).toHaveProperty('sha256');
      expect(document.sha256).toHaveLength(64); // SHA-256 hex is 64 chars
      expect(document).toHaveProperty('enclaveEncrypted', true);
      expect(document).toHaveProperty('pageCount');
      expect(document).toHaveProperty('ocrConfidence');
      expect(document.ocrConfidence).toBeGreaterThan(0.9);
    });
  });

  describe('Eligibility Evaluation', () => {
    const testOpportunityId = 'opp-biox-2026';

    it('should evaluate eligibility for a valid opportunity', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/eligibility/evaluate')
        .send({
          opportunityId: testOpportunityId,
          caseId: `test-case-${Date.now()}`,
        })
        .expect(200);

      expect(response.body).toHaveProperty('report');
      expect(response.body).toHaveProperty('criteria');
      expect(response.body).toHaveProperty('meetsCriteria');
      expect(response.body).toHaveProperty('failedCriteria');
      expect(response.body).toHaveProperty('insufficientCriteria');
      expect(response.body).toHaveProperty('hardGates');
      expect(response.body).toHaveProperty('processingTimeMs');
    });

    it('should return report with deterministic score', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/eligibility/evaluate')
        .send({
          opportunityId: testOpportunityId,
        })
        .expect(200);

      const report = response.body.report;
      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('caseId');
      expect(report).toHaveProperty('candidateName');
      expect(report).toHaveProperty('institution');
      expect(report).toHaveProperty('opportunityTitle');
      expect(report).toHaveProperty('sponsor');
      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('deterministicScore');
      expect(report.deterministicScore).toBeGreaterThanOrEqual(0);
      expect(report.deterministicScore).toBeLessThanOrEqual(100);
      expect(report).toHaveProperty('hardGatesPassed');
      expect(report).toHaveProperty('totalHardGates');
      expect(report).toHaveProperty('hardGates');
      expect(report.hardGates).toBeInstanceOf(Array);
      expect(report).toHaveProperty('overallStatus');
      expect(['VERIFIED_ELIGIBLE', 'ACTION_REQUIRED', 'DISQUALIFIED']).toContain(report.overallStatus);
      expect(report).toHaveProperty('cryptographicReceipt');
      expect(report.cryptographicReceipt).toHaveProperty('hash');
      expect(report.cryptographicReceipt).toHaveProperty('signingAuthority');
      expect(report.cryptographicReceipt).toHaveProperty('algorithm');
      expect(report.cryptographicReceipt).toHaveProperty('issuedTimestamp');
      expect(report.cryptographicReceipt).toHaveProperty('verifiableUrl');
      expect(report).toHaveProperty('evidenceProvenance');
      expect(report.evidenceProvenance).toBeInstanceOf(Array);
    });

    it('should separate criteria by status (MEETS, FAILED, INSUFFICIENT)', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/eligibility/evaluate')
        .send({
          opportunityId: testOpportunityId,
        })
        .expect(200);

      const { meetsCriteria, failedCriteria, insufficientCriteria } = response.body;

      // Each criterion should appear in exactly one category
      const allCriteriaIds = [
        ...meetsCriteria.map((c: { id: string }) => c.id),
        ...failedCriteria.map((c: { id: string }) => c.id),
        ...insufficientCriteria.map((c: { id: string }) => c.id),
      ];

      // No duplicates across categories
      const uniqueIds = new Set(allCriteriaIds);
      expect(uniqueIds.size).toBe(allCriteriaIds.length);

      // Each criterion should have proper status
      meetsCriteria.forEach((c: { status: string }) => expect(c.status).toBe('MEETS'));
      failedCriteria.forEach((c: { status: string }) => expect(['FAILED', 'FAIL'].includes(c.status)).toBe(true));
      insufficientCriteria.forEach((c: { status: string }) => expect(['INSUFFICIENT', 'REVIEW'].includes(c.status)).toBe(true));
    });

    it('should return hard gates with evidence snippets', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/eligibility/evaluate')
        .send({
          opportunityId: testOpportunityId,
        })
        .expect(200);

      const hardGates = response.body.hardGates;
      expect(hardGates.length).toBeGreaterThan(0);

      hardGates.forEach((gate: { id: string; name: string; requiredRule: string; candidateValue: string; status: string; evidenceSnippet: string }) => {
        expect(gate).toHaveProperty('id');
        expect(gate).toHaveProperty('name');
        expect(gate).toHaveProperty('requiredRule');
        expect(gate).toHaveProperty('candidateValue');
        expect(gate).toHaveProperty('status');
        expect(['PASS', 'FAIL', 'REVIEW'].includes(gate.status)).toBe(true);
        expect(gate).toHaveProperty('evidenceSnippet');
      });
    });

    it('should reject evaluation for non-existent opportunity', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/eligibility/evaluate')
        .send({
          opportunityId: 'non-existent-opp',
        })
        .expect(404);

      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should require opportunityId for evaluation', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/eligibility/evaluate')
        .send({})
        .expect(400);

      expect(response.body.code).toBe('MISSING_OPPORTUNITY_ID');
    });
  });

  describe('Checklist Generation', () => {
    const testOpportunityId = 'opp-biox-2026';

    it('should generate checklist tasks from eligibility results', async () => {
      // First evaluate eligibility
      const evalResponse = await request(app)
        .post('/api/v1/workflow/eligibility/evaluate')
        .send({
          opportunityId: testOpportunityId,
          caseId: `checklist-test-${Date.now()}`,
        })
        .expect(200);

      const eligibilityReportId = evalResponse.body.report.id;

      // Generate checklist
      const response = await request(app)
        .post('/api/v1/workflow/checklist/generate')
        .send({
          opportunityId: testOpportunityId,
          eligibilityResultId: eligibilityReportId,
        })
        .expect(200);

      expect(response.body).toHaveProperty('tasks');
      expect(response.body.tasks).toBeInstanceOf(Array);
      expect(response.body).toHaveProperty('generatedAt');
      expect(response.body).toHaveProperty('linkedOpportunityId', testOpportunityId);
      expect(response.body).toHaveProperty('linkedEligibilityReportId', eligibilityReportId);
    });

    it('should generate tasks with proper structure', async () => {
      const evalResponse = await request(app)
        .post('/api/v1/workflow/eligibility/evaluate')
        .send({
          opportunityId: testOpportunityId,
        })
        .expect(200);

      const response = await request(app)
        .post('/api/v1/workflow/checklist/generate')
        .send({
          opportunityId: testOpportunityId,
          eligibilityResultId: evalResponse.body.report.id,
        })
        .expect(200);

      if (response.body.tasks.length > 0) {
        const task = response.body.tasks[0];
        expect(task).toHaveProperty('id');
        expect(task).toHaveProperty('title');
        expect(task).toHaveProperty('opportunityTitle');
        expect(task).toHaveProperty('deadline');
        expect(task).toHaveProperty('status');
        expect(['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(task.status)).toBe(true);
        expect(task).toHaveProperty('priority');
        expect(['HIGH', 'MEDIUM', 'LOW'].includes(task.priority)).toBe(true);
        expect(task).toHaveProperty('category');
        expect(['DOCUMENT', 'ESSAY', 'LOR', 'SUBMISSION'].includes(task.category)).toBe(true);
      }
    });

    it('should reject checklist generation without opportunityId', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/checklist/generate')
        .send({
          eligibilityResultId: 'some-report-id',
        })
        .expect(400);

      expect(response.body.code).toBe('MISSING_OPPORTUNITY_ID');
    });

    it('should reject checklist generation for non-existent opportunity', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/checklist/generate')
        .send({
          opportunityId: 'non-existent-opp',
          eligibilityResultId: 'some-report-id',
        })
        .expect(404);

      expect(response.body.code).toBe('NOT_FOUND');
    });
  });

  describe('Workflow State', () => {
    it('should return workflow state with profile and documents', async () => {
      const response = await request(app)
        .get('/api/v1/workflow/state/test-workflow')
        .expect(200);

      expect(response.body).toHaveProperty('profile');
      expect(response.body).toHaveProperty('documents');
      expect(response.body.documents).toBeInstanceOf(Array);
      expect(response.body).toHaveProperty('eligibilityReport');
      expect(response.body).toHaveProperty('checklist');
      expect(response.body.checklist).toBeInstanceOf(Array);
      expect(response.body).toHaveProperty('workflowId', 'test-workflow');
      expect(response.body).toHaveProperty('status');
      expect(['pending_profile', 'in_progress', 'completed']).toContain(response.body.status);
    });

    it('should include correlation IDs in responses', async () => {
      const response = await request(app)
        .post('/api/v1/workflow/profile/validate')
        .send({ fullName: 'Test' })
        .set('X-Correlation-ID', 'test-correlation-123')
        .expect(200);

      // The correlation middleware adds x-correlation-id header to responses
      expect(response.headers).toHaveProperty('x-correlation-id');
    });
  });

  describe('End-to-End Workflow', () => {
    it('should complete full workflow: profile -> document -> eligibility -> checklist', async () => {
      // Step 1: Submit profile
      const profileResponse = await request(app)
        .post('/api/v1/workflow/profile/submit')
        .send({
          fullName: 'E2E Test Candidate',
          email: 'e2e@test.edu',
          institution: 'Test University',
          degree: 'Ph.D. Computer Science',
          educationTier: 'phd',
          graduationDate: '2027-05',
          gpa: 3.95,
          workAuthorization: 'us-citizen',
          domainTags: [{ name: 'Machine Learning', verified: true }],
        })
        .expect(201);

      expect(profileResponse.body.fullName).toBe('E2E Test Candidate');

      // Step 2: Upload document
      const pdfBuffer = createTestPdf('e2e-test');

      const docResponse = await request(app)
        .post('/api/v1/workflow/documents/process')
        .attach('file', pdfBuffer, 'e2e-test.pdf')
        .field('document_type', 'TRANSCRIPT')
        .expect(202);

      expect(docResponse.body.document.status).toBe('INDEXED');

      // Step 3: Evaluate eligibility
      const evalResponse = await request(app)
        .post('/api/v1/workflow/eligibility/evaluate')
        .send({
          opportunityId: 'opp-biox-2026',
          caseId: `e2e-${Date.now()}`,
        })
        .expect(200);

      expect(evalResponse.body.report).toBeDefined();
      expect(evalResponse.body.criteria.length).toBeGreaterThan(0);

      // Step 4: Generate checklist
      const checklistResponse = await request(app)
        .post('/api/v1/workflow/checklist/generate')
        .send({
          opportunityId: 'opp-biox-2026',
          eligibilityResultId: evalResponse.body.report.id,
        })
        .expect(200);

      expect(checklistResponse.body.tasks).toBeInstanceOf(Array);
      expect(checklistResponse.body.linkedOpportunityId).toBe('opp-biox-2026');
      expect(checklistResponse.body.linkedEligibilityReportId).toBe(evalResponse.body.report.id);
    });
  });
});
