/**
 * Quali AI Orchestrator State Model
 * 
 * Maintains workflow state across the four coordinator responsibilities:
 * PLANNER - goal breakdown and task generation
 * RETRIEVER - evidence-based information retrieval
 * EVALUATOR - deterministic eligibility engine invocation
 * ACTION_COORDINATOR - checklists, tasks, draft responses, reminders
 */

import { 
  CandidateProfile, 
  Opportunity, 
  IngestedDocument, 
  EvidenceCitation, 
  CriteriaRubric,
  EligibilityReport,
  ApplicationTask,
  VoiceAssistantMessage,
  DecisionOutcome,
  ExtractionProvenance
} from './types';

// ==========================================
// Workflow Status States
// ==========================================

export type WorkflowStatus = 
  | 'PENDING'           // Initial state, awaiting user input
  | 'PLANNING'          // Understanding user goal and creating plan
  | 'RETRIEVING'        // Gathering evidence from documents
  | 'EVALUATING'        // Running eligibility evaluation
  | 'ACTION_COORDINATING' // Generating tasks and responses
  | 'AWAITING_APPROVAL' // Waiting for human approval of consequential action
  | 'COMPLETED'         // Workflow finished successfully
  | 'FAILED'            // Workflow failed with error
  | 'RESUMABLE';        // Interrupted, can be resumed

// ==========================================
// User Preference Model
// ==========================================

export interface UserPreferences {
  interestedDomains: string[];
  priorityDeadlines: string[];  // YYYY-MM-DD format
  maxGpaThreshold?: number;
  preferredSponsors: string[];
  citizenshipPreferences?: string[];
  workAuthorization: string;
}

// ==========================================
// Evidence Reference
// ==========================================

export interface EvidenceReference {
  citation: EvidenceCitation;
  usedInEvaluation: boolean;
  criteriaId?: string;
  context?: string;
}

// ==========================================
// Pending Action
// ==========================================

export type PendingActionType = 
  | 'GENERATE_CHECKLIST'
  | 'DRAFT_RESPONSE'
  | 'SCHEDULE_REMINDER'
  | 'REQUEST_DOCUMENT'
  | 'UPDATE_PROFILE'
  | 'SUBMIT_APPLICATION';

export interface PendingAction {
  id: string;
  type: PendingActionType;
  description: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'EXECUTING' | 'COMPLETED' | 'FAILED';
  requiresApproval: boolean;
  createdAt: string;
  completedAt?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ==========================================
// Planning Task
// ==========================================

export interface PlanningTask {
  id: string;
  description: string;
  responsibility: 'PLANNER' | 'RETRIEVER' | 'EVALUATOR' | 'ACTION_COORDINATOR';
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  dependsOn: string[];
  result?: unknown;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

// ==========================================
// Recommendation with provenance
// ==========================================

export interface OpportunityRecommendation {
  opportunityId: string;
  opportunityTitle: string;
  priorityRank: number;
  matchTier: 'HIGH_MATCH' | 'SUPPLEMENTAL_NEEDED' | 'DISQUALIFIED';
  eligibilityStatus: DecisionOutcome;
  recommendationReasons: string[];
  evidenceReferences: EvidenceReference[];
  gapAnalysis?: {
    missingCriteria: string[];
    suggestedActions: string[];
  };
  personalizationFactors: {
    domainMatch: number;
    deadlineProximity: number;  // days until deadline
    qualificationStrength: number;
    preferenceAlignment: number;
  };
  // Critical: separate relevance from eligibility
  relevanceNote: string;
  eligibilityNote: string;
}

// ==========================================
// Assistant Response with full provenance
// ==========================================

export interface AssistantResponse {
  text: string;
  voiceText?: string;  // For speech interfaces
  responseType: 'INFORMATIONAL' | 'ACTION_REQUIRED' | 'APPROVAL_REQUIRED' | 'CONFIRMATION' | 'ERROR';
  evidenceReferences: EvidenceReference[];
  pendingActions?: PendingAction[];
  workflowStatus: WorkflowStatus;
  workflowId: string;
  timestamp: string;
  // For resumability
  resumable: boolean;
  resumePoint?: string;
  // Transparency
  toolCalls?: ToolCallResult[];
}

// ==========================================
// Tool Execution Tracking
// ==========================================

export interface ToolCallResult {
  toolName: string;
  status: 'SUCCESS' | 'ERROR' | 'HALTED';
  executionTimeMs: number;
  inputHash?: string;  // For idempotency
  output?: unknown;
  error?: string;
}

// ==========================================
// Full Workflow State
// ==========================================

export interface QualiWorkflowState {
  // Core identification
  workflowId: string;
  userId: string;
  
  // State tracking
  status: WorkflowStatus;
  createdAt: string;
  updatedAt: string;
  currentStep: string;
  
  // User context
  userRequest: string;
  userPreferences: UserPreferences;
  
  // Resource references
  opportunityId?: string;
  documentVersion?: string;  // SHA-256 or version identifier
  profileVersion?: string;
  
  // Evidence management
  evidenceReferences: EvidenceReference[];
  
  // Evaluation results
  eligibilityReport?: EligibilityReport;
  criterionResults: CriteriaRubric[];
  
  // Actions requiring approval
  pendingActions: PendingAction[];
  
  // Planning
  planningTasks: PlanningTask[];
  recommendation?: OpportunityRecommendation;
  
  // Conversation transcript (for voice/text parity)
  transcript: VoiceAssistantMessage[];
  
  // Error handling
  lastError?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  
  // Resumability
  interruptPoint?: string;
  interruptData?: Record<string, unknown>;
  
  // Provenance
  completedToolCalls: ToolCallResult[];
}

// ==========================================
// Workflow Creation Request
// ==========================================

export interface CreateWorkflowRequest {
  userId: string;
  userRequest: string;
  userPreferences?: Partial<UserPreferences>;
  opportunityId?: string;
  profileVersion?: string;
  documentVersion?: string;
  resumeFrom?: string;  // Workflow ID to resume from
  transcript?: VoiceAssistantMessage[];  // Existing transcript for voice continuity
}

// ==========================================
// Step Execution Result
// ==========================================

export interface StepExecutionResult {
  success: boolean;
  stepName: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  nextStep?: string;
  artifacts?: Record<string, unknown>;
}

// ==========================================
// Approval Request
// ==========================================

export interface ApprovalRequest {
  actionId: string;
  actionType: PendingActionType;
  description: string;
  consequences: string[];
  requiresApproval: true;
  timestamp: string;
}

export interface ApprovalResponse {
  approved: boolean;
  actionId: string;
  timestamp: string;
  note?: string;
}

// ==========================================
// Orchestrator Configuration
// ==========================================

export interface OrchestratorConfig {
  // Reliability
  maxRetries: number;
  retryDelayMs: number;
  stepTimeoutMs: number;
  maxConcurrentSteps: number;
  
  // Safety
  requireApprovalFor: PendingActionType[];  // Actions requiring human approval
  
  // Personalization
  personalizeRankings: boolean;
  
  // Voice
  voiceEnabled: boolean;
  transcriptRetentionDays: number;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  stepTimeoutMs: 30000,
  maxConcurrentSteps: 1,
  requireApprovalFor: ['SUBMIT_APPLICATION', 'SCHEDULE_REMINDER'],
  personalizeRankings: true,
  voiceEnabled: true,
  transcriptRetentionDays: 90,
};
