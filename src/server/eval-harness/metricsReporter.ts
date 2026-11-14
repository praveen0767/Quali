/**
 * Machine-Readable Metrics Reporter
 * 
 * Outputs evaluation results in a structured JSON format suitable for:
 * - Automated benchmark tracking
 * - CI/CD pipeline integration
 * - Comparison across evaluation runs
 * - Human-readable reports
 */

import { EvaluationMetrics } from './runner';
import fs from 'fs';
import path from 'path';

/**
 * Format metrics for human-readable console output
 */
export function formatConsoleReport(metrics: EvaluationMetrics): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│          QUALI AI ORCHESTRATOR - EVALUATION REPORT                  │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('Dataset:          v' + metrics.datasetVersion);
  lines.push('Test cases:       ' + metrics.completedTestCases + '/' + metrics.totalTestCases + ' completed');
  lines.push('');
  
  // Criterion-level metrics
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    CRITERION-LEVEL METRICS                          │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('  Precision:  ' + metrics.criterionPrecision.toFixed(3) + '  (' + metrics.correctCriteria + '/' + metrics.totalCriteriaEvaluated + ' correct)');
  lines.push('  Recall:     ' + metrics.criterionRecall.toFixed(3));
  lines.push('  F1 Score:   ' + metrics.criterionF1.toFixed(3));
  lines.push('');
  lines.push('  False MEETS (FP):          ' + metrics.falsePositives);
  lines.push('  False DOES_NOT_MEET (FN):  ' + metrics.falseNegatives);
  lines.push('  Abstentions (IE):          ' + metrics.abstentions);
  lines.push('');
  
  // Verdict metrics
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    VERDICT ACCURACY METRICS                         │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('  False MEETS rate:          ' + metrics.falseMeetsRate.toFixed(3) + ' (' + (metrics.falseMeetsRate * 100).toFixed(1) + '%)');
  lines.push('  False DOES_NOT_MEET rate:  ' + metrics.falseDoesNotMeetRate.toFixed(3) + ' (' + (metrics.falseDoesNotMeetRate * 100).toFixed(1) + '%)');
  lines.push('  INSUFFICIENT_EVIDENCE rate: ' + metrics.insufficientEvidenceRate.toFixed(3) + ' (' + (metrics.insufficientEvidenceRate * 100).toFixed(1) + '%)');
  lines.push('');
  
  // Source verification
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    SOURCE VERIFICATION METRICS                      │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('  Quotation validity:  ' + metrics.sourceQuotationValidity.toFixed(3) + '  (' + metrics.validCitations + '/' + metrics.totalCitationsChecked + ' valid)');
  lines.push('  Page correctness:    ' + metrics.pageReferenceCorrectness.toFixed(3));
  lines.push('');
  
  // Recommendation
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    RECOMMENDATION METRICS                           │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('  Recommendation relevance: ' + metrics.recommendationRelevance.toFixed(3));
  lines.push('');
  
  // Performance
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    PERFORMANCE METRICS                              │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('  Average latency:  ' + metrics.averageLatencyMs.toFixed(0) + 'ms');
  lines.push('  P95 latency:      ' + metrics.p95LatencyMs.toFixed(0) + 'ms');
  lines.push('  Max latency:      ' + metrics.maxLatencyMs.toFixed(0) + 'ms');
  lines.push('  Failure rate:     ' + metrics.failureRate.toFixed(3) + '  (' + metrics.failedTestCases + ' failures)');
  lines.push('  Completion rate:  ' + metrics.endToEndCompletionRate.toFixed(3));
  lines.push('');
  
  // CRITICAL: Coverage
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│              COVERAGE vs ACCURACY (CRITICAL)                        │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('  Criteria coverage (definitive answers): ' + metrics.criteriaCoverage.toFixed(3) + '  (' + (metrics.criteriaCoverage * 100).toFixed(1) + '%)');
  lines.push('  Test case coverage (completed):         ' + metrics.testCaseCoverage.toFixed(3) + '  (' + (metrics.testCaseCoverage * 100).toFixed(1) + '%)');
  lines.push('');
  lines.push('  ⚠️  HIGH ABSTENTION IS NOT AUTOMATICALLY GOOD.');
  lines.push('     A system that refuses difficult cases appears reliable');
  lines.push('     only if coverage is reported alongside accuracy.');
  lines.push('');
  
  // Failure examples
  if (metrics.failureExamples.length > 0) {
    lines.push('┌─────────────────────────────────────────────────────────────────────┐');
    lines.push('│                    FAILURE EXAMPLES                                 │');
    lines.push('└─────────────────────────────────────────────────────────────────────┘');
    lines.push('');
    for (const example of metrics.failureExamples) {
      lines.push('  [' + example.type + '] ' + example.testCaseId + ':');
      lines.push('    ' + example.description);
      lines.push('    Expected: ' + example.expected);
      lines.push('    Actual:   ' + example.actual);
      lines.push('');
    }
  }
  
  // Limitations
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    EVALUATION LIMITATIONS                           │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  for (const limitation of metrics.limitations) {
    lines.push('  • ' + limitation);
  }
  lines.push('');
  lines.push('='.repeat(70));
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format metrics as machine-readable JSON
 */
export function formatJsonReport(metrics: EvaluationMetrics): string {
  return JSON.stringify({
    metadata: {
      datasetVersion: metrics.datasetVersion,
      evaluatedAt: new Date().toISOString(),
      tool: 'Quali Evaluation Harness v1.0',
    },
    summary: {
      totalTestCases: metrics.totalTestCases,
      completedTestCases: metrics.completedTestCases,
      failedTestCases: metrics.failedTestCases,
    },
    criterionMetrics: {
      precision: metrics.criterionPrecision,
      recall: metrics.criterionRecall,
      f1: metrics.criterionF1,
      totalEvaluated: metrics.totalCriteriaEvaluated,
      correct: metrics.correctCriteria,
      falsePositives: metrics.falsePositives,
      falseNegatives: metrics.falseNegatives,
      abstentions: metrics.abstentions,
    },
    verdictMetrics: {
      falseMeetsRate: metrics.falseMeetsRate,
      falseDoesNotMeetRate: metrics.falseDoesNotMeetRate,
      insufficientEvidenceRate: metrics.insufficientEvidenceRate,
    },
    sourceMetrics: {
      quotationValidity: metrics.sourceQuotationValidity,
      pageCorrectness: metrics.pageReferenceCorrectness,
      totalChecked: metrics.totalCitationsChecked,
      valid: metrics.validCitations,
    },
    recommendationMetrics: {
      relevance: metrics.recommendationRelevance,
    },
    performanceMetrics: {
      avgLatencyMs: metrics.averageLatencyMs,
      p95LatencyMs: metrics.p95LatencyMs,
      maxLatencyMs: metrics.maxLatencyMs,
      failureRate: metrics.failureRate,
      completionRate: metrics.endToEndCompletionRate,
    },
    coverageMetrics: {
      criteriaCoverage: metrics.criteriaCoverage,
      testCaseCoverage: metrics.testCaseCoverage,
      warning: metrics.criteriaCoverage < 0.8 ? 'LOW COVERAGE: System may be abstaining too much' : 'Coverage acceptable',
    },
    failureExamples: metrics.failureExamples,
    limitations: metrics.limitations,
    testCaseResults: metrics.testCaseResults.map(r => ({
      id: r.testCaseId,
      category: r.category,
      completed: r.completed,
      latencyMs: r.latencyMs,
      criteriaCorrect: r.criteriaMetrics.filter(c => c.correct).length,
      totalCriteria: r.criteriaMetrics.length,
      abstentionRate: r.abstentionRate,
      recommendationCorrect: r.recommendationCorrect,
      overallStatusCorrect: r.overallStatusCorrect,
      error: r.error,
    })),
  }, null, 2);
}

/**
 * Write report to file
 */
export function writeReport(
  metrics: EvaluationMetrics,
  outputDir: string,
  format: 'json' | 'console' | 'both' = 'both'
): { jsonPath?: string; consolePath?: string } {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = 'quali-evaluation-' + timestamp;
  
  const result: { jsonPath?: string; consolePath?: string } = {};
  
  if (format === 'json' || format === 'both') {
    const jsonPath = path.join(outputDir, baseName + '.json');
    fs.writeFileSync(jsonPath, formatJsonReport(metrics), 'utf-8');
    result.jsonPath = jsonPath;
  }
  
  if (format === 'console' || format === 'both') {
    const consolePath = path.join(outputDir, baseName + '.txt');
    fs.writeFileSync(consolePath, formatConsoleReport(metrics), 'utf-8');
    result.consolePath = consolePath;
  }
  
  return result;
}

/**
 * Generate a comparison report between Quali and baseline
 */
export function formatComparisonReport(
  quali: EvaluationMetrics,
  baseline: EvaluationMetrics,
  comparison: {
    precisionDelta: number;
    recallDelta: number;
    f1Delta: number;
    falsePositiveDelta: number;
    abstentionDelta: number;
    coveragePreserved: boolean;
  }
): string {
  const lines: string[] = [];
  
  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│              QUALI vs BASELINE LLM COMPARISON                       │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('  Note: Baseline is a SIMULATION of LLM behavior, not actual API calls.');
  lines.push('        Baseline assumptions: always answers, 90% precision on clear cases,');
  lines.push('        cannot distinguish INSUFFICIENT_EVIDENCE from DOES_NOT_MEET.');
  lines.push('');
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    METRIC COMPARISON                                │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  lines.push('  Metric                  | Quali      | Baseline  | Delta      |');
  lines.push('  ------------------------|------------|-----------|------------|');
  lines.push('  Precision               | ' + quali.criterionPrecision.toFixed(3) + '     | ' + baseline.criterionPrecision.toFixed(3) + '      | ' + (comparison.precisionDelta >= 0 ? '+' : '') + comparison.precisionDelta.toFixed(3) + '     |');
  lines.push('  Recall                  | ' + quali.criterionRecall.toFixed(3) + '     | ' + baseline.criterionRecall.toFixed(3) + '      | ' + (comparison.recallDelta >= 0 ? '+' : '') + comparison.recallDelta.toFixed(3) + '     |');
  lines.push('  F1 Score                | ' + quali.criterionF1.toFixed(3) + '     | ' + baseline.criterionF1.toFixed(3) + '      | ' + (comparison.f1Delta >= 0 ? '+' : '') + comparison.f1Delta.toFixed(3) + '     |');
  lines.push('  False Positives         | ' + quali.falsePositives + '         | ' + baseline.falsePositives + '         | ' + (comparison.falsePositiveDelta >= 0 ? '+' : '') + comparison.falsePositiveDelta + '        |');
  lines.push('  Abstentions             | ' + quali.abstentions + '         | ' + baseline.abstentions + '         | ' + (comparison.abstentionDelta >= 0 ? '+' : '') + comparison.abstentionDelta + '        |');
  lines.push('  Criteria Coverage       | ' + (quali.criteriaCoverage * 100).toFixed(1) + '%     | ' + (baseline.criteriaCoverage * 100).toFixed(1) + '%      | ' + (quali.criteriaCoverage - baseline.criteriaCoverage >= 0 ? '+' : '') + ((quali.criteriaCoverage - baseline.criteriaCoverage) * 100).toFixed(1) + 'pp     |');
  lines.push('');
  
  lines.push('┌─────────────────────────────────────────────────────────────────────┐');
  lines.push('│                    INTERPRETATION                                   │');
  lines.push('└─────────────────────────────────────────────────────────────────────┘');
  lines.push('');
  
  if (comparison.precisionDelta > 0) {
    lines.push('  ✓ Quali has HIGHER precision than baseline (+' + comparison.precisionDelta.toFixed(3) + ').');
    lines.push('    Quali makes fewer false claims.');
  } else {
    lines.push('  ✗ Baseline has higher precision (' + comparison.precisionDelta.toFixed(3) + ' worse).');
  }
  lines.push('');
  
  if (comparison.recallDelta > 0) {
    lines.push('  ✓ Quali has HIGHER recall than baseline (+' + comparison.recallDelta.toFixed(3) + ').');
  } else {
    lines.push('  Note: Baseline has higher recall (' + comparison.recallDelta.toFixed(3) + ' worse for Quali).');
    lines.push('        This is expected: baseline always answers, Quali may abstain.');
  }
  lines.push('');
  
  lines.push('  Quali abstentions: ' + quali.abstentions + ' (' + (quali.insufficientEvidenceRate * 100).toFixed(1) + '%)');
  lines.push('  Baseline abstentions: ' + baseline.abstentions + ' (0%)');
  lines.push('');
  
  if (comparison.coveragePreserved) {
    lines.push('  ✓ Quali maintains reasonable coverage (≥80%) while improving precision.');
    lines.push('    The abstention rate is justified by the difficulty of the cases.');
  } else {
    lines.push('  ⚠ Quali coverage is below 80%. High abstention rate may indicate');
    lines.push('      the system is refusing too many cases. Review failure examples.');
  }
  lines.push('');
  lines.push('='.repeat(70));
  lines.push('');
  
  return lines.join('\n');
}

export default {
  formatConsoleReport,
  formatJsonReport,
  writeReport,
  formatComparisonReport,
};