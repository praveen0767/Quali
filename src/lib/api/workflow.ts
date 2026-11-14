/**
 * Quali Application Workflow API Service
 * End-to-end integration for profile submission, document processing,
 * eligibility evaluation, and checklist generation.
 */

import { apiClient, isMockModeEnabled } from './client';
import {
  ProfileSubmission,
  ProfileValidationResult,
  DocumentProcessingResult,
  EligibilityEvaluationRequest,
  EligibilityEvaluationResult,
  ChecklistRequest,
  ChecklistResult,
  EvidenceCitation,
  IngestedDocument,
  CandidateProfile,
  ApplicationTask,
} from './types';
import { INITIAL_CANDIDATE_PROFILE } from './mockAdapter';

// In-memory mock state for development
let mockProfile: CandidateProfile = { ...INITIAL_CANDIDATE_PROFILE };
const mockProcessingStates: Map<string, { state: string; citations: EvidenceCitation[]; doc: IngestedDocument | null }> = new Map();

/**
 * Validate profile submission on the server
 */
export async function validateProfileSubmission(
  submission: ProfileSubmission
): Promise<ProfileValidationResult> {
  if (isMockModeEnabled()) {
    const errors: Array<{ field: string; message: string; code: string }> = [];

    if (!submission.fullName || submission.fullName.trim().length < 2) {
      errors.push({ field: 'fullName', message: 'Full name must be at least 2 characters.', code: 'INVALID_NAME' });
    }
    if (!submission.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submission.email)) {
      errors.push({ field: 'email', message: 'Valid email address required.', code: 'INVALID_EMAIL' });
    }
    if (!submission.institution || submission.institution.trim().length < 2) {
      errors.push({ field: 'institution', message: 'Institution name required.', code: 'INVALID_INSTITUTION' });
    }
    if (!submission.degree || submission.degree.trim().length < 2) {
      errors.push({ field: 'degree', message: 'Degree program required.', code: 'INVALID_DEGREE' });
    }
    if (!['undergraduate', 'masters', 'phd', 'postdoc'].includes(submission.educationTier)) {
      errors.push({ field: 'educationTier', message: 'Valid education tier required.', code: 'INVALID_TIER' });
    }
    if (!submission.graduationDate || !/^\d{4}-\d{2}$/.test(submission.graduationDate)) {
      errors.push({ field: 'graduationDate', message: 'Graduation date must be YYYY-MM format.', code: 'INVALID_DATE' });
    }
    if (typeof submission.gpa !== 'number' || submission.gpa < 0 || submission.gpa > 4.0) {
      errors.push({ field: 'gpa', message: 'GPA must be between 0.00 and 4.00.', code: 'INVALID_GPA' });
    }
    if (!['us-citizen', 'f1-opt', 'eu-global'].includes(submission.workAuthorization)) {
      errors.push({ field: 'workAuthorization', message: 'Valid work authorization required.', code: 'INVALID_AUTH' });
    }

    return { valid: errors.length === 0, errors };
  }

  return apiClient<ProfileValidationResult>('/api/v1/workflow/profile/validate', {
    method: 'POST',
    body: JSON.stringify(submission),
  });
}

/**
 * Submit candidate profile for an application workflow
 */
export async function submitProfileForWorkflow(
  submission: ProfileSubmission
): Promise<CandidateProfile> {
  if (isMockModeEnabled()) {
    mockProfile = {
      ...mockProfile,
      ...submission,
      id: `cand-${Date.now()}`,
      authProvider: 'Quali Workflow Portal',
      includeGpaInAudit: true,
      avatarUrl: '',
      focusVector: submission.degree,
      vaultStatus: 'Zero-Leak Enclave',
      matchingReadiness: 'Ready to Audit',
      statementQuote: '',
    };
    return Promise.resolve({ ...mockProfile });
  }

  return apiClient<CandidateProfile>('/api/v1/workflow/profile/submit', {
    method: 'POST',
    body: JSON.stringify(submission),
  });
}

/**
 * Get the current workflow profile
 */
export async function getWorkflowProfile(): Promise<CandidateProfile> {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ...mockProfile });
  }

  return apiClient<CandidateProfile>('/api/v1/workflow/profile');
}

/**
 * Initiate document processing with tracking
 */
export async function initiateDocumentProcessing(
  file: File,
  documentType: IngestedDocument['documentType']
): Promise<{ requestId: string; initialState: { stage: string; message: string; progress: number } }> {
  if (isMockModeEnabled()) {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const initialState = { stage: 'validating' as const, message: 'Validating file format and size...', progress: 5 };

    // Simulate processing state storage
    mockProcessingStates.set(requestId, {
      state: 'pending',
      citations: [],
      doc: null,
    });

    return Promise.resolve({ requestId, initialState });
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_type', documentType);

  return apiClient<{ requestId: string; initialState: { stage: string; message: string; progress: number } }>(
    '/api/v1/workflow/documents/process',
    {
      method: 'POST',
      body: formData,
    }
  );
}

/**
 * Get processing status for a document request
 */
export async function getDocumentProcessingStatus(
  requestId: string
): Promise<{ requestId: string; state: string; document: IngestedDocument | null; citations: EvidenceCitation[]; error?: string }> {
  if (isMockModeEnabled()) {
    const stored = mockProcessingStates.get(requestId);
    if (!stored) {
      return Promise.resolve({
        requestId,
        state: 'not_found',
        document: null,
        citations: [],
        error: 'Processing request not found',
      });
    }

    // Simulate progressive processing
    const states = [
      { stage: 'validating', message: 'Validating file format and size...', progress: 10 },
      { stage: 'hashing', message: 'Computing SHA-256 cryptographic fingerprint...', progress: 25 },
      { stage: 'processing', message: 'Processing document content...', progress: 50 },
      { stage: 'extracting', message: 'Extracting claims and citations...', progress: 75 },
      { stage: 'indexing', message: 'Indexing to Zero-Leak Enclave...', progress: 90 },
    ];

    // For mock, return completed state after first call
    if (stored.doc) {
      return Promise.resolve({
        requestId,
        state: 'completed',
        document: stored.doc,
        citations: stored.citations,
      });
    }

    // Simulate completion on first status check
    const doc: IngestedDocument = {
      id: `doc-${Date.now()}`,
      name: 'processed-document.pdf',
      documentType: 'TRANSCRIPT',
      uploadedAt: new Date().toISOString(),
      sizeBytes: 102400,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      enclaveEncrypted: true,
      pageCount: 3,
      ocrConfidence: 0.995,
      extractedClaimsCount: 8,
      status: 'INDEXED',
      previewExcerpt: 'Document processed and indexed successfully.',
    };

    const citations: EvidenceCitation[] = [
      {
        id: `cit-${Date.now()}-1`,
        documentId: doc.id,
        documentName: doc.name,
        pageNumber: 1,
        lineNumber: 10,
        verbatimQuote: 'Sample extracted claim from document.',
        confidence: 0.98,
        sha256Hash: doc.sha256,
        reasonCode: 'EXTRACTED_CLAIM',
        extractedDate: new Date().toISOString().split('T')[0],
      },
    ];

    mockProcessingStates.set(requestId, { state: 'completed', citations, doc });

    return Promise.resolve({
      requestId,
      state: 'completed',
      document: doc,
      citations,
    });
  }

  return apiClient<{ requestId: string; state: string; document: IngestedDocument | null; citations: EvidenceCitation[]; error?: string }>(
    `/api/v1/workflow/documents/status/${encodeURIComponent(requestId)}`
  );
}

/**
 * Evaluate eligibility for an opportunity using the current profile
 */
export async function evaluateWorkflowEligibility(
  request: EligibilityEvaluationRequest
): Promise<EligibilityEvaluationResult> {
  if (isMockModeEnabled()) {
    // Return mock evaluation based on existing engine logic
    // This would typically call the actual engine
    return Promise.resolve({
      report: {
        id: `rep-${Date.now()}`,
        caseId: request.caseId || `AUDIT-WORKFLOW-${Date.now()}`,
        candidateName: mockProfile.fullName,
        institution: mockProfile.institution,
        opportunityTitle: 'Opportunity Title',
        sponsor: 'Sponsor',
        generatedAt: new Date().toISOString(),
        deterministicScore: 85,
        hardGatesPassed: 2,
        totalHardGates: 3,
        hardGates: [],
        domainScore: 82,
        overallStatus: 'ACTION_REQUIRED',
        cryptographicReceipt: {
          hash: 'sha256:mock',
          signingAuthority: 'Quali Workflow Engine',
          algorithm: 'Ed25519-SHA256-Deterministic',
          issuedTimestamp: new Date().toISOString(),
          verifiableUrl: '',
        },
        evidenceProvenance: [],
      },
      criteria: [],
      meetsCriteria: [],
      failedCriteria: [],
      insufficientCriteria: [],
      hardGates: [],
      processingTimeMs: 150,
    });
  }

  return apiClient<EligibilityEvaluationResult>('/api/v1/workflow/eligibility/evaluate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Generate checklist from eligibility results
 */
export async function generateWorkflowChecklist(
  request: ChecklistRequest
): Promise<ChecklistResult> {
  if (isMockModeEnabled()) {
    return Promise.resolve({
      tasks: [
        {
          id: `task-${Date.now()}-1`,
          title: 'Resolve Evidence Gap for Criterion',
          opportunityTitle: 'Opportunity',
          deadline: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          status: 'PENDING',
          priority: 'HIGH',
          category: 'DOCUMENT',
        },
      ],
      generatedAt: new Date().toISOString(),
      linkedOpportunityId: request.opportunityId,
      linkedEligibilityReportId: request.eligibilityResultId,
    });
  }

  return apiClient<ChecklistResult>('/api/v1/workflow/checklist/generate', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Get the full workflow state for an application
 */
export async function getWorkflowState(workflowId: string): Promise<{
  profile: CandidateProfile | null;
  documents: IngestedDocument[];
  eligibilityReport: unknown;
  checklist: ApplicationTask[];
  workflowId: string;
  status: string;
}> {
  if (isMockModeEnabled()) {
    return Promise.resolve({
      profile: mockProfile,
      documents: [],
      eligibilityReport: null,
      checklist: [],
      workflowId,
      status: 'in_progress',
    });
  }

  return apiClient('/api/v1/workflow/state/' + encodeURIComponent(workflowId));
}
