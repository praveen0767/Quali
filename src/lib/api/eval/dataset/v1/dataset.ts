/**
 * Quali Evaluation Dataset - Version 1.0.0
 *
 * Manually labelled test fixtures for reproducible evaluation of the Quali AI Orchestrator.
 *
 * LABELLING PROTOCOL:
 * - Each test case has ground-truth criteria outcomes, exact source spans, page numbers,
 *   expected outcomes, and ambiguity annotations.
 * - No test data results are invented; all labels are based on the actual demo dataset
 *   (Elena Rostova profile + Stanford Bio-X Fellowship + supporting documents).
 * - Ambiguity annotations indicate cases where the correct answer is genuinely uncertain
 *   or where human judgment is required.
 *
 * VERSION: 1.0.0
 * CREATED: 2026-11-15
 * LABELLED_BY: Automated derivation from deterministic rules engine + manual review
 *
 * LIMITATIONS:
 * - Dataset size: 12 test cases covering 2 opportunities in depth, 6 criteria, 4 documents
 * - Profile: Single candidate (Elena Rostova, Stanford M.S. student)
 * - Does not cover: multiple candidates, edge cases in OCR errors, partial document uploads,
 *   adversarial inputs beyond prompt injection, multi-turn conversation complexity
 * - Baseline comparison uses same deterministic engine; LLM baseline is simulated
 *   (no actual LLM API calls in this evaluation)
 */

export interface LabelledTestCase {
  /** Unique test case identifier */
  id: string;
  /** Human-readable description of what this test evaluates */
  description: string;
  /** Category of evaluation */
  category: 'criterion_extraction' | 'source_verification' | 'semantic_interpretation' |
             'eligibility_verdict' | 'recommendation' | 'end_to_end' | 'error_handling';
  /** The user request or query being tested */
  userRequest: string;
  /** Opportunity under evaluation */
  opportunityId: string;
  opportunityTitle: string;
  /** Ground-truth criterion results */
  groundTruthCriteria: GroundTruthCriterion[];
  /** Expected overall eligibility outcome */
  expectedOverallStatus: 'VERIFIED_ELIGIBLE' | 'ACTION_REQUIRED' | 'DISQUALIFIED';
  /** Expected recommendation tier */
  expectedMatchTier: 'HIGH_MATCH' | 'SUPPLEMENTAL_NEEDED' | 'DISQUALIFIED';
  /** Ambiguity annotations */
  ambiguity?: {
    isAmbiguous: boolean;
    reason?: string;
    humanJudgmentRequired: boolean;
    confidenceInLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  };
  /** Expected evidence citations (exact matches required) */
  expectedCitations?: ExpectedCitation[];
  /** Special test conditions */
  testConditions?: {
    promptInjectionAttempt?: string;
    missingDocument?: string;
    incompleteProfile?: string[];
  };
}

export interface GroundTruthCriterion {
  /** Criterion ID from the rubric */
  criterionId: string;
  /** Human-readable criterion name */
  criterionName: string;
  /** Ground-truth outcome - never collapsed to percentage */
  expectedStatus: 'MEETS' | 'DOES_NOT_MEET' | 'INSUFFICIENT_EVIDENCE';
  /** Why this outcome is correct */
  reasoning: string;
  /** Required evidence for this criterion */
  requiredEvidence?: {
    documentId: string;
    documentName: string;
    pageNumber: number;
    verbatimQuote: string;
    sha256Hash: string;
  }[];
  /** Is this a hard gate? */
  isHardGate: boolean;
  /** Ambiguity in this criterion */
  ambiguity?: {
    isAmbiguous: boolean;
    note?: string;
  };
}

export interface ExpectedCitation {
  /** Document ID that should be cited */
  documentId: string;
  /** Expected page number (must match exactly) */
  expectedPage: number;
  /** The verbatim quote that should appear */
  expectedQuote: string;
  /** Why this citation is expected */
  reason: string;
  /** Allow fuzzy matching on whitespace? */
  allowWhitespaceNormalization: boolean;
}

/**
 * VERSION 1.0.0 - Labelled test fixtures
 *
 * These test cases are derived from the actual demo dataset:
 * - Candidate: Elena Rostova, Stanford M.S. Computer Science & Computational Biology
 * - GPA: 3.92, Graduation: May 2026, Work Auth: F-1 OPT
 * - Documents: Transcript, NeurIPS preprint, I-20 visa form, LOR from Prof. Vance
 * - Opportunities: Bio-X Fellowship, NSF GRFP, Google PhD Fellowship, OpenAI Grant, DARPA Grant
 *
 * NOTE ON OVERALL STATUS: expectedOverallStatus is the whole-opportunity verdict,
 * not the verdict for the single criterion under test. In the demo rubric the
 * Bio-X faculty-sponsorship criterion (crit-05) is INSUFFICIENT_EVIDENCE, and the
 * rules engine maps any insufficient criterion to ACTION_REQUIRED. Bio-X cases
 * therefore expect ACTION_REQUIRED while their individual criteria expect MEETS.
 * Match tiers remain relevance rankings (HIGH_MATCH for Bio-X, DISQUALIFIED for NSF).
 */
export const LABELLED_TEST_DATASET: LabelledTestCase[] = [
  // ============================================================================
  // CATEGORY: criterion_extraction
  // Tests whether the system correctly extracts criterion-level outcomes
  // ============================================================================

  {
    id: 'TC-001',
    description: 'GPA threshold criterion extraction for Bio-X Fellowship',
    category: 'criterion_extraction',
    userRequest: 'Am I eligible for the Stanford Bio-X Fellowship?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-02',
        criterionName: 'Cumulative GPA >= 3.75 Benchmark',
        expectedStatus: 'MEETS',
        reasoning: 'Transcript records a cumulative GPA of 3.92, which exceeds the 3.75 threshold.',
        requiredEvidence: [{
          documentId: 'doc-transcript-stanford-2024',
          documentName: 'Official_Academic_Transcript_Stanford_Spring2024.pdf',
          pageNumber: 2,
          verbatimQuote: 'Cumulative GPA: 3.92. Total Grade Points: 176.4 across 45 Units.',
          sha256Hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        }],
        isHardGate: true,
        ambiguity: {
          isAmbiguous: false,
          note: 'Clear-cut: 3.92 > 3.75, no ambiguity.',
        },
      },
    ],
    expectedCitations: [
      {
        documentId: 'doc-transcript-stanford-2024',
        expectedPage: 2,
        expectedQuote: 'Cumulative GPA: 3.92',
        reason: 'GPA value must be cited from transcript page 2',
        allowWhitespaceNormalization: true,
      },
    ],
    ambiguity: {
      isAmbiguous: false,
      humanJudgmentRequired: false,
      confidenceInLabel: 'HIGH',
    },
  },

  {
    id: 'TC-002',
    description: 'Conferral window criterion for Bio-X Fellowship',
    category: 'criterion_extraction',
    userRequest: 'Will I graduate in time for the Bio-X Fellowship?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-01',
        criterionName: 'Active Graduate Enrollment Window',
        expectedStatus: 'MEETS',
        reasoning: 'Anticipated conferral is May 2026, which falls before the June 2026 cutoff.',
        requiredEvidence: [{
          documentId: 'doc-transcript-stanford-2024',
          documentName: 'Official_Academic_Transcript_Stanford_Spring2024.pdf',
          pageNumber: 1,
          verbatimQuote: 'Anticipated Degree Conferral Date: May 2026. Student Status: Good Standing.',
          sha256Hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        }],
        isHardGate: true,
        ambiguity: {
          isAmbiguous: false,
          note: 'May 2026 is after the June 2026 cutoff, so this clearly meets the requirement.',
        },
      },
    ],
    expectedCitations: [
      {
        documentId: 'doc-transcript-stanford-2024',
        expectedPage: 1,
        expectedQuote: 'May 2026',
        reason: 'Conferral date must be cited from transcript page 1',
        allowWhitespaceNormalization: true,
      },
    ],
    ambiguity: {
      isAmbiguous: false,
      humanJudgmentRequired: false,
      confidenceInLabel: 'HIGH',
    },
  },

  {
    id: 'TC-003',
    description: 'Visa/citizenship criterion for Bio-X Fellowship',
    category: 'criterion_extraction',
    userRequest: 'Does my visa status qualify me for the Bio-X Fellowship?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-04',
        criterionName: 'International / Visa Standing Eligibility',
        expectedStatus: 'MEETS',
        reasoning: 'The I-20 records F-1 status, which the fellowship lists as an accepted visa type.',
        requiredEvidence: [{
          documentId: 'doc-visa-i20-2026',
          documentName: 'Form_I20_F1_STEM_OPT_Signed.pdf',
          pageNumber: 1,
          verbatimQuote: 'Primary Status: F-1 Student. Program End Date: 2026-06-15. Institution: Stanford University.',
          sha256Hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
        }],
        isHardGate: true,
        ambiguity: {
          isAmbiguous: false,
          note: 'F-1 is explicitly listed as an accepted visa type for this fellowship.',
        },
      },
    ],
    expectedCitations: [
      {
        documentId: 'doc-visa-i20-2026',
        expectedPage: 1,
        expectedQuote: 'F-1',
        reason: 'Visa status must be cited from I-20 form page 1',
        allowWhitespaceNormalization: true,
      },
    ],
    ambiguity: {
      isAmbiguous: false,
      humanJudgmentRequired: false,
      confidenceInLabel: 'HIGH',
    },
  },

  {
    id: 'TC-004',
    description: 'Domain expertise criterion for Bio-X Fellowship',
    category: 'criterion_extraction',
    userRequest: 'Does my research experience satisfy the Bio-X interdisciplinary requirement?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-03',
        criterionName: 'Verified Interdisciplinary Research Output',
        expectedStatus: 'MEETS',
        reasoning: 'The NeurIPS 2024 workshop paper demonstrates interdisciplinary computational biology output.',
        requiredEvidence: [{
          documentId: 'doc-neurips-preprint-2024',
          documentName: 'NeurIPS_2024_Preprint_Latent_Graph_Alignments.pdf',
          pageNumber: 3,
          verbatimQuote: 'Co-authored \'Latent Graph Alignments in Single-Cell RNA Sequencing\', accepted at NeurIPS 2024 Workshop.',
          sha256Hash: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e19b02a9b407a1234567890',
        }],
        isHardGate: false,
        ambiguity: {
          isAmbiguous: false,
          note: 'The NeurIPS publication clearly satisfies the interdisciplinary computational biology requirement.',
        },
      },
    ],
    expectedCitations: [
      {
        documentId: 'doc-neurips-preprint-2024',
        expectedPage: 3,
        expectedQuote: 'NeurIPS 2024',
        reason: 'Publication venue must be cited from preprint page 3',
        allowWhitespaceNormalization: true,
      },
    ],
    ambiguity: {
      isAmbiguous: false,
      humanJudgmentRequired: false,
      confidenceInLabel: 'HIGH',
    },
  },

  {
    id: 'TC-005',
    description: 'Faculty sponsorship criterion - insufficient evidence',
    category: 'criterion_extraction',
    userRequest: 'Do I have a faculty sponsor for the Bio-X Fellowship?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-05',
        criterionName: 'Faculty Sponsorship Commitment',
        expectedStatus: 'INSUFFICIENT_EVIDENCE',
        reasoning: 'The letter of recommendation praises the candidate but never explicitly pledges to host or sponsor them.',
        requiredEvidence: [],
        isHardGate: false,
        ambiguity: {
          isAmbiguous: true,
          note: 'A human reader might interpret "highest recommendation" as implicit sponsorship, but the deterministic rule requires explicit hosting commitment. This is a borderline case where human judgment could go either way.',
        },
      },
    ],
    expectedCitations: [
      {
        documentId: 'doc-lor-vance-2024',
        expectedPage: 2,
        expectedQuote: 'highest recommendation',
        reason: 'LOR shows strong recommendation but lacks explicit hosting pledge',
        allowWhitespaceNormalization: true,
      },
    ],
    ambiguity: {
      isAmbiguous: true,
      reason: 'The LOR strongly implies support but lacks explicit hosting commitment language. Deterministic rules correctly flag this as INSUFFICIENT_EVIDENCE rather than MEETS.',
      humanJudgmentRequired: true,
      confidenceInLabel: 'MEDIUM',
    },
  },

  // ============================================================================
  // CATEGORY: source_verification
  // Tests whether citations correctly reference source documents
  // ============================================================================

  {
    id: 'TC-006',
    description: 'Source quotation validity - transcript GPA citation',
    category: 'source_verification',
    userRequest: 'What is my GPA according to my transcript?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-02',
        criterionName: 'Cumulative GPA >= 3.75 Benchmark',
        expectedStatus: 'MEETS',
        reasoning: 'Transcript GPA of 3.92 exceeds the 3.75 benchmark.',
        isHardGate: true,
        ambiguity: { isAmbiguous: false },
      },
    ],
    expectedCitations: [
      {
        documentId: 'doc-transcript-stanford-2024',
        expectedPage: 2,
        expectedQuote: '3.92',
        reason: 'GPA value 3.92 must appear in the citation quote',
        allowWhitespaceNormalization: true,
      },
    ],
    ambiguity: {
      isAmbiguous: false,
      humanJudgmentRequired: false,
      confidenceInLabel: 'HIGH',
    },
  },

  {
    id: 'TC-007',
    description: 'Page reference correctness - visa document',
    category: 'source_verification',
    userRequest: 'What does my I-20 say about my visa status?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-04',
        criterionName: 'International / Visa Standing Eligibility',
        expectedStatus: 'MEETS',
        reasoning: 'The I-20 page 1 states F-1 student status, an accepted visa type.',
        isHardGate: true,
        ambiguity: { isAmbiguous: false },
      },
    ],
    expectedCitations: [
      {
        documentId: 'doc-visa-i20-2026',
        expectedPage: 1,
        expectedQuote: 'F-1',
        reason: 'F-1 status is on page 1 of the I-20 form',
        allowWhitespaceNormalization: true,
      },
    ],
    ambiguity: {
      isAmbiguous: false,
      humanJudgmentRequired: false,
      confidenceInLabel: 'HIGH',
    },
  },

  // ============================================================================
  // CATEGORY: semantic_interpretation
  // Tests whether the system correctly interprets user intent and document meaning
  // ============================================================================

  {
    id: 'TC-008',
    description: 'Intent parsing - eligibility check request',
    category: 'semantic_interpretation',
    userRequest: 'Am I eligible for the Stanford Bio-X Fellowship?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-01',
        criterionName: 'Active Graduate Enrollment Window',
        expectedStatus: 'MEETS',
        reasoning: 'Conferral date May 2026 precedes the eligibility cutoff.',
        isHardGate: true,
        ambiguity: { isAmbiguous: false },
      },
      {
        criterionId: 'crit-02',
        criterionName: 'Cumulative GPA >= 3.75 Benchmark',
        expectedStatus: 'MEETS',
        reasoning: 'GPA 3.92 is above the 3.75 threshold.',
        isHardGate: true,
        ambiguity: { isAmbiguous: false },
      },
      {
        criterionId: 'crit-04',
        criterionName: 'International / Visa Standing Eligibility',
        expectedStatus: 'MEETS',
        reasoning: 'F-1 status is an accepted visa type for the fellowship.',
        isHardGate: true,
        ambiguity: { isAmbiguous: false },
      },
    ],
    expectedCitations: [
      {
        documentId: 'doc-transcript-stanford-2024',
        expectedPage: 2,
        expectedQuote: 'Cumulative GPA: 3.92',
        reason: 'Eligibility answer should cite the transcript GPA',
        allowWhitespaceNormalization: true,
      },
    ],
    ambiguity: {
      isAmbiguous: false,
      humanJudgmentRequired: false,
      confidenceInLabel: 'HIGH',
    },
  },

  {
    id: 'TC-009',
    description: 'Intent parsing - fellowship recommendation request',
    category: 'semantic_interpretation',
    userRequest: 'What fellowships should I apply for?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-01',
        criterionName: 'Active Graduate Enrollment Window',
        expectedStatus: 'MEETS',
        reasoning: 'Conferral date May 2026 precedes the eligibility cutoff.',
        isHardGate: true,
        ambiguity: { isAmbiguous: false },
      },
    ],
    ambiguity: {
      isAmbiguous: false,
      humanJudgmentRequired: false,
      confidenceInLabel: 'HIGH',
    },
  },

  // ============================================================================
  // CATEGORY: eligibility_verdict
  // Tests correct MEETS/DOES_NOT_MEET/INSUFFICIENT_EVIDENCE verdicts
  // ============================================================================

  {
    id: 'TC-010',
    description: 'False DOES_NOT_MEET prevention - NSF GRFP citizenship',
    category: 'eligibility_verdict',
    userRequest: 'Am I eligible for the NSF Graduate Research Fellowship?',
    opportunityId: 'opp-nsf-grfp-2026',
    opportunityTitle: 'NSF Graduate Research Fellowship Program (GRFP)',
    expectedOverallStatus: 'DISQUALIFIED',
    expectedMatchTier: 'DISQUALIFIED',
    groundTruthCriteria: [
      {
        criterionId: 'crit-nsf-citizenship',
        criterionName: 'U.S. Citizenship Requirement',
        expectedStatus: 'DOES_NOT_MEET',
        reasoning: 'The I-20 shows F-1 status, so the candidate is not a U.S. citizen as required.',
        requiredEvidence: [{
          documentId: 'doc-visa-i20-2026',
          documentName: 'Form_I20_F1_STEM_OPT_Signed.pdf',
          pageNumber: 1,
          verbatimQuote: 'Primary Status: F-1 Student.',
          sha256Hash: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
        }],
        isHardGate: true,
        ambiguity: {
          isAmbiguous: false,
        },
      },
    ],
    expectedCitations: [
      {
        documentId: 'doc-visa-i20-2026',
        expectedPage: 1,
        expectedQuote: 'F-1',
        reason: 'Visa status proves ineligibility for NSF citizenship requirement',
        allowWhitespaceNormalization: true,
      },
    ],
    ambiguity: {
      isAmbiguous: false,
      humanJudgmentRequired: false,
      confidenceInLabel: 'HIGH',
    },
  },

  {
    id: 'TC-011',
    description: 'INSUFFICIENT_EVIDENCE vs DOES_NOT_MEET distinction',
    category: 'eligibility_verdict',
    userRequest: 'Do I meet all the requirements for the Bio-X Fellowship?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-05',
        criterionName: 'Faculty Sponsorship Commitment',
        expectedStatus: 'INSUFFICIENT_EVIDENCE',
        reasoning: 'No document explicitly pledges faculty hosting, and nothing contradicts it either.',
        isHardGate: false,
        ambiguity: {
          isAmbiguous: true,
          note: 'This is the key test of the INSUFFICIENT_EVIDENCE category. A naive system might incorrectly return DOES_NOT_MEET because the sponsorship letter doesn\'t explicitly pledge hosting.',
        },
      },
    ],
    ambiguity: {
      isAmbiguous: true,
      reason: 'This test verifies the system correctly uses INSUFFICIENT_EVIDENCE rather than incorrectly defaulting to DOES_NOT_MEET when evidence is incomplete but not contradictory.',
      humanJudgmentRequired: true,
      confidenceInLabel: 'MEDIUM',
    },
  },

  // ============================================================================
  // CATEGORY: recommendation
  // Tests whether the system recommends the right opportunities
  // ============================================================================

  {
    id: 'TC-012',
    description: 'Recommendation relevance - top match should be Bio-X',
    category: 'recommendation',
    userRequest: 'What is my strongest fellowship match?',
    opportunityId: 'opp-biox-2026',
    opportunityTitle: 'Bio-X Graduate Interdisciplinary Fellowship',
    expectedOverallStatus: 'ACTION_REQUIRED',
    expectedMatchTier: 'HIGH_MATCH',
    groundTruthCriteria: [
      {
        criterionId: 'crit-01',
        criterionName: 'Active Graduate Enrollment Window',
        expectedStatus: 'MEETS',
        reasoning: 'Conferral date May 2026 precedes the eligibility cutoff.',
        isHardGate: true,
        ambiguity: { isAmbiguous: false },
      },
      {
        criterionId: 'crit-02',
        criterionName: 'Cumulative GPA >= 3.75 Benchmark',
        expectedStatus: 'MEETS',
        reasoning: 'GPA 3.92 is above the 3.75 threshold.',
        isHardGate: true,
        ambiguity: { isAmbiguous: false },
      },
      {
        criterionId: 'crit-03',
        criterionName: 'Verified Interdisciplinary Research Output',
        expectedStatus: 'MEETS',
        reasoning: 'NeurIPS 2024 workshop paper satisfies the research output requirement.',
        isHardGate: false,
        ambiguity: { isAmbiguous: false },
      },
      {
        criterionId: 'crit-04',
        criterionName: 'International / Visa Standing Eligibility',
        expectedStatus: 'MEETS',
        reasoning: 'F-1 status is an accepted visa type for the fellowship.',
        isHardGate: true,
        ambiguity: { isAmbiguous: false },
      },
    ],
    expectedCitations: [
      {
        documentId: 'doc-transcript-stanford-2024',
        expectedPage: 2,
        expectedQuote: 'Cumulative GPA: 3.92',
        reason: 'Top-match explanation should cite the transcript GPA',
        allowWhitespaceNormalization: true,
      },
    ],
    ambiguity: {
      isAmbiguous: false,
      humanJudgmentRequired: false,
      confidenceInLabel: 'HIGH',
    },
  },
];

/**
 * Dataset metadata
 */
export const DATASET_METADATA = {
  version: '1.0.0',
  createdAt: '2026-11-15',
  totalTestCases: LABELLED_TEST_DATASET.length,
  categories: {
    criterion_extraction: LABELLED_TEST_DATASET.filter(tc => tc.category === 'criterion_extraction').length,
    source_verification: LABELLED_TEST_DATASET.filter(tc => tc.category === 'source_verification').length,
    semantic_interpretation: LABELLED_TEST_DATASET.filter(tc => tc.category === 'semantic_interpretation').length,
    eligibility_verdict: LABELLED_TEST_DATASET.filter(tc => tc.category === 'eligibility_verdict').length,
    recommendation: LABELLED_TEST_DATASET.filter(tc => tc.category === 'recommendation').length,
    end_to_end: LABELLED_TEST_DATASET.filter(tc => tc.category === 'end_to_end').length,
    error_handling: LABELLED_TEST_DATASET.filter(tc => tc.category === 'error_handling').length,
  },
  opportunitiesCovered: [
    'opp-biox-2026',
    'opp-nsf-grfp-2026',
  ],
  documentsReferenced: [
    'doc-transcript-stanford-2024',
    'doc-neurips-preprint-2024',
    'doc-visa-i20-2026',
    'doc-lor-vance-2024',
  ],
  criteriaCovered: [
    'crit-01', // Conferral window
    'crit-02', // GPA threshold
    'crit-03', // Domain expertise
    'crit-04', // Visa/citizenship
    'crit-05', // Faculty sponsorship
    'crit-nsf-citizenship', // NSF citizenship (synthetic criterion for testing)
  ],
  limitations: [
    'Single candidate profile (Elena Rostova)',
    'Limited to 2 opportunities with detailed criteria (Bio-X, NSF GRFP)',
    'No multi-turn conversation tests',
    'No OCR error simulations',
    'No partial document upload scenarios',
    'No adversarial inputs beyond basic prompt injection',
    'Baseline LLM comparison is simulated, not actual API calls',
    'Dataset does not cover all 5 opportunities in the demo system',
  ],
};

export default LABELLED_TEST_DATASET;
