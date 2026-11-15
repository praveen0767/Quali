import crypto from 'crypto';
import { IngestedDocument, EvidenceCitation, CriteriaRubric, ExtractionProvenance, ExtractionConfidence, SchemaValidationStatus } from '../../lib/api/types';
import { verifyVerbatimMatch } from './promptInjection';
import { safeContentProcessor, detectPromptInjection } from './promptInjection';
import { PDFParse } from 'pdf-parse';

export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_PAGES_PER_DOCUMENT = 50; // Prevent oversized document processing
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/tiff',
];

export interface ProcessDocumentParams {
  filename: string;
  buffer: Buffer;
  mimeType: string;
  documentType: IngestedDocument['documentType'];
}

export interface DocumentProcessingResult {
  document: IngestedDocument;
  extractedCitations: EvidenceCitation[];
  extractedRubrics?: Partial<CriteriaRubric>[];
  extractionProvenance?: ExtractionProvenance[];
}

export function computeSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Validate document upload with enhanced security checks
 */
export function validateDocumentUpload(params: {
  filename: string;
  sizeBytes: number;
  mimeType: string;
  buffer?: Buffer;
}): { valid: boolean; error?: string; code?: string; details?: Record<string, unknown> } {
  if (!params.filename || params.sizeBytes === 0) {
    return {
      valid: false,
      error: 'Empty file payload or missing filename.',
      code: 'EMPTY_FILE',
    };
  }

  // Sanitize filename to prevent path traversal
  const sanitizedName = sanitizeFilename(params.filename);
  if (sanitizedName !== params.filename) {
    return {
      valid: false,
      error: 'Filename contains invalid characters.',
      code: 'INVALID_FILENAME',
      details: { reason: 'path_traversal_attempt' },
    };
  }

  // Check MIME type first - before size validation
  if (!ALLOWED_MIME_TYPES.includes(params.mimeType.toLowerCase())) {
    return {
      valid: false,
      error: `Unsupported file format. Allowed formats: PDF, PNG, JPEG, TIFF.`,
      code: 'INVALID_MIME_TYPE',
      details: { receivedMime: params.mimeType, allowedMimes: ALLOWED_MIME_TYPES },
    };
  }

  if (params.sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds the 25MB limit (received: ${(params.sizeBytes / (1024 * 1024)).toFixed(2)}MB).`,
      code: 'FILE_TOO_LARGE',
      details: { maxBytes: MAX_DOCUMENT_SIZE_BYTES, receivedBytes: params.sizeBytes },
    };
  }

  if (params.sizeBytes > 0 && params.sizeBytes < 1024) {
    return {
      valid: false,
      error: 'File is suspiciously small. Please verify the document is complete.',
      code: 'FILE_TOO_SMALL',
      details: { minBytes: 1024, receivedBytes: params.sizeBytes },
    };
  }

  // For PDF files, verify magic bytes
  if (params.mimeType.toLowerCase() === 'application/pdf' && params.buffer) {
    const pdfMagicBytes = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
    if (params.buffer.length < 5 || !params.buffer.slice(0, 4).equals(pdfMagicBytes)) {
      return {
        valid: false,
        error: 'File claimed to be PDF but does not have valid PDF header.',
        code: 'INVALID_PDF_HEADER',
        details: { reason: 'magic_bytes_mismatch' },
      };
    }
  }

  return { valid: true };
}

/**
 * Sanitize filename to prevent path traversal and other attacks
 */
function sanitizeFilename(filename: string): string {
  // Remove path separators and null bytes
  let sanitized = filename.replace(/[/\\\x00]/g, '_');
  // Remove leading dots to prevent hidden files
  sanitized = sanitized.replace(/^[\.]+/, '');
  // Limit length
  if (sanitized.length > 255) {
    sanitized = sanitized.slice(0, 255);
  }
  return sanitized;
}

/**
 * Check document content for prompt injection attempts
 * Treats all uploaded content as untrusted
 */
export function scanForPromptInjection(buffer: Buffer): {
  detected: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details?: string;
} {
  const content = buffer.toString('utf-8', 0, Math.min(buffer.length, 100000)); // Check first 100KB
  const detection = detectPromptInjection(content, { maxSeverity: 'MEDIUM', action: 'REJECT' });

  if (detection.detected) {
    return {
      detected: true,
      severity: detection.severity,
      details: `Potential prompt injection detected: ${detection.patternsMatched.slice(0, 3).join(', ')}`,
    };
  }

  return { detected: false, severity: 'LOW' };
}

export async function processDocument(params: ProcessDocumentParams): Promise<DocumentProcessingResult> {
  const sha256 = computeSha256(params.buffer);
  const docId = `doc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  const isPdf = params.mimeType.toLowerCase() === 'application/pdf';

  let pageTexts: Array<{ pageNumber: number; text: string }> = [];
  let pageCount = 1;
  let extractedText = '';
  let extractionStatus: IngestedDocument['extractionStatus'] = 'INSUFFICIENT_EVIDENCE';
  let ocrConfidence = 0;
  let extractedClaimsCount = 0;

  if (isPdf) {
    try {
      const parser = new PDFParse({ data: params.buffer });
      const result = await parser.getText();
      await parser.destroy();
      pageCount = result.total || result.pages.length || 1;
      pageTexts = result.pages.map((p) => ({ pageNumber: p.num, text: p.text || '' }));
      extractedText = pageTexts.map((p) => p.text).join('\n');
      const hasText = pageTexts.some((p) => (p.text || '').trim().length > 0);
      extractionStatus = hasText ? 'TEXT_EXTRACTED' : 'OCR_UNAVAILABLE';
      ocrConfidence = hasText ? 0.99 : 0;
      const claimLines = extractedText.split(/\r?\n/).filter((l) => /:/.test(l) || /gpa/i.test(l) || /degree/i.test(l));
      extractedClaimsCount = claimLines.length;
    } catch (err) {
      extractionStatus = 'OCR_UNAVAILABLE';
      pageCount = 1;
      pageTexts = [];
      extractedText = '';
      ocrConfidence = 0;
      extractedClaimsCount = 0;
    }
  } else {
    extractionStatus = 'OCR_UNAVAILABLE';
    pageCount = 1;
    ocrConfidence = 0;
    extractedClaimsCount = 0;
  }

  const extractedCitations: EvidenceCitation[] = [];

  const previewExcerpt =
    extractionStatus === 'OCR_UNAVAILABLE'
      ? `OCR_UNAVAILABLE: no extractable text found in ${params.filename}.`
      : extractedText.slice(0, 240).replace(/\s+/g, ' ').trim() || `Extracted text from ${params.filename}.`;

  const document: IngestedDocument = {
    id: docId,
    name: params.filename,
    documentType: params.documentType,
    uploadedAt: now,
    sizeBytes: params.buffer.length,
    sha256,
    enclaveEncrypted: true,
    pageCount,
    ocrConfidence,
    extractedClaimsCount,
    status: 'INDEXED',
    previewExcerpt,
    extractedText,
    pageTexts,
    extractionStatus,
  };

  return {
    document,
    extractedCitations,
  };
}
