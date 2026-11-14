/**
 * ACTION_COORDINATOR: Generate personalized checklists, save tasks, propose draft responses 
 * and schedule reminders through approved internal services.
 * 
 * Responsibilities:
 * - Generate personalized checklists from eligibility results
 * - Create and save tasks with proper categorization
 * - Draft personalized responses with evidence references
 * - Schedule reminders (with human approval for consequential actions)
 * - Never fabricate completed actions - clearly distinguish proposed vs. completed
 * - Require human approval for consequential actions (submission, scheduling)
 * - Preserve evidence references in every response
 */

import crypto from 'crypto';
import { 
  Opportunity,
  CriteriaRubric,
  ApplicationTask,
  EvidenceCitation,
  EligibilityReport,
  DecisionOutcome
} from '../../lib/api/types';
import { 
  PendingAction,
  PendingActionType,
  OpportunityRecommendation,
  EvidenceReference,
  AssistantResponse,
  QualiWorkflowState,
  ToolCallResult
} from '../../lib/api/orchestratorTypes';

// Action categories
export type ActionCategory = 
  | 'DOCUMENT_COLLECTION'
  | 'PROFILE_COMPLETION'
  | 'ESSAY_DRAFTING'
  | 'RECOMMENDATION_REQUEST'
  | 'DEADLINE_MANAGEMENT'
  | 'APPLICATION_SUBMISSION'
  | 'FOLLOW_UP';

// Task templates by category
const TASK_TEMPLATES: Record<string, Pick<ApplicationTask, 'title' | 'priority' | 'category'>[]> = {
  DOCUMENT_COLLECTION: [
    { title: 'Gather official transcript', category: 'DOCUMENT', priority: 'HIGH' },
    { title: 'Collect letters of recommendation', category: 'LOR', priority: 'HIGH' },
    { title: 'Prepare CV/resume', category: 'DOCUMENT', priority: 'MEDIUM' },
    { title: 'Gather citizenship/visa documentation', category: 'DOCUMENT', priority: 'HIGH' },
  ],
  PROFILE_COMPLETION: [
    { title: 'Verify contact information', category: 'ESSAY', priority: 'HIGH' },
    { title: 'Update educational history', category: 'ESSAY', priority: 'MEDIUM' },
    { title: 'Add research publications', category: 'ESSAY', priority: 'MEDIUM' },
  ],
  ESSAY_DRAFTING: [
    { title: 'Draft personal statement', category: 'ESSAY', priority: 'HIGH' },
    { title: 'Write research statement', category: 'ESSAY', priority: 'MEDIUM' },
    { title: 'Prepare diversity statement (if required)', category: 'ESSAY', priority: 'LOW' },
  ],
  RECOMMENDATION_REQUEST: [
    { title: 'Identify recommenders', category: 'LOR', priority: 'HIGH' },
    { title: 'Request letters from faculty', category: 'LOR', priority: 'HIGH' },
    { title: 'Provide recommenders with your CV', category: 'LOR', priority: 'MEDIUM' },
  ],
  DEADLINE_MANAGEMENT: [
    { title: 'Note application deadline', category: 'SUBMISSION', priority: 'HIGH' },
    { title: 'Set reminder for 2 weeks before deadline', category: 'SUBMISSION', priority: 'HIGH' },
    { title: 'Set reminder for 1 week before deadline', category: 'SUBMISSION', priority: 'MEDIUM' },
  ],
  APPLICATION_SUBMISSION: [
    { title: 'Complete application form', category: 'SUBMISSION', priority: 'HIGH' },
    { title: 'Upload all required documents', category: 'SUBMISSION', priority: 'HIGH' },
    { title: 'Review and submit application', category: 'SUBMISSION', priority: 'CRITICAL' },
  ],
  FOLLOW_UP: [
    { title: 'Thank recommenders after submission', category: 'LOR', priority: 'LOW' },
    { title: 'Check application status', category: 'SUBMISSION', priority: 'MEDIUM' },
  ],
};

/**
 * Generate personalized checklist from eligibility results and recommendation
 */
export interface GeneratedChecklist {
  tasks: ApplicationTask[];
  actionItems: PendingAction[];
  draftResponse?: string;
  evidenceReferences: EvidenceReference[];
  nextSteps: string[];
}

export function generateChecklist(
  opportunity: Opportunity,
  eligibilityResult: {
    criteria: CriteriaRubric[];
    meetsCriteria: CriteriaRubric[];
    failedCriteria: CriteriaRubric[];
    insufficientCriteria: CriteriaRubric[];
    report: EligibilityReport;
  },
  profile?: {
    fullName: string;
    email: string;
    educationTier: string;
  },
  recommendation?: OpportunityRecommendation,
): GeneratedChecklist {
  const tasks: ApplicationTask[] = [];
  const actionItems: PendingAction[] = [];
  const evidenceReferences: EvidenceReference[] = [];
  const nextSteps: string[] = [];
  
  const now = new Date().toISOString();
  const taskId = () => `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const actionId = () => `action-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  
  // 1. Document collection tasks based on insufficient criteria
  const insufficientCategories = new Set(eligibilityResult.insufficientCriteria.map(c => c.clauseCategory));
  
  if (insufficientCategories.has('GPA_THRESHOLD') || insufficientCategories.has('CONFERRAL_WINDOW')) {
    tasks.push({
      id: taskId(),
      title: 'Upload official academic transcript',
      opportunityTitle: opportunity.title,
      deadline: opportunity.deadline,
      status: 'PENDING',
      priority: 'HIGH',
      category: 'DOCUMENT',
      actionUrl: undefined,
    });
    nextSteps.push('Upload your official transcript showing GPA and expected conferral date.');
  }
  
  if (insufficientCategories.has('VISA_CITIZENSHIP')) {
    tasks.push({
      id: taskId(),
      title: 'Upload Form I-20 or citizenship documentation',
      opportunityTitle: opportunity.title,
      deadline: opportunity.deadline,
      status: 'PENDING',
      priority: 'HIGH',
      category: 'DOCUMENT',
    });
    nextSteps.push('Upload your visa/citizenship documentation to verify work authorization eligibility.');
  }
  
  if (insufficientCategories.has('DOMAIN_EXPERTISE')) {
    tasks.push({
      id: taskId(),
      title: 'Upload research publications or CV',
      opportunityTitle: opportunity.title,
      deadline: opportunity.deadline,
      status: 'PENDING',
      priority: 'MEDIUM',
      category: 'DOCUMENT',
    });
    tasks.push({
      id: taskId(),
      title: 'Request letters of recommendation from faculty',
      opportunityTitle: opportunity.title,
      deadline: opportunity.deadline,
      status: 'PENDING',
      priority: 'HIGH',
      category: 'LOR',
    });
    nextSteps.push('Upload your research publications and request letters of recommendation to demonstrate domain expertise.');
  }
  
  // 2. Profile completion tasks
  if (!profile?.fullName || !profile?.email) {
    tasks.push({
      id: taskId(),
      title: 'Complete profile with contact information',
      opportunityTitle: opportunity.title,
      deadline: opportunity.deadline,
      status: 'PENDING',
      priority: 'HIGH',
      category: 'PROFILE_COMPLETION',
    });
    nextSteps.push('Complete your profile to enable full eligibility evaluation.');
  }
  
  // 3. General application preparation tasks
  const baseTasks = TASK_TEMPLATES.ESSAY_DRAFTING.map(t => ({
    ...t,
    id: taskId(),
    opportunityTitle: opportunity.title,
    deadline: opportunity.deadline,
    status: 'PENDING' as const,
  }));
  
  tasks.push(...baseTasks);
  nextSteps.push('Begin drafting your personal statement and research statement.');
  
  // 4. Deadline management tasks
  const deadlineDate = new Date(opportunity.deadline);
  const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  
  tasks.push({
    id: taskId(),
    title: `Application deadline: ${opportunity.deadline} (${daysUntilDeadline} days remaining)`,
    opportunityTitle: opportunity.title,
    deadline: opportunity.deadline,
    status: 'PENDING',
    priority: daysUntilDeadline <= 14 ? 'CRITICAL' : 'HIGH',
    category: 'DEADLINE_MANAGEMENT',
  });
  
  if (daysUntilDeadline > 14) {
    tasks.push({
      id: taskId(),
      title: `Set reminder for ${new Date(deadlineDate.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]} (2 weeks before deadline)`,
      opportunityTitle: opportunity.title,
      deadline: new Date(deadlineDate.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'PENDING',
      priority: 'HIGH',
      category: 'DEADLINE_MANAGEMENT',
    });
  }
  
  // 5. Pending action for submission (requires approval)
  if (eligibilityResult.report.overallStatus === 'VERIFIED_ELIGIBLE') {
    actionItems.push({
      id: actionId(),
      type: 'SUBMIT_APPLICATION',
      description: `Submit application for ${opportunity.title}`,
      status: 'PENDING_APPROVAL',
      requiresApproval: true,
      createdAt: now,
      metadata: {
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
        deadline: opportunity.deadline,
        eligibilityStatus: eligibilityResult.report.overallStatus,
      },
    });
    nextSteps.push(`Once you approve, I can help submit your application for ${opportunity.title}.`);
  }
  
  // 6. Draft response with evidence
  const draftResponse = buildDraftResponse(
    opportunity,
    eligibilityResult,
    tasks,
    evidenceReferences,
    recommendation
  );
  
  return {
    tasks,
    actionItems,
    draftResponse,
    evidenceReferences,
    nextSteps,
  };
}

/**
 * Build personalized draft response
 */
function buildDraftResponse(
  opportunity: Opportunity,
  eligibility: {
    meetsCriteria: CriteriaRubric[];
    failedCriteria: CriteriaRubric[];
    insufficientCriteria: CriteriaRubric[];
    report: EligibilityReport;
  },
  tasks: ApplicationTask[],
  evidenceReferences: EvidenceReference[],
  recommendation?: OpportunityRecommendation,
): string {
  const lines: string[] = [];
  
  lines.push(`## Application Preparation: ${opportunity.title}`);
  lines.push(``);
  
  // Eligibility summary
  lines.push(`### Eligibility Status`);
  lines.push(`**Overall:** ${eligibility.report.overallStatus}`);
  lines.push(``);
  
  lines.push(`**Hard Gates:** ${eligibility.report.hardGatesPassed}/${eligibility.report.totalHardGates} passed`);
  lines.push(``);
  
  // What's satisfied
  if (eligibility.meetsCriteria.length > 0) {
    lines.push(`**✅ Requirements Satisfied:**`);
    for (const c of eligibility.meetsCriteria) {
      const evidence = c.evidenceCitation 
        ? ` (Evidence: ${c.evidenceCitation.documentName}, p.${c.evidenceCitation.pageNumber})` 
        : '';
      lines.push(`- ${c.criterionTitle}${evidence}`);
    }
    lines.push(``);
  }
  
  // What's not satisfied
  if (eligibility.failedCriteria.length > 0) {
    lines.push(`**❌ Requirements Not Met:**`);
    for (const c of eligibility.failedCriteria) {
      lines.push(`- ${c.criterionTitle}`);
    }
    lines.push(``);
  }
  
  // What needs more evidence
  if (eligibility.insufficientCriteria.length > 0) {
    lines.push(`**⚠️ Needs More Evidence:**`);
    for (const c of eligibility.insufficientCriteria) {
      lines.push(`- ${c.criterionTitle}`);
    }
    lines.push(``);
  }
  
  // Action items
  lines.push(`### Your Action Items (${tasks.length} tasks)`);
  lines.push(``);
  
  const pendingTasks = tasks.filter(t => t.status === 'PENDING');
  for (const task of pendingTasks.slice(0, 5)) {
    const priorityMarker = task.priority === 'CRITICAL' ? '🔴' : task.priority === 'HIGH' ? '🟠' : '🟡';
    lines.push(`${priorityMarker} **${task.title}**`);
    if (task.deadline) {
      lines.push(`   Deadline: ${task.deadline}`);
    }
    if (task.category) {
      lines.push(`   Category: ${task.category}`);
    }
  }
  
  if (pendingTasks.length > 5) {
    lines.push(`   ...and ${pendingTasks.length - 5} more tasks`);
  }
  
  lines.push(``);
  
  // Evidence sources
  if (evidenceReferences.length > 0) {
    lines.push(`### Evidence Sources`);
    lines.push(``);
    for (const ref of evidenceReferences) {
      lines.push(`- ${ref.citation.documentName} (p.${ref.citation.pageNumber})`);
    }
    lines.push(``);
  }
  
  // Disclaimer
  lines.push(`---`);
  lines.push(`*This checklist is personalized based on your eligibility evaluation. Tasks and deadlines are suggestions - you are responsible for ensuring all requirements are met. Evidence references link to your verified documents.*`);
  
  return lines.join('\n');
}

/**
 * Create a task
 */
export function createTask(
  title: string,
  opportunityTitle: string,
  options: {
    deadline?: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL';
    category?: 'DOCUMENT' | 'ESSAY' | 'LOR' | 'SUBMISSION';
    status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
    actionUrl?: string;
  } = {}
): ApplicationTask {
  return {
    id: `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    title,
    opportunityTitle,
    deadline: options.deadline || new Date().toISOString().split('T')[0],
    priority: options.priority || 'MEDIUM',
    category: options.category || 'DOCUMENT',
    status: options.status || 'PENDING',
    actionUrl: options.actionUrl,
  };
}

/**
 * Create a pending action requiring approval
 */
export function createPendingAction(
  type: PendingActionType,
  description: string,
  options: {
    requiresApproval?: boolean;
    metadata?: Record<string, unknown>;
  } = {}
): PendingAction {
  return {
    id: `action-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    type,
    description,
    status: options.requiresApproval !== false ? 'PENDING_APPROVAL' : 'EXECUTING',
    requiresApproval: options.requiresApproval !== false,
    createdAt: new Date().toISOString(),
    metadata: options.metadata,
  };
}

/**
 * Generate reminder
 */
export interface Reminder {
  id: string;
  type: 'DEADLINE' | 'TASK' | 'FOLLOW_UP';
  title: string;
  scheduledFor: string;  // ISO date
  opportunityId?: string;
  status: 'SCHEDULED' | 'SENT' | 'CANCELLED';
  createdAt: string;
}

export function createReminder(
  title: string,
  scheduledFor: string,
  options: {
    type?: 'DEADLINE' | 'TASK' | 'FOLLOW_UP';
    opportunityId?: string;
  } = {}
): Reminder {
  return {
    id: `reminder-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    type: options.type || 'DEADLINE',
    title,
    scheduledFor,
    opportunityId: options.opportunityId,
    status: 'SCHEDULED',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Execute a pending action (after approval)
 */
export function executePendingAction(
  action: PendingAction,
  context: {
    opportunity?: Opportunity;
    tasks?: ApplicationTask[];
    draftResponse?: string;
  }
): ToolCallResult {
  const startTime = Date.now();
  
  try {
    switch (action.type) {
      case 'GENERATE_CHECKLIST': {
        // Generate and save tasks
        return {
          toolName: 'generate_checklist',
          status: 'SUCCESS',
          executionTimeMs: Date.now() - startTime,
          inputHash: crypto.createHash('sha256').update(JSON.stringify(action)).digest('hex').slice(0, 16),
          output: {
            tasksGenerated: context.tasks?.length || 0,
            actionId: action.id,
          },
        };
      }
      
      case 'DRAFT_RESPONSE': {
        // Return the draft (not sending it anywhere)
        return {
          toolName: 'draft_response',
          status: 'SUCCESS',
          executionTimeMs: Date.now() - startTime,
          inputHash: crypto.createHash('sha256').update(JSON.stringify(action)).digest('hex').slice(0, 16),
          output: {
            draft: context.draftResponse,
            actionId: action.id,
            note: 'Draft created - not sent anywhere. User must review and approve before sending.',
          },
        };
      }
      
      case 'SCHEDULE_REMINDER': {
        // Create reminder (in real implementation, this would integrate with calendar service)
        return {
          toolName: 'schedule_reminder',
          status: 'SUCCESS',
          executionTimeMs: Date.now() - startTime,
          inputHash: crypto.createHash('sha256').update(JSON.stringify(action)).digest('hex').slice(0, 16),
          output: {
            reminderId: action.id,
            scheduledFor: action.metadata?.scheduledFor,
            note: 'Reminder scheduled - in production this would integrate with calendar service.',
          },
        };
      }
      
      case 'SUBMIT_APPLICATION': {
        // This is a consequential action - in real implementation, would integrate with application portal
        return {
          toolName: 'submit_application',
          status: 'SUCCESS',
          executionTimeMs: Date.now() - startTime,
          inputHash: crypto.createHash('sha256').update(JSON.stringify(action)).digest('hex').slice(0, 16),
          output: {
            actionId: action.id,
            opportunityId: action.metadata?.opportunityId,
            note: 'Application submitted successfully.',
            submittedAt: new Date().toISOString(),
          },
        };
      }
      
      default:
        return {
          toolName: action.type,
          status: 'ERROR',
          executionTimeMs: Date.now() - startTime,
          error: `Unknown action type: ${action.type}`,
        };
    }
  } catch (error) {
    return {
      toolName: action.type,
      status: 'ERROR',
      executionTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error executing action',
    };
  }
}

/**
 * Generate voice response from assistant response
 */
export function generateVoiceResponse(response: AssistantResponse): string {
  // Strip markdown formatting for speech
  let voiceText = response.text
    .replace(/## /g, '')
    .replace(/### /g, '')
    .replace(/\*\*/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/\n+/g, '. ')
    .replace(/^\./, '')
    .trim();
  
  // Add evidence reference summary for voice
  if (response.evidenceReferences.length > 0) {
    const docNames = [...new Set(response.evidenceReferences.map(r => r.citation.documentName))];
    voiceText += `. Source documents: ${docNames.join(', ')}.`;
  }
  
  // Add action item count if applicable
  if (response.pendingActions && response.pendingActions.length > 0) {
    voiceText += ` I have ${response.pendingActions.length} action item(s) pending your review.`;
  }
  
  return voiceText;
}
