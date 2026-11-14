/**
 * Prompt Injection Detection for Untrusted Content
 *
 * Treats all uploaded documents and website content as untrusted data,
 * never as instructions. Detects and rejects common prompt injection patterns.
 */

import { PromptInjectionDetection, PROMPT_INJECTION_PATTERNS, VerifyVerbatimMatchFn } from '../../lib/api/types';

// Inline the verifyVerbatimMatch function since it's not exported from types
// Inline the verifyVerbatimMatch function since it's not exported from types
function verifyVerbatimMatchFn(
  quote: string,
  normalizedExtractedText: string,
  options: { caseSensitive?: boolean; normalizeWhitespace?: boolean } = {}
): { verified: boolean; matched: boolean; normalizedQuote: string; normalizedSource: string } {
  const normalizeWhitespace = options.normalizeWhitespace !== false;
  const caseSensitive = options.caseSensitive ?? true;

  let normalizedQuote = quote;
  let normalizedSource = normalizedExtractedText;

  if (normalizeWhitespace) {
    normalizedQuote = quote.replace(/\s+/g, ' ').trim();
    normalizedSource = normalizedExtractedText.replace(/\s+/g, ' ').trim();
  }

  if (!caseSensitive) {
    normalizedQuote = normalizedQuote.toLowerCase();
    normalizedSource = normalizedSource.toLowerCase();
  }

  const matched = normalizedSource.includes(normalizedQuote);

  return {
    verified: matched,
    matched,
    normalizedQuote,
    normalizedSource,
  };
}

export interface InjectionCheckOptions {
  /** Maximum allowed injection attempts before rejection */
  maxSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** Action to take when injection detected */
  action: 'REJECT' | 'ESCAPE' | 'SANITIZE';
}

const severityOrder: Record<string, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const defaultOptions: InjectionCheckOptions = {
  maxSeverity: 'HIGH',
  action: 'REJECT',
};

/**
 * Detect prompt injection patterns in untrusted content.
 * Does NOT execute any content - only pattern matching for safety.
 */
export function detectPromptInjection(
  content: string,
  options: Partial<InjectionCheckOptions> = {}
): PromptInjectionDetection {
  const opts = { ...defaultOptions, ...options };
  const patternsMatched: string[] = [];
  let maxSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      const patternStr = pattern.toString();
      patternsMatched.push(patternStr);

      // Determine severity based on pattern type
      let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
      if (patternStr.includes('system prompt') || patternStr.includes('ignore') || patternStr.includes('forget')) {
        severity = 'HIGH';
      } else if (patternStr.includes('<script') || patternStr.includes('javascript:')) {
        severity = 'CRITICAL';
      } else if (patternStr.includes('override') || patternStr.includes('new instructions')) {
        severity = 'MEDIUM';
      }

      if (severityOrder[severity] > severityOrder[maxSeverity]) {
        maxSeverity = severity;
      }
    }
  }

  return {
    detected: patternsMatched.length > 0,
    patternsMatched,
    severity: maxSeverity,
    originalLength: content.length,
    sanitizedContent: opts.action === 'SANITIZE' ? sanitizeContent(content, patternsMatched) : undefined,
  };
}

/**
 * Check if injection detection should reject content based on severity threshold
 */
export function shouldRejectInjection(detection: PromptInjectionDetection, maxSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'HIGH'): boolean {
  if (!detection.detected) return false;
  return severityOrder[detection.severity] >= severityOrder[maxSeverity];
}

/**
 * Sanitize content by escaping potential injection vectors
 * NOTE: This does NOT make content "safe to execute" - it's for display purposes only
 */
function sanitizeContent(content: string, matchedPatterns: string[]): string {
  let sanitized = content;

  // Escape HTML entities to prevent XSS when displaying
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Remove null bytes and control characters (except common whitespace)
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return sanitized;
}

/**
 * Factory function to create a safe content processor
 * that treats all input as untrusted.
 */
export function createSafeContentProcessor() {
  return {
    /**
     * Process untrusted content safely - rejects if injection detected
     */
    processUntrustedContent: (
      content: string,
      context: string,
      options: Partial<InjectionCheckOptions> = {}
    ): { safe: boolean; content: string; detection?: PromptInjectionDetection } => {
      const detection = detectPromptInjection(content, options);

      if (detection.detected) {
        if (options.action === 'REJECT' || shouldRejectInjection(detection, options.maxSeverity)) {
          return {
            safe: false,
            content: '',
            detection,
          };
        }
      }

      return {
        safe: true,
        content: detection.sanitizedContent ?? content,
        detection: detection.detected ? detection : undefined,
      };
    },

    /**
     * Verify a quotation can be found in source text
     */
    verifyQuotation: (
      quote: string,
      sourceText: string
    ): { verified: boolean; quote: string; foundInSource: boolean } => {
      const result = verifyVerbatimMatchFn(quote, sourceText);
      return {
        verified: result.verified,
        quote: result.normalizedQuote,
        foundInSource: result.matched,
      };
    },
  };
}

// Singleton processor instance
export const safeContentProcessor = createSafeContentProcessor();

// Re-export verifyVerbatimMatch for use in other modules
export { verifyVerbatimMatchFn as verifyVerbatimMatch };
