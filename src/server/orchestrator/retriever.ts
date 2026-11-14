/**
 * RETRIEVER: Find relevant information from approved opportunity documents and source references.
 * Return evidence, not unsupported summaries.
 * 
 * Responsibilities:
 * - Search ingested documents for relevant evidence
 * - Extract citations with verbatim quotes from source documents
 * - Link evidence to specific criteria being evaluated
 * - Never fabricate quotes or claims
 * - Always include document ID, page number, and verbatim text
 * - Return confidence scores for extracted evidence
 */

import crypto from 'crypto';
import { 
  IngestedDocument, 
  EvidenceCitation,
  CriteriaRubric,
  Opportunity,
  ExtractionProvenance
} from '../../lib/api/types';
import { EvidenceReference } from '../../lib/api/orchestratorTypes';
import { verifyVerbatimMatch } from '../engine/promptInjection';

// Evidence categories we can extract
export type EvidenceCategory = 
  | 'GPA'
  | 'DEGREE_CONFERRAL'
  | 'ENROLLMENT_STATUS'
  | 'CITIZENSHIP'
  | 'WORK_AUTHORIZATION'
  | 'RESEARCH_PUBLICATION'
  | 'RECOMMENDATION'
  | 'INSTITUTION'
  | 'DEGREE_PROGRAM';

// Map document types to extractable evidence categories
const DOCUMENT_EVIDENCE_MAP: Record<IngestedDocument['documentType'], EvidenceCategory[]> = {
  TRANSCRIPT: ['GPA', 'DEGREE_CONFERRAL', 'ENROLLMENT_STATUS', 'INSTITUTION', 'DEGREE_PROGRAM'],
  PREPRINT: ['RESEARCH_PUBLICATION'],
  LOR: ['RECOMMENDATION'],
  CV: ['RESEARCH_PUBLICATION', 'DEGREE_PROGRAM'],
  I20_VISA: ['CITIZENSHIP', 'WORK_AUTHORIZATION'],
};

// Criterion to evidence category mapping
const CRITERION_EVIDENCE_MAP: Record<string, EvidenceCategory[]> = {
  'GPA_THRESHOLD': ['GPA'],
  'CONFERRAL_WINDOW': ['DEGREE_CONFERRAL'],
  'VISA_CITIZENSHIP': ['CITIZENSHIP', 'WORK_AUTHORIZATION'],
  'EDUCATION_TIER': ['DEGREE_PROGRAM', 'INSTITUTION'],
  'DOMAIN_EXPERTISE': ['RESEARCH_PUBLICATION', 'RECOMMENDATION'],
};

/**
 * Extract relevant evidence from documents for a specific criterion
 */
export interface ExtractedEvidence {
  citation: EvidenceCitation;
  category: EvidenceCategory;
  relevanceToCriterion: string;
  relevance: number;  // Relevance score 0-1
  confidence: number;
  extractedAt: string;
}

/**
 * Search documents for evidence matching a criterion
 */
export function retrieveEvidenceForCriterion(
  criterion: CriteriaRubric,
  documents: IngestedDocument[],
  citations: EvidenceCitation[]
): ExtractedEvidence[] {
  const results: ExtractedEvidence[] = [];
  const now = new Date().toISOString();
  
  // Get relevant evidence categories for this criterion
  const categories = CRITERION_EVIDENCE_MAP[criterion.clauseCategory] || ['GPA', 'DEGREE_CONFERRAL'];
  
  // Find citations from documents that match these categories
  for (const citation of citations) {
    const doc = documents.find(d => d.id === citation.documentId);
    if (!doc) continue;
    
    // Check if document type can provide this evidence
    const docCategories = DOCUMENT_EVIDENCE_MAP[doc.documentType] || [];
    const isRelevantCategory = categories.some(cat => docCategories.includes(cat));
    
    if (!isRelevantCategory) continue;
    
    // Determine relevance to this specific criterion
    const relevance = determineRelevance(citation, criterion);
    if (relevance.relevance < 0.3) continue;
    
    results.push({
      citation,
      category: relevance.category,
      relevanceToCriterion: relevance.reason,
      relevance: relevance.relevance,
      confidence: citation.confidence,
      extractedAt: citation.extractedDate,
    });
  }
  
  // Sort by confidence (descending)
  results.sort((a, b) => b.confidence - a.confidence);
  
  return results;
}

/**
 * Determine how relevant a citation is to a criterion
 */
function determineRelevance(
  citation: EvidenceCitation,
  criterion: CriteriaRubric
): { relevance: number; category: EvidenceCategory; reason: string } {
  const lowerQuote = citation.verbatimQuote.toLowerCase();
  const lowerClause = criterion.clauseExcerpt.toLowerCase();
  
  // Calculate keyword overlap
  const quoteWords = new Set(lowerQuote.split(/\s+/));
  const clauseWords = new Set(lowerClause.split(/\s+/));
  const overlap = [...quoteWords].filter(w => clauseWords.has(w)).length;
  const totalUnique = new Set([...quoteWords, ...clauseWords]).size;
  const overlapScore = totalUnique > 0 ? overlap / totalUnique : 0;
  
  // Check for specific patterns
  let category: EvidenceCategory = 'GPA';
  let relevance = overlapScore;
  let reason = 'Partial keyword overlap with criterion';
  
  // GPA evidence
  if (/\b(gpa|grade\s*point|3\.\d{2}|4\.00|cumulative)\b/i.test(citation.verbatimQuote)) {
    if (criterion.clauseCategory === 'GPA_THRESHOLD') {
      category = 'GPA';
      relevance = Math.max(relevance, 0.9);
      reason = 'Direct GPA evidence from transcript';
    }
  }
  
  // Conferral date evidence
  if (/\b(conferral|degree\s*conferred|expected\s*(graduation|completion)|may\s*202\d|june\s*202\d|august\s*202\d)\b/i.test(citation.verbatimQuote)) {
    if (criterion.clauseCategory === 'CONFERRAL_WINDOW') {
      category = 'DEGREE_CONFERRAL';
      relevance = Math.max(relevance, 0.85);
      reason = 'Degree conferral date evidence';
    }
  }
  
  // Citizenship/visa evidence
  if (/\b(citizen|permanent\s*resident|f-1|f1|sevis|i-?20|visa|immigration|status)\b/i.test(citation.verbatimQuote)) {
    if (criterion.clauseCategory === 'VISA_CITIZENSHIP') {
      category = citation.verbatimQuote.match(/f-?1/i) ? 'WORK_AUTHORIZATION' : 'CITIZENSHIP';
      relevance = Math.max(relevance, 0.8);
      reason = 'Citizenship/visa status evidence';
    }
  }
  
  // Education/degree evidence
  if (/\b(degree|major|program|m.s\.|m\.sc\.|ph\.d|b\.s\.|bachelor|master|doctorate)\b/i.test(citation.verbatimQuote)) {
    if (criterion.clauseCategory === 'EDUCATION_TIER') {
      category = 'DEGREE_PROGRAM';
      relevance = Math.max(relevance, 0.8);
      reason = 'Degree program evidence';
    }
  }
  
  // Institution evidence
  if (/\b(stanford|university|institution|registrar|enrolled)\b/i.test(citation.verbatimQuote)) {
    if (criterion.clauseCategory === 'EDUCATION_TIER') {
      category = 'INSTITUTION';
      relevance = Math.max(relevance, 0.75);
      reason = 'Institution/attendance evidence';
    }
  }
  
  // Research publication evidence
  if (/\b(neurips|conference|journal|publication|paper|accepted|presented|research)\b/i.test(citation.verbatimQuote)) {
    if (criterion.clauseCategory === 'DOMAIN_EXPERTISE') {
      category = 'RESEARCH_PUBLICATION';
      relevance = Math.max(relevance, 0.7);
      reason = 'Research publication evidence';
    }
  }

  // Recommendation / letter-of-support evidence
  if (/\b(recommendation|recommend|letter\s+of\s+support|sponsor|mentor|supervis\w*)\b/i.test(citation.verbatimQuote)) {
    if (criterion.clauseCategory === 'DOMAIN_EXPERTISE') {
      category = 'RECOMMENDATION';
      relevance = Math.max(relevance, 0.6);
      reason = 'Recommendation letter evidence';
    }
  }
  
  return { relevance, category, reason };
}

/**
 * Search all documents for general evidence on a topic
 */
export function searchDocumentsForEvidence(
  query: string,
  documents: IngestedDocument[],
  citations: EvidenceCitation[]
): EvidenceReference[] {
  const results: EvidenceReference[] = [];
  const lowerQuery = query.toLowerCase();
  
  // Simple keyword matching against citations
  for (const citation of citations) {
    const doc = documents.find(d => d.id === citation.documentId);
    if (!doc) continue;
    
    // Score relevance of this citation to the query
    const quoteWords = citation.verbatimQuote.toLowerCase().split(/\s+/);
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
    
    let matchCount = 0;
    for (const qw of queryWords) {
      if (quoteWords.some(w => w.includes(qw) || qw.includes(w))) {
        matchCount++;
      }
    }
    
    const relevance = queryWords.length > 0 ? matchCount / queryWords.length : 0;
    if (relevance < 0.2) continue;
    
    results.push({
      citation,
      usedInEvaluation: false,
      context: `Found in ${doc.name} - ${relevance > 0.5 ? 'highly relevant' : 'partially relevant'} to query "${query}"`,
    });
  }
  
  // Sort by relevance
  results.sort((a, b) => {
    const aDoc = documents.find(d => d.id === a.citation.documentId);
    const bDoc = documents.find(d => d.id === b.citation.documentId);
    // Prefer documents with higher OCR confidence
    const aConfidence = aDoc?.ocrConfidence || 0;
    const bConfidence = bDoc?.ocrConfidence || 0;
    return (bConfidence - aConfidence) || // Then by document quality
           (b.citation.confidence - a.citation.confidence); // Then by citation confidence
  });
  
  return results.slice(0, 10);  // Return top 10 results
}

/**
 * Extract evidence summary from a document
 */
export function extractDocumentSummary(
  document: IngestedDocument,
  citations: EvidenceCitation[],
  maxCitations: number = 5
): {
  documentId: string;
  documentName: string;
  documentType: string;
  totalClaims: number;
  ocrConfidence: number;
  keyFindings: Array<{
    claim: string;
    citation: EvidenceCitation;
    category: EvidenceCategory;
  }>;
} {
  const documentCitations = citations
    .filter(c => c.documentId === document.id)
    .slice(0, maxCitations);
  
  const keyFindings = documentCitations.map(citation => {
    // Determine category from citation content
    let category: EvidenceCategory = 'INSTITUTION';
    const quote = citation.verbatimQuote.toLowerCase();
    
    if (/\b(gpa|grade\s*point)\b/i.test(quote)) category = 'GPA';
    else if (/\b(conferral|degree|graduated)\b/i.test(quote)) category = 'DEGREE_CONFERRAL';
    else if (/\b(f-1|f1|sevis|visa|citizen)\b/i.test(quote)) category = 'CITIZENSHIP';
    else if (/\b(neurips|conference|paper|publication)\b/i.test(quote)) category = 'RESEARCH_PUBLICATION';
    else if (/\b(recommend|letter)\b/i.test(quote)) category = 'RECOMMENDATION';
    
    return {
      claim: citation.verbatimQuote.slice(0, 200) + (citation.verbatimQuote.length > 200 ? '...' : ''),
      citation,
      category,
    };
  });
  
  return {
    documentId: document.id,
    documentName: document.name,
    documentType: document.documentType,
    totalClaims: document.extractedClaimsCount,
    ocrConfidence: document.ocrConfidence,
    keyFindings,
  };
}

/**
 * Verify that a quote exists in the source document (verbatim verification)
 */
export function verifyCitationIntegrity(
  citation: EvidenceCitation,
  normalizedSourceText: string
): {
  verified: boolean;
  verbatimMatch: boolean;
  message: string;
} {
  // Use the injected verification function for security
  const result = verifyVerbatimMatch(citation.verbatimQuote, normalizedSourceText, {
    caseSensitive: false,
    normalizeWhitespace: true,
  });
  
  return {
    verified: result.matched,
    verbatimMatch: result.matched,
    message: result.matched 
      ? `Quote verified in source document (normalized match)`
      : `Quote NOT found in source document - possible hallucination or OCR mismatch`,
  };
}

/**
 * Get all citations from a specific document
 */
export function getDocumentCitations(
  documentId: string,
  citations: EvidenceCitation[]
): EvidenceCitation[] {
  return citations.filter(c => c.documentId === documentId);
}

/**
 * Build evidence package for a response
 */
export function buildEvidencePackage(
  evidence: EvidenceReference[],
  includeFullQuotes: boolean = true
): Array<{
  documentName: string;
  page: number;
  quote?: string;
  relevance: string;
}> {
  return evidence.map(e => ({
    documentName: e.citation.documentName,
    page: e.citation.pageNumber,
    quote: includeFullQuotes ? e.citation.verbatimQuote : undefined,
    relevance: e.context || `Evidence for evaluation`,
  }));
}

/**
 * Create evidence reference from citation
 */
export function createEvidenceReference(
  citation: EvidenceCitation,
  context?: string,
  usedInEvaluation: boolean = false,
  criteriaId?: string
): EvidenceReference {
  return {
    citation,
    usedInEvaluation,
    context,
    criteriaId,
  };
}
