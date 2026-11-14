/**
 * Quali Enterprise Type Contracts
 * Unifies Quali Academic Opportunity Intelligence and TruDoc Enterprise Verification Contracts
 */

// ==========================================
// Quali Opportunity & Candidate Contracts
// ==========================================

export type VerificationStatus =
  | 'MEETS'
  | 'INSUFFICIENT'
  | 'FAILED'
  | 'VERIFIED'
  | 'PASS'
  | 'FAIL'
  | 'REVIEW'
  | 'FLAGGED'
  | 'MISMATCH'
  | 'MATCH';

export type EducationTier = 'undergraduate' | 'masters' | 'phd' | 'postdoc';
export type AuthStatus = 'us-citizen' | 'f1-opt' | 'eu-global';
export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface CandidateProfile {
  id: string;
  fullName: string;
  email: string;
  authProvider: string;
  institution: string;
  degree: string;
  educationTier: EducationTier;
  graduationDate: string; // YYYY-MM
  gpa: number;
  includeGpaInAudit: boolean;
  workAuthorization: AuthStatus;
  domainTags: Array<{ name: string; verified: boolean }>;
  avatarUrl: string;
  focusVector: string;
  vaultStatus: 'Zero-Leak Enclave' | 'Standard Storage';
  matchingReadiness: 'Ready to Audit' | 'Pending Documents';
  statementQuote: string;
}

export interface Opportunity {
  id: string;
  title: string;
  sponsor: string;
  category: 'Fellowship' | 'Grant' | 'Scholarship' | 'Residency';
  fundingAmount: string;
  deadline: string; // YYYY-MM-DD
  degreeTiers: EducationTier[];
  minGpa?: number;
  citizenshipRequirement: string;
  citizenshipTiers: AuthStatus[];
  domainFocus: string[];
  rfpSummary: string;
  rfpQuote: string;
  matchScore: number; // 0 - 100
  hardGatePassed: boolean;
  matchTier: 'HIGH_MATCH' | 'SUPPLEMENTAL_NEEDED' | 'DISQUALIFIED';
  location: string;
}

export interface IngestedDocument {
  id: string;
  name: string;
  documentType: 'TRANSCRIPT' | 'PREPRINT' | 'LOR' | 'CV' | 'I20_VISA';
  uploadedAt: string;
  sizeBytes: number;
  sha256: string;
  enclaveEncrypted: boolean;
  pageCount: number;
  ocrConfidence: number;
  extractedClaimsCount: number;
  status: 'INDEXED' | 'PROCESSING' | 'FLAGGED';
  previewExcerpt: string;
}

export interface EvidenceCitation {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  lineNumber?: number;
  verbatimQuote: string;
  confidence: number; // 0.0 - 1.0
  sha256Hash: string;
  reasonCode: string;
  extractedDate: string;
}

export interface CriteriaRubric {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  criterionTitle: string;
  clauseExcerpt: string;
  clauseCategory: 'EDUCATION_TIER' | 'GPA_THRESHOLD' | 'VISA_CITIZENSHIP' | 'CONFERRAL_WINDOW' | 'DOMAIN_EXPERTISE';
  isHardGate: boolean;
  // Rubrics are populated by both the verification vocabulary (MEETS/FAILED/INSUFFICIENT)
  // and the decision vocabulary (MEETS/DOES_NOT_MEET/INSUFFICIENT_EVIDENCE).
  status: VerificationStatus | DecisionOutcome;
  evidenceCitation?: EvidenceCitation;
  evaluatorNote: string;
}

export interface HardGateResult {
  id: string;
  name: string;
  requiredRule: string;
  candidateValue: string;
  status: 'PASS' | 'FAIL' | 'REVIEW';
  evidenceSnippet: string;
}

export interface EligibilityReport {
  id: string;
  caseId: string;
  candidateName: string;
  institution: string;
  opportunityTitle: string;
  sponsor: string;
  generatedAt: string;
  deterministicScore: number;
  hardGatesPassed: number;
  totalHardGates: number;
  hardGates: HardGateResult[];
  domainScore: number;
  overallStatus: 'VERIFIED_ELIGIBLE' | 'ACTION_REQUIRED' | 'DISQUALIFIED';
  cryptographicReceipt: {
    hash: string;
    signingAuthority: string;
    algorithm: string;
    issuedTimestamp: string;
    verifiableUrl: string;
  };
  evidenceProvenance: Array<{
    documentTitle: string;
    sha256: string;
    citationsUsed: number;
    enclaveStatus: string;
  }>;
}

export interface OpportunityRecommendation {
  id: string;
  opportunity: Opportunity;
  tier: 'HIGH_MATCH' | 'SUPPLEMENTAL_NEEDED' | 'DISQUALIFIED';
  matchPercent: number;
  qualifyingClauses: string[];
  disqualifyingClauses: string[];
  gapBridgeActions: string[];
}

export interface ApplicationTask {
  id: string;
  title: string;
  opportunityTitle: string;
  deadline: string; // YYYY-MM-DD
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
  priority: PriorityLevel;
  category: 'DOCUMENT' | 'ESSAY' | 'LOR' | 'SUBMISSION' | 'PROFILE_COMPLETION' | 'DEADLINE_MANAGEMENT';
  actionUrl?: string;
}

export interface VoiceAssistantMessage {
  id: string;
  sender: 'USER' | 'QUALI_ASSISTANT';
  text: string;
  timestamp: string;
  citations?: Array<{
    documentName: string;
    page: number;
    quote: string;
  }>;
}

export interface SystemTelemetry {
  deterministicGateEngine: 'OPERATIONAL' | 'DEGRADED';
  zeroLeakEnclave: 'ACTIVE' | 'OFFLINE';
  evidenceHasher: 'SHA-256 VERIFIED' | 'FAILED';
  activeOpportunitiesCount: number;
  verifiedClaimsCount: number;
  backendApiStatus: 'CONNECTED' | 'DEVELOPMENT_MOCK';
  latencyMs: number;
  dataSource: 'LIVE_BACKEND' | 'DEVELOPMENT_MOCK_ADAPTER';
}

export interface PrivacyControls {
  zeroLeakEnclave: boolean;
  trainingOptOut: boolean;
  strictGroundingEnforced: boolean;
  autoShredDays: number;
  lastAuditExport?: string;
}

// ==========================================
// Legacy / Enterprise TruDoc Subsystem Types
// ==========================================

export type DocumentStatus = 'PROCESSING' | 'EXTRACTED' | 'VERIFIED' | 'REVIEW_REQUIRED' | 'MISMATCH' | 'REJECTED';
export type ServiceHealthStatus = 'CONNECTED' | 'DEGRADED' | 'UNAVAILABLE';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  page?: number;
}

export interface EvidenceSource {
  id: string;
  documentId: string;
  pageNumber: number;
  boundingBox: BoundingBox;
  rawOcrText: string;
  confidence: number;
  snippetText: string;
  normalizedValue: string | number;
  reasonCodes: string[];
  fieldKey: string;
  sha256Hash?: string;
  ocrEngine?: string;
}

export interface DocumentField {
  id: string;
  key: string;
  label: string;
  value: string;
  rawValue: string;
  confidence: number;
  status: VerificationStatus;
  evidenceId?: string;
  category?: 'header' | 'entity' | 'line_item' | 'total' | 'tax';
  pageNumber?: number;
  boundingBox?: BoundingBox;
}

export interface TableRow {
  rowNumber: number;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  confidence: number;
  status: 'MATCH' | 'MISMATCH' | 'FLAGGED' | 'VERIFIED';
  deltaNote?: string;
  boundingBox?: BoundingBox;
}

export interface TableResult {
  headers: string[];
  rows: TableRow[];
  subtotal: number;
  taxAmount: number;
  taxRatePercent: number;
  total: number;
}

export interface DocumentQuality {
  resolutionDpi: number;
  skewAngle: number;
  contrastScore: number;
  noiseLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  readabilityScore: number;
  isDegraded: boolean;
}

export interface DocumentProvenance {
  uploadedAt: string;
  uploadedBy: string;
  originalFileName: string;
  mimeType: string;
  sha256: string;
  fileSizeBytes: number;
  processingDurationMs: number;
  ocrEngine: string;
  ocrConfidenceAvg: number;
}

export interface ValidationRuleResult {
  ruleId: string;
  ruleName: string;
  description: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  expected?: string | number;
  actual?: string | number;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  rulesChecked: number;
  rulesPassed: number;
  rulesFailed: number;
  rules: ValidationRuleResult[];
}

export interface TamperSignal {
  detected: boolean;
  score: number;
  anomalies: string[];
  exifAltered: boolean;
  fontDiscrepancies: boolean;
}

export interface DuplicateSignal {
  isDuplicate: boolean;
  similarityScore: number;
  matchedDocumentId?: string;
  matchedCaseId?: string;
}

export interface Document {
  id: string;
  caseId: string;
  name: string;
  documentType: 'PURCHASE_ORDER' | 'TAX_INVOICE' | 'CREDIT_NOTE' | 'BILL_OF_LADING' | 'CUSTOMS_DECLARATION';
  status: DocumentStatus;
  quality: DocumentQuality;
  provenance: DocumentProvenance;
  fieldCoveragePercent: number;
  overallReliability: number;
  fields: DocumentField[];
  tableData?: TableResult;
  validation: ValidationResult;
  tamperSignal: TamperSignal;
  duplicateSignal: DuplicateSignal;
  reviewState: 'NONE' | 'PENDING' | 'CLEARED' | 'EXCEPTION_APPROVED';
  imageUrl?: string;
}

export interface ReconciliationNode {
  id: string;
  nodeKey: string;
  label: string;
  sourceValue: string;
  targetValue: string;
  status: 'MATCH' | 'MISMATCH' | 'OVERRUN' | 'SURCHARGE' | 'DELTA' | 'MISSING' | 'AMBIGUOUS';
  deltaLabel?: string;
  deltaAmount?: number;
  confidence: number;
  sourceDocId?: string;
  targetDocId?: string;
}

export interface ReconciliationResult {
  id: string;
  caseId: string;
  sourceDocId: string;
  sourceDocName: string;
  sourceDocType: string;
  targetDocId: string;
  targetDocName: string;
  targetDocType: string;
  status: 'MATCH' | 'MISMATCH' | 'PENDING_REVIEW';
  matchEngine: string;
  cycleId: string;
  fieldAgreementCount: number;
  totalFieldsChecked: number;
  financialVarianceAmount: number;
  financialVariancePercent: number;
  discrepancyVectorTitle: string;
  discrepancyVectorDetail: string;
  trustScore: number;
  trustStatus: 'VERIFIED' | 'DEGRADED' | 'HALTED';
  nodes: ReconciliationNode[];
  policyViolation?: {
    policyId: string;
    policyName: string;
    mandate: string;
    varianceTolerance: string;
    actualObserved: string;
    autoAction: string;
    complianceStatus: 'VIOLATION' | 'COMPLIANT';
  };
  llmDiagnostic?: {
    latencyMs: number;
    observations: Array<{
      status: 'OK' | 'FAILED' | 'WARN';
      message: string;
    }>;
    explanation: string;
  };
}

export interface ReviewCase {
  id: string;
  documentId: string;
  documentName: string;
  caseId: string;
  fieldKey: string;
  fieldLabel: string;
  currentValue: string;
  suggestedValue?: string;
  reliability: number;
  reason: string;
  evidenceSnippet?: string;
  evidenceBoundingBox?: BoundingBox;
  status: 'PENDING' | 'ACCEPTED' | 'CORRECTED' | 'REJECTED';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: string;
  assignedTo?: string;
  resolutionNote?: string;
}

export interface CorrectionSubmission {
  reviewId: string;
  fieldKey: string;
  correctedValue: string;
  reason: string;
  reviewerId: string;
}

export interface AgentTraceStage {
  stage: 'ingest' | 'quality_assessment' | 'preprocess' | 'ocr' | 'layout' | 'extract' | 'retrieve' | 'reason' | 'validate' | 'tamper_check' | 'duplicate_check' | 'reconcile' | 'review' | 'finalize';
  label: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'FAILED' | 'SKIPPED' | 'VIOLATION_HALTED';
  timestamp: string;
  durationMs: number;
  component: string;
  inputSummary?: string;
  outputSummary?: string;
  details?: Record<string, unknown>;
}

export interface ToolExecution {
  stepNumber: number;
  toolName: string;
  requestPayload: string;
  registryValidation: 'PASSED' | 'FAILED';
  ownership: string;
  riskClassification: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  policyApplied: string;
  executionStatus: 'SUCCESS' | 'ERROR' | 'HALTED';
  resultPayload: string;
  durationMs: number;
}

export interface AgentTrace {
  id: string;
  runId: string;
  caseId: string;
  documentId?: string;
  startedAt: string;
  completedAt?: string;
  totalDurationMs: number;
  overallStatus: 'COMPLETED' | 'FAILED' | 'HALTED';
  runtimeVersion: string;
  engineLatencyMs: number;
  stages: AgentTraceStage[];
  mcpToolExecutions: ToolExecution[];
}

export interface SystemServiceStatus {
  serviceName: string;
  category: 'core' | 'inference' | 'storage' | 'control_plane';
  status: ServiceHealthStatus;
  latencyMs: number;
  version?: string;
  details: string;
  lastChecked: string;
}

export interface SystemHealth {
  overallStatus: ServiceHealthStatus;
  pythonAgentRuntime: string;
  engineLatencyMs: number;
  activeMcpToolsCount: number;
  decisionProvider: string;
  services: {
    pythonApi: SystemServiceStatus;
    ocrEngine: SystemServiceStatus;
    redisCache: SystemServiceStatus;
    qdrantVectorDb: SystemServiceStatus;
    mcpRegistry: SystemServiceStatus;
    decisionProvider: SystemServiceStatus;
    taskWorker: SystemServiceStatus;
    database: SystemServiceStatus;
  };
}

export interface PolicyRule {
  id: string;
  code: string;
  name: string;
  category: 'FINANCIAL' | 'SECURITY' | 'COMPLIANCE' | 'TAX';
  mandate: string;
  tolerance: string;
  enforcementAction: 'HALT_PAYMENT_PIPELINE' | 'FLAG_FOR_REVIEW' | 'AUTO_REJECT' | 'ALERT_SECURITY';
  status: 'ACTIVE' | 'AUDIT_MODE' | 'DISABLED';
  violationsLoggedCount: number;
  lastTriggeredAt?: string;
}

export interface CaseRecord {
  id: string;
  caseNumber: string;
  vendorName: string;
  buyerName: string;
  totalCommittedAmount: number;
  totalBilledAmount: number;
  varianceAmount: number;
  status: 'CLEARED' | 'MISMATCH_DETECTED' | 'REVIEW_PENDING' | 'REJECTED';
  documentCount: number;
  documents: { id: string; name: string; type: string; status: DocumentStatus }[];
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// Quali Application Workflow Types
// ==========================================

export interface ProfileSubmission {
  fullName: string;
  email: string;
  institution: string;
  degree: string;
  educationTier: EducationTier;
  graduationDate: string;
  gpa: number;
  workAuthorization: AuthStatus;
  domainTags: Array<{ name: string; verified: boolean }>;
}

export interface ProfileValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string; code: string }>;
}

export interface DocumentUploadRequest {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  documentType: IngestedDocument['documentType'];
}

export interface ProcessingState {
  stage: 'validating' | 'hashing' | 'processing' | 'extracting' | 'indexing';
  message: string;
  progress: number;
}

export interface DocumentProcessingResult {
  document: IngestedDocument;
  processingState: ProcessingState;
  extractedCitations: EvidenceCitation[];
  processingTimeMs: number;
}

export interface EligibilityEvaluationRequest {
  opportunityId: string;
  caseId?: string;
}

export interface EligibilityEvaluationResult {
  report: EligibilityReport;
  criteria: CriteriaRubric[];
  meetsCriteria: CriteriaRubric[];
  failedCriteria: CriteriaRubric[];
  insufficientCriteria: CriteriaRubric[];
  hardGates: HardGateResult[];
  processingTimeMs: number;
}

export interface ChecklistRequest {
  opportunityId: string;
  eligibilityResultId: string;
}

export interface ChecklistResult {
  tasks: ApplicationTask[];
  generatedAt: string;
  linkedOpportunityId: string;
  linkedEligibilityReportId: string;
}

// ==========================================
// Production Hardening Types
// ==========================================

// Pattern for prompt injection detection
export const PROMPT_INJECTION_PATTERNS = [
  // Common prompt injection patterns
  /ignore\s+(previous|prior|all|the)\s+(instructions|commands|directives)/i,
  /forget\s+(everything|all|previous)/i,
  /you\s+are\s+now\s+(a|an|the)\s+/i,
  /system\s+prompt/i,
  /act\s+as\s+(a|an|the)/i,
  /from\s+now\s+on/i,
  /disregard\s+(all|previous|the)/i,
  /override\s+(instructions|settings|rules)/i,
  /new\s+(instructions|commands|directives)\s*:/i,
  /\{[^}]*<[^>]+>[^}]*\}/, // Template injection attempts
  /<script[^>]*>.*?<\/script>/si, // XSS via script tags
  /javascript\s*:/i, // JS protocol injection
  /data\s*:[^,]*\{[^}]+\}/i, // Data URI with embedded code
];

// Extraction provenance with schema validation and verbatim verification
export interface ExtractionConfidence {
  score: number; // 0.0 - 1.0
  method: 'OCR' | 'TEXT_PARSE' | 'STRUCTURED_EXTRACT' | 'HEURISTIC';
  qualityFlags: Array<'LOW_RESOLUTION' | 'SKEW_DETECTED' | 'NOISY_SCAN' | 'LOW_CONTRAST' | 'DEGRADED'>;
}

export interface SchemaValidationStatus {
  isValid: boolean;
  ruleId: string;
  ruleName: string;
  expectedPattern?: string;
  actualValue?: string;
  validationErrors: string[];
}

export interface ExtractionProvenance {
  documentId: string;
  documentName: string;
  pageNumber: number;
  lineNumber?: number;
  verbatimQuote: string;
  normalizedExtractedText: string;
  verbatimMatchVerified: boolean;
  schemaValidation: SchemaValidationStatus | null;
  extractionConfidence: ExtractionConfidence;
  extractionMethod: 'OCR_PARSED' | 'STRUCTURED_FIELD' | 'KEY_VALUE_EXTRACT' | 'SEMANTIC_MATCH';
  sha256Hash: string;
  extractedAt: string;
  reasonCode: string;
}

export interface CriteriaEvaluation {
  rubricId: string;
  criterionTitle: string;
  clauseCategory: CriteriaRubric['clauseCategory'];
  isHardGate: boolean;
  requiredEvidence: string[];
  status: 'MEETS' | 'DOES_NOT_MEET' | 'INSUFFICIENT_EVIDENCE';
  statusReasoning: string;
  evidenceCitations: ExtractionProvenance[];
  evaluatorNote: string;
  confidenceInDetermination: number;
}

// Decision semantics - never collapse to percentage
export type DecisionOutcome = 'MEETS' | 'DOES_NOT_MEET' | 'INSUFFICIENT_EVIDENCE';

// AI safety: all content is untrusted
export interface UntrustedContentPolicy {
  treatAsUntrusted: true;
  neverAsInstructions: true;
  promptInjectionProtection: {
    enabled: true;
    action: 'REJECT' | 'ESCAPE' | 'SANITIZE';
  };
  unapprovedExternalActionsProhibited: true;
  autoSubmissionDisabled: true;
  noFabricatedSources: true;
}

export interface PromptInjectionDetection {
  detected: boolean;
  patternsMatched: string[];
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  sanitizedContent?: string;
  originalLength: number;
}

// Operational metrics (non-sensitive)
export interface OperationalMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitedRequests: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  documentsProcessed: number;
  documentsFailed: number;
  extractionsCompleted: number;
  extractionsFailed: number;
  eligibilityEvaluations: number;
  validationErrors: number;
  processingErrors: number;
  duplicateDetections: number;
  securityRejections: number;
  startTime: string;
  uptimeSeconds: number;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
    latencyMs?: number;
  }>;
  version: string;
}

export interface ExtractionError {
  code: string;
  message: string;
  documentId?: string;
  pageNumber?: number;
  confidenceAtFailure?: number;
  extractionMethod?: string;
}

export interface ValidationErrorDetail {
  field: string;
  code: string;
  message: string;
  rejectedValue?: string | number;
  expected?: string;
}

// Rate Limiting
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator: (req: import('express').Request) => string;
}

export interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface SecureCORSOptions {
  allowedOrigins: string[];
  allowedMethods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
  optionsSuccessStatus: number;
}

// Verification function type export
export type VerifyVerbatimMatchFn = (
  quote: string,
  sourceText: string,
  options?: { caseSensitive?: boolean; normalizeWhitespace?: boolean }
) => { verified: boolean; matched: boolean; normalizedQuote: string; normalizedSource: string };

// ==========================================
// Quali Application Workflow Types
// ==========================================

export interface ProfileSubmission {
  fullName: string;
  email: string;
  institution: string;
  degree: string;
  educationTier: EducationTier;
  graduationDate: string;
  gpa: number;
  workAuthorization: AuthStatus;
  domainTags: Array<{ name: string; verified: boolean }>;
}

export interface ProfileValidationResult {
  valid: boolean;
  errors: Array<{ field: string; message: string; code: string }>;
}

export interface DocumentUploadRequest {
  fileId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  documentType: IngestedDocument['documentType'];
}

export interface ProcessingState {
  stage: 'validating' | 'hashing' | 'processing' | 'extracting' | 'indexing';
  message: string;
  progress: number; // 0-100
}

export interface DocumentProcessingResult {
  document: IngestedDocument;
  processingState: ProcessingState;
  extractedCitations: EvidenceCitation[];
  processingTimeMs: number;
}

export interface EligibilityEvaluationRequest {
  opportunityId: string;
  caseId?: string;
}

export interface EligibilityEvaluationResult {
  report: EligibilityReport;
  criteria: CriteriaRubric[];
  meetsCriteria: CriteriaRubric[];
  failedCriteria: CriteriaRubric[];
  insufficientCriteria: CriteriaRubric[];
  hardGates: HardGateResult[];
  processingTimeMs: number;
}

export interface ChecklistRequest {
  opportunityId: string;
  eligibilityResultId: string;
}

export interface ChecklistResult {
  tasks: ApplicationTask[];
  generatedAt: string;
  linkedOpportunityId: string;
  linkedEligibilityReportId: string;
}

/** Parsed user intent from voice or text input */
export interface ParsedIntent {
  text: string;
  mentionedOpportunities?: string[];
  detectedCriteria?: string[];
  voice: boolean;
}

/** Generated checklist from action coordinator */
/** Pending action for approval or execution */
export interface PendingAction {
  id: string;
  type: "SUBMIT_APPLICATION" | "SCHEDULE_REMINDER" | "GENERATE_CHECKLIST" | "DRAFT_RESPONSE";
  description: string;
  requiresApproval: boolean;
  status: "PENDING_APPROVAL" | "COMPLETED" | "REJECTED";
  metadata?: Record<string, unknown>;
}
export interface GeneratedChecklist {
  tasks: ApplicationTask[];
  actionItems: PendingAction[];
  evidenceReferences: EvidenceCitation[];
  draftResponse?: string;
}

/** Evaluation result from the eligibility engine */
export interface EvaluationResult {
  report: EligibilityReport;
  criteria: CriteriaRubric[];
  overallVerdict: 'MEETS' | 'DOES_NOT_MEET' | 'INSUFFICIENT_EVIDENCE';
}

/** Applicant qualification profile for matching */
export interface ApplicantQualification {
  fullName: string;
  email: string;
  educationTier: EducationTier;
  gpa: number;
  workAuthorization: AuthStatus;
  domainExpertise: string[];
}
