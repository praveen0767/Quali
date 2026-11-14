#!/usr/bin/env node

/**
 * Quali Evaluation Harness - Entry Point
 * 
 * Run this to execute the full evaluation suite:
 *   npm run eval
 *   npm run eval -- --json-only
 *   npm run eval -- --baseline
 * 
 * Outputs:
 *   - Machine-readable JSON metrics
 *   - Human-readable console report
 *   - Failure case examples
 *   - Baseline vs Quali comparison (if --baseline flag set)
 */

import { runEvaluation, generateBaselineComparison } from './runner';
import { writeReport, formatComparisonReport } from './metricsReporter';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  
  const jsonOnly = args.includes('--json-only');
  const includeBaseline = args.includes('--baseline');
  const outputDir = args.find(a => a.startsWith('--output='))?.split('=')[1] || 
                   path.join(__dirname, '..', '..', 'lib', 'api', 'eval', 'dataset', 'v1', 'metrics');
  
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║     QUALI AI ORCHESTRATOR - REPRODUCIBLE EVALUATION HARNESS        ║');
  console.log('║                                                                    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Configuration:');
  console.log(`  Output directory:  ${outputDir}`);
  console.log(`  JSON only:         ${jsonOnly}`);
  console.log(`  Baseline compare:  ${includeBaseline}`);
  console.log('');
  
  try {
    // Run evaluation
    console.log('Starting evaluation...');
    console.log('');
    
    const metrics = await runEvaluation();
    
    // Write reports
    const reportPaths = writeReport(metrics, outputDir, jsonOnly ? 'json' : 'both');
    
    if (reportPaths.jsonPath) {
      console.log(`✓ JSON metrics: ${reportPaths.jsonPath}`);
    }
    if (reportPaths.consolePath) {
      console.log(`✓ Console report: ${reportPaths.consolePath}`);
    }
    
    // Baseline comparison
    if (includeBaseline) {
      console.log('');
      console.log('Generating baseline comparison...');
      
      const { quali, baseline, comparison } = generateBaselineComparison(metrics);
      
      const comparisonReport = formatComparisonReport(quali, baseline, comparison);
      console.log(comparisonReport);
      
      // Save comparison report
      const comparisonPath = path.join(outputDir, `quali-vs-baseline-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
      fs.writeFileSync(comparisonPath, comparisonReport, 'utf-8');
      console.log(`✓ Baseline comparison: ${comparisonPath}`);
      
      // Save combined JSON with baseline
      const combinedPath = path.join(outputDir, `quali-vs-baseline-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
      fs.writeFileSync(combinedPath, JSON.stringify({ quali, baseline, comparison }, null, 2), 'utf-8');
      console.log(`✓ Baseline JSON: ${combinedPath}`);
    }
    
    // Exit with appropriate code
    const hasFailures = metrics.failureExamples.length > 0;
    const hasLowCoverage = metrics.criteriaCoverage < 0.8;
    
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                         EVALUATION COMPLETE                         ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`Results: ${(metrics.criterionPrecision * 100).toFixed(1)}% precision, ${(metrics.criterionRecall * 100).toFixed(1)}% recall, ${(metrics.criterionF1 * 100).toFixed(1)}% F1`);
    console.log(`Coverage: ${(metrics.criteriaCoverage * 100).toFixed(1)}% (criteria), ${(metrics.testCaseCoverage * 100).toFixed(1)}% (test cases)`);
    console.log(`Failures: ${metrics.failureExamples.length} failure examples documented`);
    console.log('');
    
    if (hasFailures) {
      console.log('⚠️  EVALUATION FOUND FAILURES - See failure examples above');
    }
    if (hasLowCoverage) {
      console.log('⚠️  LOW COVERAGE - System may be abstaining too much');
    }
    
    // Don't exit with error just because there are failures - that's what we're measuring
    // Exit with error only if evaluation itself failed to run
    console.log('');
    console.log('✓ Evaluation completed successfully');
    console.log('');
    
  } catch (error) {
    console.error('');
    console.error('✗ EVALUATION FAILED');
    console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error('');
    process.exit(1);
  }
}

main();
