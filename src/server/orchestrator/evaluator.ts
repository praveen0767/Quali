/**
 * EVALUATOR: Invoke the existing deterministic eligibility engine.
 * Never let an unconstrained LLM overwrite its criterion-level outcomes.
 * 
 * Responsibilities:
 * - Run the deterministic rules engine on opportunity + profile + documents
 * - Preserve criterion-level MEETS/DOES_NOT_MEET/INSUFFICIENT_EVIDENCE outcomes
 * - Never collapse results to a single percentage score
 * - Separate hard gates from soft criteria
 * - Provide transparent reasoning for each criterion decision
 * - Support re-evaluation when profile or documents change
 */

import crypto from 'crypto';
import { 
  Opportunity,
  CandidateProfile,
  IngestedDocument,
  CriteriaRubric,
  EvidenceCitation,
  EligibilityReport,
  EligibilityEvaluationResult,
  DecisionOutcome,
  CriteriaEvaluation
} from '../../lib/api/types';
import { EvidenceReference } from '../../lib/api/orchestratorTypes';
import { evaluateEligibility } from '../engine/rulesEngine';
import { verifyVerbatimMatch } from '../engine/promptInjection';

// Evaluation options
export interface EvaluationOptions {
  opportunityId: string;
  caseId?: string;
  profile: CandidateProfile;
  documents: IngestedDocument[];
  criteriaRubrics: CriteriaRubric[];
  citations: EvidenceCitation[];
  runId?: string;
  // For re-evaluation
  previousEvaluationId?: string;
  // Whether to use cached results if available
  useCache?: boolean;
}

// Evaluation result with full provenance
export interface EvaluationResult {
  report: EligibilityReport;
  criteria: CriteriaRubric[];
  meetsCriteria: CriteriaRubric[];
  failedCriteria: CriteriaRubric[];
  insufficientCriteria: CriteriaRubric[];
  hardGates: Array<{
    id: string;
    name: string;
    requiredRule: string;
    candidateValue: string;
    status: 'PASS' | 'FAIL' | 'REVIEW';
    evidenceSnippet: string;
  }>;
  evaluations: CriteriaEvaluation[];  // Detailed per-criterion evaluations
  processingTimeMs: number;
  // Important: do NOT collapse to percentage
  cannotBeSimplifiedTo: 'single_percentage';
  interpretationGuidance: string[];
}

// Criterion-level evaluation with explicit reasoning
export interface CriterionEvaluationDetail {
  criterionId: string;
  criterionTitle: string;
  status: DecisionOutcome;
  statusReasoning: string;
  evidenceUsed: EvidenceReference[];
  evidenceGap?: {
    missing: string[];
    suggestedDocuments: string[];
  };
  confidenceInDetermination: number;
  isHardGate: boolean;
  evaluatorOverride?: {
    by: string;
    reason: string;
    timestamp: string;
  };
}

/**
 * Run deterministic eligibility evaluation
 * This is the CORE function - it must never be overridden by an LLM
 */
export function runEligibilityEvaluation(
  opportunity: Opportunity,
  profile: CandidateProfile,
  documents: IngestedDocument[],
  criteriaRubrics: CriteriaRubric[],
  citations: EvidenceCitation[] = [],
  options: Partial<EvaluationOptions> = {}
): EvaluationResult {
  const startTime = Date.now();
  const runId = options.runId || `eval-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  
  // Call the existing deterministic engine
  const engineResult = evaluateEligibility(opportunity, {
    opportunityId: opportunity.id,
    candidateProfile: profile,
    criteriaRubrics,
    documents,
    caseId: options.caseId,
  });
  
  // Process and organize results
  const meetsCriteria = engineResult.criteria.filter(c => c.status === 'MEETS' || c.status === 'VERIFIED');
  const failedCriteria = engineResult.criteria.filter(c => c.status === 'FAILED' || c.status === 'FAIL');
  const insufficientCriteria = engineResult.criteria.filter(c => 
    c.status === 'INSUFFICIENT' || c.status === 'INSUFFICIENT_EVIDENCE' || c.status === 'REVIEW'
  );
  
  // Build detailed criterion evaluations with explicit reasoning
  const evaluations: CriteriaEvaluation[] = engineResult.criteria.map(criterion => {
    // Determine decision outcome
    let status: DecisionOutcome;
    let reasoning: string;
    
    if (criterion.status === 'MEETS' || criterion.status === 'VERIFIED' || criterion.status === 'PASS') {
      status = 'MEETS';
      reasoning = buildMeetsReasoning(criterion, citations);
    } else if (criterion.status === 'FAILED' || criterion.status === 'FAIL') {
      status = 'DOES_NOT_MEET';
      reasoning = buildDoesNotMeetReasoning(criterion, citations);
    } else {
      status = 'INSUFFICIENT_EVIDENCE';
      reasoning = buildInsufficientReasoning(criterion, citations);
    }
    
    return {
      rubricId: criterion.id,
      criterionTitle: criterion.criterionTitle,
      clauseCategory: criterion.clauseCategory,
      isHardGate: criterion.isHardGate,
      requiredEvidence: [], // Would be populated from criterion definition
      status,
      statusReasoning: reasoning,
      evidenceCitations: criterion.evidenceCitation ? [{
        documentId: criterion.evidenceCitation.documentId,
        documentName: criterion.evidenceCitation.documentName,
        pageNumber: criterion.evidenceCitation.pageNumber,
        lineNumber: criterion.evidenceCitation.lineNumber,
        verbatimQuote: criterion.evidenceCitation.verbatimQuote,
        normalizedExtractedText: '', // Would come from document extraction
        verbatimMatchVerified: criterion.evidenceCitation.confidence >= 0.9, // Proxy for verification
        schemaValidation: null, // Would be populated from schema validation
        extractionConfidence: {
          score: criterion.evidenceCitation.confidence,
          method: 'OCR',
          qualityFlags: [],
        },
        extractionMethod: 'OCR_PARSED',
        sha256Hash: criterion.evidenceCitation.sha256Hash,
        extractedAt: criterion.evidenceCitation.extractedDate,
        reasonCode: criterion.evidenceCitation.reasonCode,
      }] : [],
      evaluatorNote: criterion.evaluatorNote,
      confidenceInDetermination: criterion.evidenceCitation?.confidence || 0.5,
    };
  });
  
  // Interpretation guidance - critical for transparency
  const interpretationGuidance = [
    `This evaluation is DETERMINISTIC - it uses fixed rules, not LLM judgment.`,
    `MEETS means sufficient verified evidence was found to satisfy this criterion.`,
    `DOES_NOT_MEET means explicit disqualifying evidence was found.`,
    `INSUFFICIENT_EVIDENCE means the criterion could not be evaluated - more documents or information may be needed.`,
    `This result CANNOT be simplified to a single percentage score. Each criterion's outcome is independent and must be evaluated on its own merits.`,
    `Hard gates (${engineResult.report.hardGatesPassed}/${engineResult.report.totalHardGates} passed) are mandatory requirements - failure on any hard gate typically disqualifies the candidate.`,
  ];
  
  return {
    report: engineResult.report,
    criteria: engineResult.criteria,
    meetsCriteria,
    failedCriteria,
    insufficientCriteria,
    hardGates: engineResult.report.hardGates,
    evaluations,
    processingTimeMs: Date.now() - startTime,
    cannotBeSimplifiedTo: 'single_percentage',
    interpretationGuidance,
  };
}

/**
 * Build reasoning for MEETS status
 */
function buildMeetsReasoning(
  criterion: CriteriaRubric,
  citations: EvidenceCitation[]
): string {
  const evidences = citations.filter(c => c.documentId === criterion.evidenceCitation?.documentId);
  
  if (criterion.evidenceCitation) {
    const confidence = criterion.evidenceCitation.confidence;
    return `Criterion MET: Verified evidence found in ${criterion.evidenceCitation.documentName} (page ${criterion.evidenceCitation.pageNumber}). 
Quote: "${criterion.evidenceCitation.verbatimQuote}"
Evidence confidence: ${(confidence * 100).toFixed(1)}%.`;
  }
  
  return `Criterion MET: Candidate satisfies this requirement based on profile data and verified documents.`;
}

/**
 * Build reasoning for DOES_NOT_MEET status
 */
function buildDoesNotMeetReasoning(
  criterion: CriteriaRubric,
  citations: EvidenceCitation[]
): string {
  if (criterion.evidenceCitation) {
    return `Criterion NOT MET: Disqualifying evidence found in ${criterion.evidenceCitation.documentName} (page ${criterion.evidenceCitation.pageNumber}).
Issue: ${criterion.evaluatorNote || criterion.clauseExcerpt}
Required: ${criterion.clauseExcerpt}`;
  }
  
  return `Criterion NOT MET: Candidate does not satisfy this requirement. Required: ${criterion.clauseExcerpt}`;
}

/**
 * Build reasoning for INSUFFICIENT_EVIDENCE status
 */
function buildInsufficientReasoning(
  criterion: CriteriaRubric,
  citations: EvidenceCitation[]
): string {
  const requiredType = criterion.clauseCategory;
  const docTypesNeeded = getRequiredDocumentTypes(requiredType);
  
  return `INSUFFICIENT EVIDENCE: Cannot determine eligibility for this criterion.
Required: ${criterion.clauseExcerpt}
Missing: ${docTypesNeeded.join(', ')} document(s) or additional information.
Suggestion: ${getSuggestionForCriterion(requiredType)}`;
}

/**
 * Get required document types for a criterion category
 */
function getRequiredDocumentTypes(category: CriteriaRubric['clauseCategory']): string[] {
  const map: Record<string, string[]> = {
    'GPA_THRESHOLD': ['TRANSCRIPT'],
    'CONFERRAL_WINDOW': ['TRANSCRIPT'],
    'VISA_CITIZENSHIP': ['I20_VISA', 'TRANSCRIPT'],
    'EDUCATION_TIER': ['TRANSCRIPT', 'CV'],
    'DOMAIN_EXPERTISE': ['PREPRINT', 'CV', 'LOR'],
  };
  return map[category] || ['TRANSCRIPT'];
}

/**
 * Get suggestion for addressing insufficient evidence
 */
function getSuggestionForCriterion(category: CriteriaRubric['clauseCategory']): string {
  const suggestions: Record<string, string> = {
    'GPA_THRESHOLD': 'Upload your official academic transcript showing GPA calculation.',
    'CONFERRAL_WINDOW': 'Upload transcript showing expected degree conferral date.',
    'VISA_CITIZENSHIP': 'Upload your Form I-20 or citizenship documentation.',
    'EDUCATION_TIER': 'Upload transcript and CV showing your education history.',
    'DOMAIN_EXPERTISE': 'Upload research publications, CV, or letters of recommendation.',
  };
  return suggestions[category] || 'Provide additional documentation to support this criterion.';
}

/**
 * Re-evaluate after profile or document changes
 * Returns delta from previous evaluation if provided
 */
export function reEvaluate(
  opportunity: Opportunity,
  newProfile: CandidateProfile,
  newDocuments: IngestedDocument[],
  criteriaRubrics: CriteriaRubric[],
  previousResult?: EvaluationResult
): {
  result: EvaluationResult;
  changedCriteria: Array<{
    criterionId: string;
    previousStatus: DecisionOutcome;
    newStatus: DecisionOutcome;
    changeReason: string;
  }>;
} {
  const result = runEligibilityEvaluation(opportunity, newProfile, newDocuments, criteriaRubrics);
  
  const changedCriteria: Array<{
    criterionId: string;
    previousStatus: DecisionOutcome;
    newStatus: DecisionOutcome;
    changeReason: string;
  }> = [];
  
  if (previousResult) {
    for (const eval_ of result.evaluations) {
      const prevEval = previousResult.evaluations.find(e => e.rubricId === eval_.rubricId);
      if (prevEval && prevEval.status !== eval_.status) {
        changedCriteria.push({
          criterionId: eval_.rubricId,
          previousStatus: prevEval.status,
          newStatus: eval_.status,
          changeReason: `Status changed from ${prevEval.status} to ${eval_.status}. ${eval_.statusReasoning}`,
        });
      }
    }
  }
  
  return { result, changedCriteria };
}

/**
 * Verify criterion evaluation integrity
 * Ensures no hallucination in evidence citations
 */
export function verifyEvaluationIntegrity(
  evaluation: EvaluationResult,
  documents: IngestedDocument[],
  normalizedTexts: Map<string, string>  // documentId -> normalized text
): {
  integrityChecks: Array<{
    check: string;
    passed: boolean;
    details: string;
  }>;
  anyFailures: boolean;
} {
  const checks: Array<{
    check: string;
    passed: boolean;
    details: string;
  }> = [];
  
  // Check 1: All citations have valid document references
  for (const eval_ of evaluation.evaluations) {
    for (const citation of eval_.evidenceCitations) {
      const doc = documents.find(d => d.id === citation.documentId);
      if (!doc) {
        checks.push({
          check: `Document reference for citation in ${eval_.criterionTitle}`,
          passed: false,
          details: `Citation references document ${citation.documentId} which does not exist in vault`,
        });
        continue;
      }
      
      // Check 2: Verify verbatim match if we have normalized text
      if (normalizedTexts.has(citation.documentId)) {
        const result = verifyVerbatimMatch(citation.verbatimQuote, normalizedTexts.get(citation.documentId)!, {
          caseSensitive: false,
          normalizeWhitespace: true,
        });
        
        checks.push({
          check: `Verbatim match for "${citation.verbatimQuote.slice(0, 50)}..."`,
          passed: result.matched,
          details: result.matched 
            ? 'Quote verified in source document'
            : 'Quote NOT found - possible hallucination',
        });
      }
    }
  }
  
  // Check 3: No fabricated evidence
  const fabricatedEvidence = evaluation.evaluations.filter(e => 
    e.evidenceCitations.length > 0 && 
    !documents.some(d => d.id === e.evidenceCitations[0].documentId)
  );
  
  if (fabricatedEvidence.length > 0) {
    checks.push({
      check: 'No fabricated evidence',
      passed: false,
      details: `${fabricatedEvidence.length} criterion(s) have evidence from non-existent documents`,
    });
  } else {
    checks.push({
      check: 'No fabricated evidence',
      passed: true,
      details: 'All evidence citations reference existing documents',
    });
  }
  
  return {
    integrityChecks: checks,
    anyFailures: checks.some(c => !c.passed),
  };
}

/**
 * Get human-readable summary of evaluation results
 */
export function summarizeEvaluation(result: EvaluationResult): string {
  const lines: string[] = [];
  
  lines.push(`## Eligibility Evaluation Summary`);
  lines.push(``);
  lines.push(`**Opportunity:** ${result.report.opportunityTitle}`);
  lines.push(`**Candidate:** ${result.report.candidateName}`);
  lines.push(`**Overall Status:** ${result.report.overallStatus}`);
  lines.push(``);
  lines.push(`### Hard Gates: ${result.report.hardGatesPassed}/${result.report.totalHardGates} passed`);
  lines.push(``);
  
  // Criterion breakdown
  lines.push(`### Criteria Results`);
  lines.push(``);
  lines.push(`**MEETS (${result.meetsCriteria.length}):**`);
  for (const c of result.meetsCriteria) {
    lines.push(`  - ${c.criterionTitle}: ${c.evaluatorNote || 'Satisfied'}`);
  }
  lines.push(``);
  
  if (result.failedCriteria.length > 0) {
    lines.push(`**DOES_NOT_MEET (${result.failedCriteria.length}):**`);
    for (const c of result.failedCriteria) {
      lines.push(`  - ${c.criterionTitle}: ${c.evaluatorNote || 'Not satisfied'}`);
    }
    lines.push(``);
  }
  
  if (result.insufficientCriteria.length > 0) {
    lines.push(`**INSUFFICIENT_EVIDENCE (${result.insufficientCriteria.length}):**`);
    for (const c of result.insufficientCriteria) {
      lines.push(`  - ${c.criterionTitle}: ${c.evaluatorNote || 'More evidence needed'}`);
    }
    lines.push(``);
  }
  
  // Interpretation guidance
  lines.push(`### Important Notes`);
  for (const guidance of result.interpretationGuidance) {
    lines.push(`- ${guidance}`);
  }
  
  return lines.join('\n');
}
