/**
 * Quali AI Orchestrator
 * 
 * Coordinates the four responsibilities:
 * 1. PLANNER - Understand user goal, break into tasks
 * 2. RETRIEVER - Find evidence from documents
 * 3. EVALUATOR - Run deterministic eligibility engine
 * 4. ACTION_COORDINATOR - Generate checklists, tasks, responses
 * 
 * Key principles:
 * - Idempotent operations
 * - Bounded retries and tool execution
 * - Human approval for consequential actions
 * - Evidence preservation in every response
 * - Planning separated from execution
 * - No hallucinated tools or completed actions
 * - Voice/text interface parity
 */

import crypto from 'crypto';
import { createServer } from 'http';
import express from 'express';
import { db } from '../store';
import {
  CandidateProfile,
  Opportunity,
  IngestedDocument,
  EvidenceCitation,
  CriteriaRubric,
  VoiceAssistantMessage,
  ApplicantQualification,
} from '../../lib/api/types';
import {
  QualiWorkflowState,
  WorkflowStatus,
  CreateWorkflowRequest,
  OrchestratorConfig,
  DEFAULT_ORCHESTRATOR_CONFIG,
  AssistantResponse,
  ToolCallResult,
  StepExecutionResult,
  ApprovalRequest,
  ApprovalResponse,
  PlanningTask,
  OpportunityRecommendation,
  PendingActionType,
  UserPreferences,
} from '../../lib/api/orchestratorTypes';
import * as Planner from './planner';
import * as Retriever from './retriever';
import * as Evaluator from './evaluator';
import * as ActionCoordinator from './actionCoordinator';
import type { GeneratedChecklist } from './actionCoordinator';

// Store for active workflows (in production, use database)
const workflowStore: Map<string, QualiWorkflowState> = new Map();

// Orchestrator instance
let config: OrchestratorConfig = { ...DEFAULT_ORCHESTRATOR_CONFIG };

/**
 * Initialize orchestrator with custom config
 */
export function initializeOrchestrator(customConfig?: Partial<OrchestratorConfig>): void {
  config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...customConfig };
}

/**
 * Create a new workflow
 */
export function createWorkflow(request: CreateWorkflowRequest): QualiWorkflowState {
  // Check for resume
  if (request.resumeFrom) {
    const existing = workflowStore.get(request.resumeFrom);
    if (existing) {
      return resumeWorkflow(existing, request);
    }
  }
  
  // Create new workflow
  const state = Planner.createInitialWorkflowState(request);
  
  // Run planner to generate initial tasks and recommendations
  const opportunities = db.get().opportunities;
  const profile = db.get().profile;
  const documents = db.get().ingestedDocuments;
  
  const preferences: UserPreferences = {
    interestedDomains: request.userPreferences?.interestedDomains || profile.domainTags.map(t => t.name),
    priorityDeadlines: request.userPreferences?.priorityDeadlines || [],
    workAuthorization: profile.workAuthorization,
    preferredSponsors: request.userPreferences?.preferredSponsors || [],
  };
  
  const plannerResult = Planner.executePlanner(
    request,
    opportunities,
    profile,
    preferences,
    documents
  );
  
  // Update state with planner results
  state.planningTasks = plannerResult.tasks;
  
  // Set primary recommendation.
  // An explicitly requested opportunity always wins; otherwise use the planner's
  // top recommendation or fall back to an opportunity mentioned in the request.
  const requestedOpp = request.opportunityId
    ? opportunities.find(o => o.id === request.opportunityId)
    : undefined;

  if (requestedOpp) {
    const plannerRec = plannerResult.recommendations.find(
      r => r.opportunityId === requestedOpp.id
    );
    // When the user names the opportunity there is no ranking decision to make,
    // so use the opportunity's own match tier rather than a cross-opportunity score.
    const requestedTier = requestedOpp.matchScore >= 70
      ? 'HIGH_MATCH' as const
      : requestedOpp.matchScore >= 40
        ? 'SUPPLEMENTAL_NEEDED' as const
        : 'DISQUALIFIED' as const;
    state.recommendation = plannerRec ? { ...plannerRec, matchTier: requestedTier } : {
      opportunityId: requestedOpp.id,
      opportunityTitle: requestedOpp.title,
      priorityRank: 1,
      matchTier: requestedTier,
      eligibilityStatus: 'INSUFFICIENT_EVIDENCE',
      recommendationReasons: ['Explicitly requested by user'],
      evidenceReferences: [],
      personalizationFactors: {
        domainMatch: 0,
        deadlineProximity: 0,
        qualificationStrength: 0,
        preferenceAlignment: 0,
      },
      relevanceNote: 'Scoped to the opportunity requested by the user; not yet evaluated.',
      eligibilityNote: 'Eligibility has NOT been determined yet. Run the Evaluator to get criterion-level eligibility results.',
    };
  } else if (plannerResult.recommendations.length > 0) {
    state.recommendation = plannerResult.recommendations[0];
  } else if (plannerResult.intent.mentionedOpportunities.length > 0) {
    // Create a minimal recommendation for the mentioned opportunity
    const mentionedOppId = plannerResult.intent.mentionedOpportunities[0];
    const mentionedOpp = opportunities.find(o => o.id === mentionedOppId);
    if (mentionedOpp) {
      state.recommendation = {
        opportunityId: mentionedOpp.id,
        opportunityTitle: mentionedOpp.title,
        priorityRank: 1,
        matchTier: mentionedOpp.matchScore >= 70
          ? 'HIGH_MATCH'
          : mentionedOpp.matchScore >= 40
            ? 'SUPPLEMENTAL_NEEDED'
            : 'DISQUALIFIED',
        eligibilityStatus: 'INSUFFICIENT_EVIDENCE',
        recommendationReasons: ['Mentioned by user in request'],
        evidenceReferences: [],
        personalizationFactors: {
          domainMatch: 0,
          deadlineProximity: 0,
          qualificationStrength: 0,
          preferenceAlignment: 0,
        },
        relevanceNote: 'Recommendation based on user mention, not yet scored.',
        eligibilityNote: 'Eligibility has NOT been determined yet. Run the Evaluator to get criterion-level eligibility results.',
      };
    }
  }
  
  state.status = 'RETRIEVING';
  state.currentStep = 'RETRIEVER';
  state.updatedAt = new Date().toISOString();
  
  // Store and return
  workflowStore.set(state.workflowId, state);
  
  return state;
}

/**
 * Resume workflow from interrupt
 */
function resumeWorkflow(
  state: QualiWorkflowState,
  request: CreateWorkflowRequest
): QualiWorkflowState {
  // Preserve transcript if provided
  if (request.transcript && request.transcript.length > 0) {
    state.transcript = [...state.transcript, ...request.transcript];
  }
  
  // Update user request if new
  if (request.userRequest) {
    state.userRequest = request.userRequest;
  }
  
  // Resume from interrupt point
  state.status = 'PLANNING';
  state.currentStep = state.interruptPoint || 'PLANNER';
  state.updatedAt = new Date().toISOString();
  state.lastError = undefined;
  
  workflowStore.set(state.workflowId, state);
  
  return state;
}

/**
 * Execute a single step in the workflow
 */
export function executeStep(
  workflowId: string,
  stepName: string
): StepExecutionResult {
  const state = workflowStore.get(workflowId);
  if (!state) {
    return {
      success: false,
      stepName,
      error: {
        code: 'WORKFLOW_NOT_FOUND',
        message: `Workflow ${workflowId} not found`,
        recoverable: false,
      },
    };
  }
  
  const startTime = Date.now();
  const toolCall: ToolCallResult = {
    toolName: stepName,
    status: 'SUCCESS',
    executionTimeMs: 0,
  };
  
  try {
    switch (stepName) {
      case 'PLANNER': {
        // Already executed in createWorkflow, just verify
        if (state.planningTasks.length === 0) {
          throw new Error('No planning tasks generated');
        }
        toolCall.status = 'SUCCESS';
        toolCall.output = { tasksGenerated: state.planningTasks.length };
        break;
      }
      
      case 'RETRIEVER': {
        // Retrieve evidence from documents
        const documents = db.get().ingestedDocuments;

        // If we have a recommendation, retrieve evidence for it
        if (state.recommendation) {
          const opp = db.get().opportunities.find(o => o.id === state.recommendation?.opportunityId);
          if (opp) {
            // Get criteria for this opportunity
            const criteria = db.get().criteriaRubrics.filter(c => c.opportunityId === opp.id);

            // Retrieve evidence for each criterion, starting from the criterion's
            // extracted evidence citation where one exists.
            for (const criterion of criteria) {
              if (!criterion.evidenceCitation) continue;
              const evidence = Retriever.retrieveEvidenceForCriterion(
                criterion,
                documents,
                [criterion.evidenceCitation]
              );
              for (const ev of evidence) {
                const alreadyPresent = state.evidenceReferences.some(
                  (ref) =>
                    ref.citation.id === ev.citation.id &&
                    ref.criteriaId === criterion.id
                );
                if (alreadyPresent) continue;
                state.evidenceReferences.push(Retriever.createEvidenceReference(
                  ev.citation,
                  ev.relevanceToCriterion,
                  false,
                  criterion.id
                ));
              }
            }
          }
        }

        state.status = 'EVALUATING';
        state.currentStep = 'EVALUATOR';

        toolCall.status = 'SUCCESS';
        toolCall.output = {
          evidenceReferences: state.evidenceReferences.length,
        };
        break;
      }
      
      case 'EVALUATOR': {
        // Run deterministic eligibility evaluation
        const opp = db.get().opportunities.find(o => o.id === state.recommendation?.opportunityId);
        if (!opp) {
          throw new Error(`Opportunity ${state.recommendation?.opportunityId} not found`);
        }
        
        const profile = db.get().profile;
        const documents = db.get().ingestedDocuments;
        const criteriaRubrics = db.get().criteriaRubrics.filter(c => c.opportunityId === opp.id);
        const citations: EvidenceCitation[] = [];
        
        const evalResult = Evaluator.runEligibilityEvaluation(
          opp,
          profile,
          documents,
          criteriaRubrics,
          citations,
          {
            caseId: state.workflowId,
          }
        );
        
        // Update state with evaluation results
        state.eligibilityReport = evalResult.report;
        state.criterionResults = evalResult.criteria;

        // Finalize the recommendation with the deterministic eligibility verdict.
        // Relevance ranking and eligibility are separate concerns; this records the
        // evaluated outcome without re-ranking the opportunity.
        if (state.recommendation) {
          const overallStatus = evalResult.report.overallStatus;
          // Eligibility status is the verdict; matchTier stays a relevance ranking.
          state.recommendation.eligibilityStatus =
            overallStatus === 'VERIFIED_ELIGIBLE'
              ? 'MEETS'
              : overallStatus === 'DISQUALIFIED'
                ? 'DOES_NOT_MEET'
                : 'INSUFFICIENT_EVIDENCE';
          state.recommendation.eligibilityNote =
            `Deterministic verdict: ${overallStatus} ` +
            `(${evalResult.report.hardGatesPassed}/${evalResult.report.totalHardGates} hard gates passed).`;
        }

        state.status = 'ACTION_COORDINATING';
        state.currentStep = 'ACTION_COORDINATOR';
        
        toolCall.status = 'SUCCESS';
        toolCall.output = {
          reportId: evalResult.report.id,
          overallStatus: evalResult.report.overallStatus,
          hardGatesPassed: evalResult.report.hardGatesPassed,
          totalHardGates: evalResult.report.totalHardGates,
        };
        break;
      }
      
      case 'ACTION_COORDINATOR': {
        // Generate checklist and tasks
        const opp = db.get().opportunities.find(o => o.id === state.recommendation?.opportunityId);
        if (!opp) {
          throw new Error(`Opportunity not found`);
        }
        
        const eligibility = {
          criteria: state.criterionResults,
          meetsCriteria: state.criterionResults.filter(c => c.status === 'MEETS'),
          failedCriteria: state.criterionResults.filter(c => c.status === 'DOES_NOT_MEET'),
          insufficientCriteria: state.criterionResults.filter(c => c.status === 'INSUFFICIENT_EVIDENCE'),
          report: state.eligibilityReport!,
        };
        
        const checklist = ActionCoordinator.generateChecklist(
          opp,
          eligibility,
          {
            fullName: db.get().profile.fullName,
            email: db.get().profile.email,
            educationTier: db.get().profile.educationTier,
          },
          state.recommendation
        );
        
        // Save tasks to database
        for (const task of checklist.tasks) {
          db.update(s => {
            s.tasks.push(task);
          });
        }
        
        // Add pending actions
        for (const action of checklist.actionItems) {
          state.pendingActions.push(action);
        }
        
        // Build assistant response
        const response = buildAssistantResponse(
          state,
          checklist,
          'Action plan generated. Review pending actions for approval.'
        );
        
        state.status = 'COMPLETED';
        state.currentStep = 'COMPLETED';
        state.updatedAt = new Date().toISOString();
        
        toolCall.status = 'SUCCESS';
        toolCall.output = {
          tasksGenerated: checklist.tasks.length,
          pendingActions: checklist.actionItems.length,
          draftResponse: checklist.draftResponse,
        };
        break;
      }
      
      default:
        throw new Error(`Unknown step: ${stepName}`);
    }
    
    state.completedToolCalls.push(toolCall);
    state.updatedAt = new Date().toISOString();
    workflowStore.set(workflowId, state);
    
    return {
      success: true,
      stepName,
      result: toolCall.output,
      nextStep: getNextStep(state),
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    state.lastError = {
      code: 'STEP_EXECUTION_FAILED',
      message: errorMessage,
      recoverable: true,
    };
    state.updatedAt = new Date().toISOString();
    workflowStore.set(workflowId, state);
    
    toolCall.status = 'ERROR';
    toolCall.error = errorMessage;
    state.completedToolCalls.push(toolCall);
    
    return {
      success: false,
      stepName,
      error: {
        code: 'STEP_EXECUTION_FAILED',
        message: errorMessage,
        recoverable: true,
      },
    };
  }
}

/**
 * Execute full workflow sequentially
 */
export function executeFullWorkflow(workflowId: string): QualiWorkflowState {
  const state = workflowStore.get(workflowId);
  if (!state) {
    throw new Error(`Workflow ${workflowId} not found`);
  }
  
  const steps = ['PLANNER', 'RETRIEVER', 'EVALUATOR', 'ACTION_COORDINATOR'];
  
  for (const step of steps) {
    // Skip steps already executed successfully in this workflow
    const alreadyExecuted = state.completedToolCalls.some(
      (call) => call.toolName === step && call.status === 'SUCCESS'
    );
    if (alreadyExecuted) {
      continue;
    }
    
    const result = executeStep(workflowId, step);
    if (!result.success) {
      // Check if recoverable
      if (!result.error?.recoverable) {
        state.status = 'FAILED';
        state.currentStep = step;
        state.updatedAt = new Date().toISOString();
        workflowStore.set(workflowId, state);
        return state;
      }
      // Continue to next step on recoverable error
    }
    
    // Check if workflow is completed
    if (state.status === 'COMPLETED' || state.status === 'FAILED') {
      break;
    }
  }
  
  return workflowStore.get(workflowId)!;
}

/**
 * Get next step in workflow
 */
function getNextStep(state: QualiWorkflowState): string | undefined {
  const stepOrder = ['PLANNER', 'RETRIEVING', 'EVALUATING', 'ACTION_COORDINATING', 'COMPLETED'];
  const currentIndex = stepOrder.indexOf(state.currentStep);
  
  if (currentIndex >= 0 && currentIndex < stepOrder.length - 1) {
    return stepOrder[currentIndex + 1];
  }
  
  return undefined;
}

/**
 * Build assistant response with full provenance
 */
export function buildAssistantResponse(
  state: QualiWorkflowState,
  checklist: GeneratedChecklist,
  message: string
): AssistantResponse {
  // Build text response
  const text = `
## ${message}

### Recommendation
${state.recommendation ? `
**Top Match:** ${state.recommendation.opportunityTitle}
**Relevance Score:** ${state.recommendation.matchTier} (${state.recommendation.priorityRank} of ${state.planningTasks.filter(t => t.responsibility === 'PLANNER').length})
**Reason:** ${state.recommendation.recommendationReasons.slice(0, 3).join('; ')}
` : 'No recommendation available.'}

### Eligibility Summary
${state.eligibilityReport ? `
**Overall Status:** ${state.eligibilityReport.overallStatus}
**Hard Gates:** ${state.eligibilityReport.hardGatesPassed}/${state.eligibilityReport.totalHardGates} passed
` : 'Not yet evaluated.'}

### Action Items
${checklist.tasks.length} tasks generated. ${checklist.actionItems.length} require your approval.

### Evidence Sources
${state.evidenceReferences.length > 0 
  ? state.evidenceReferences.map(r => `- ${r.citation.documentName} (p.${r.citation.pageNumber})`).join('\n')
  : 'No evidence citations available yet.'}
`.trim();
  
  // Build voice text
  const voiceText = `
${message}. Your top recommendation is ${state.recommendation?.opportunityTitle || 'not available'}. 
${state.eligibilityReport ? `Eligibility status: ${state.eligibilityReport.overallStatus}. ` : ''}
${checklist.tasks.length} tasks have been generated. ${checklist.actionItems.length} action items require your approval.
Sources: ${state.evidenceReferences.map(r => r.citation.documentName).join(', ') || 'None'}.
`.trim();
  
  return {
    text,
    voiceText,
    responseType: checklist.actionItems.some(a => a.requiresApproval) ? 'APPROVAL_REQUIRED' : 'INFORMATIONAL',
    evidenceReferences: checklist.evidenceReferences,
    pendingActions: checklist.actionItems,
    workflowStatus: state.status,
    workflowId: state.workflowId,
    timestamp: new Date().toISOString(),
    resumable: state.status === 'COMPLETED' || state.status === 'FAILED',
    resumePoint: state.status === 'FAILED' ? state.currentStep : undefined,
    toolCalls: state.completedToolCalls,
  };
}

/**
 * Submit for approval
 */
export function submitForApproval(
  workflowId: string,
  actionType: PendingActionType
): ApprovalRequest | null {
  const state = workflowStore.get(workflowId);
  if (!state) return null;
  
  const action = state.pendingActions.find(a => a.type === actionType && a.status === 'PENDING_APPROVAL');
  if (!action) return null;
  
  return {
    actionId: action.id,
    actionType,
    description: action.description,
    consequences: getConsequences(actionType, state),
    requiresApproval: true,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get consequences of an action for approval request
 */
function getConsequences(actionType: PendingActionType, state: QualiWorkflowState): string[] {
  switch (actionType) {
    case 'SUBMIT_APPLICATION':
      return [
        'This will submit your application for the opportunity.',
        'You cannot undo this action once submitted.',
        'Ensure all documents are uploaded and complete.',
      ];
    case 'SCHEDULE_REMINDER':
      return [
        'A reminder will be scheduled for the specified date.',
        'You will receive notification before the deadline.',
      ];
    case 'GENERATE_CHECKLIST':
      return [
        'Tasks will be created and saved to your task list.',
        'You can modify or delete tasks later.',
      ];
    case 'DRAFT_RESPONSE':
      return [
        'A draft response will be prepared for your review.',
        'The draft will not be sent until you approve.',
      ];
    default:
      return ['This action will be executed as requested.'];
  }
}

/**
 * Approve or reject a pending action
 */
export function handleApproval(
  workflowId: string,
  actionId: string,
  approved: boolean,
  note?: string
): ApprovalResponse {
  const state = workflowStore.get(workflowId);
  if (!state) {
    throw new Error(`Workflow ${workflowId} not found`);
  }
  
  const actionIndex = state.pendingActions.findIndex(a => a.id === actionId);
  if (actionIndex === -1) {
    throw new Error(`Action ${actionId} not found`);
  }
  
  const action = state.pendingActions[actionIndex];
  
  if (approved) {
    // Execute the action
    const result = ActionCoordinator.executePendingAction(action, {
      opportunity: db.get().opportunities.find(o => o.id === state.recommendation?.opportunityId),
      tasks: db.get().tasks,
      draftResponse: undefined,
    });
    
    // Update action status
    state.pendingActions[actionIndex] = {
      ...action,
      status: result.status === 'SUCCESS' ? 'COMPLETED' : 'FAILED',
      completedAt: new Date().toISOString(),
      error: result.error,
    };
    
    // If application submitted, log audit
    if (action.type === 'SUBMIT_APPLICATION' && result.status === 'SUCCESS') {
      db.logAudit('APPLICATION_SUBMITTED', 'USER', {
        workflowId,
        opportunityId: action.metadata?.opportunityId,
        actionId,
      }, crypto.randomBytes(8).toString('hex'));
    }
  } else {
    // Reject the action
    state.pendingActions[actionIndex] = {
      ...action,
      status: 'REJECTED',
      completedAt: new Date().toISOString(),
    };
  }
  
  state.updatedAt = new Date().toISOString();
  workflowStore.set(workflowId, state);
  
  return {
    approved,
    actionId,
    timestamp: new Date().toISOString(),
    note,
  };
}

/**
 * Get workflow status
 */
export function getWorkflowStatus(workflowId: string): QualiWorkflowState | null {
  return workflowStore.get(workflowId) || null;
}

/**
 * Get all active workflows for a user
 */
export function getUserWorkflows(userId: string): QualiWorkflowState[] {
  return Array.from(workflowStore.values()).filter(w => w.userId === userId);
}

/**
 * Cancel workflow
 */
export function cancelWorkflow(workflowId: string): boolean {
  const state = workflowStore.get(workflowId);
  if (!state) return false;
  
  state.status = 'FAILED';
  state.lastError = {
    code: 'WORKFLOW_CANCELLED',
    message: 'Workflow was cancelled by user',
    recoverable: false,
  };
  state.updatedAt = new Date().toISOString();
  workflowStore.set(workflowId, state);
  
  return true;
}

/**
 * Cleanup old workflows (in production, use database TTL)
 */
export function cleanupOldWorkflows(maxAgeDays: number = 30): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);
  
  let removed = 0;
  for (const [id, state] of workflowStore.entries()) {
    if (new Date(state.updatedAt) < cutoff) {
      workflowStore.delete(id);
      removed++;
    }
  }
  
  return removed;
}

/**
 * Health check - are we able to execute workflows?
 */
export function checkOrchestratorHealth(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
  }>;
} {
  const checks: Array<{ name: string; status: 'pass' | 'fail' | 'warn'; message: string }> = [];
  
  // Check 1: Can access store
  try {
    const state = db.get();
    if (state.profile && state.opportunities.length > 0) {
      checks.push({ name: 'data_store', status: 'pass', message: 'Profile and opportunities available' });
    } else {
      checks.push({ name: 'data_store', status: 'warn', message: 'Missing profile or opportunities' });
    }
  } catch (error) {
    checks.push({ name: 'data_store', status: 'fail', message: `Store access failed: ${error}` });
  }
  
  // Check 2: Workflow store capacity
  const workflowCount = workflowStore.size;
  if (workflowCount < 1000) {
    checks.push({ name: 'workflow_store', status: 'pass', message: `${workflowCount} active workflows` });
  } else {
    checks.push({ name: 'workflow_store', status: 'warn', message: `${workflowCount} workflows - consider cleanup` });
  }
  
  // Determine overall status
  const failedChecks = checks.filter(c => c.status === 'fail');
  const overallStatus = failedChecks.length > 0 ? 'unhealthy' : 
                       checks.some(c => c.status === 'warn') ? 'degraded' : 'healthy';
  
  return { status: overallStatus, checks };
}
