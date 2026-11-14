/**
 * PLANNER: Understand user's goal and break it into bounded opportunity-management tasks.
 * 
 * Responsibilities:
 * - Parse user intent from natural language requests
 * - Identify mentioned opportunities, documents, or goals
 * - Break complex goals into manageable, ordered tasks
 * - Generate personalized recommendations based on user profile and preferences
 * - Maintain task ordering and dependencies
 * - Never fabricate opportunities - only suggest from known opportunities
 */

import crypto from 'crypto';
import { 
  Opportunity, 
  CandidateProfile, 
  CriteriaRubric,
  IngestedDocument,
  EvidenceCitation,
  DecisionOutcome
} from '../../lib/api/types';
import { 
  OrchestratorConfig,
  DEFAULT_ORCHESTRATOR_CONFIG,
  OpportunityRecommendation,
  UserPreferences,
  EvidenceReference,
  PlanningTask,
  CreateWorkflowRequest,
  QualiWorkflowState
} from '../../lib/api/orchestratorTypes';
import { evaluateEligibility } from '../engine/rulesEngine';
import { generateChecklistTasks } from '../engine/checklistGenerator';

// Domain pattern matching for intent understanding
const OPPORTUNITY_KEYWORDS: Record<string, string[]> = {
  'fellowship': ['fellowship', 'grant', 'scholarship', 'award', 'prestigious'],
  'bio-x': ['bio-x', 'stanford bio-x', 'interdisciplinary', 'computational biology', 'biomedical'],
  'nsf': ['nsf', 'grfp', 'national science foundation', 'citizen', 'us citizen'],
  'research': ['research', 'paper', 'publication', 'neurips', 'conference', 'journal'],
  'visa': ['visa', 'citizenship', 'immigration', 'f-1', 'f1', 'opt', 'work authorization', 'green card'],
  'application': ['apply', 'submission', 'deadline', 'application', 'submit'],
  'documents': ['transcript', 'document', 'cv', 'resume', 'letter of recommendation', 'lor', 'upload'],
  'eligibility': ['eligible', 'qualify', 'eligibility', 'requirements', 'criteria', 'meet'],
  'recommend': ['recommend', 'best', 'top', 'highest', 'match', 'suggest', 'priority'],
};

const DEADLINE_PATTERN = /\b(\d{4}-\d{2}-\d{2}|this\s+(week|month|quarter|year)|next\s+(week|month|quarter|year)|within\s+\d+\s+(days|weeks|months))\b/i;

/**
 * Parse user intent from natural language request
 */
export interface ParsedIntent {
  primaryGoal: string;
  mentionedOpportunities: string[];  // Opportunity IDs mentioned
  mentionedDocuments: string[];  // Document types mentioned
  hasUrgency: boolean;
  hasDeadlineConstraint: boolean;
  deadlineHint?: string;
  wantsRecommendation: boolean;
  wantsEligibilityCheck: boolean;
  wantsActionPlan: boolean;
  isConsequentialAction: boolean;  // Submit, schedule, etc.
}

export function parseUserIntent(request: string, knownOpportunities: Opportunity[]): ParsedIntent {
  const lower = request.toLowerCase();
  const words = lower.split(/\s+/);
  
  // Detect mentioned opportunities by ID or keywords
  const mentionedOpportunities: string[] = [];
  for (const opp of knownOpportunities) {
    const oppKeywords = opp.title.toLowerCase().split(/\s+/);
    const hasMatch = oppKeywords.some(kw => lower.includes(kw)) || 
                     opp.id.toLowerCase().includes(lower);
    if (hasMatch) {
      mentionedOpportunities.push(opp.id);
    }
  }
  
  // Detect document types mentioned
  const mentionedDocuments: string[] = [];
  const docPatterns = [
    { pattern: /transcript/i, type: 'TRANSCRIPT' },
    { pattern: /cv|resume|curriculum/i, type: 'CV' },
    { pattern: /letter\s*(of\s*)?recommend/i, type: 'LOR' },
    { pattern: /i-?20|visa|immigration|sevis/i, type: 'I20_VISA' },
    { pattern: /preprint|paper|publication|research/i, type: 'PREPRINT' },
  ];
  
  for (const { pattern, type } of docPatterns) {
    if (pattern.test(request)) {
      mentionedDocuments.push(type);
    }
  }
  
  // Check for deadline constraints
  const deadlineMatch = request.match(DEADLINE_PATTERN);
  const hasDeadlineConstraint = !!deadlineMatch;
  
  // Determine urgency
  const urgencyPatterns = [
    /urgent|asap|immediately|quickly/i,
    /deadline|due|must|before/i,
    /this\s+(week|month)/i,
  ];
  const hasUrgency = urgencyPatterns.some(p => p.test(request));
  
  // Determine user wants
  const wantsRecommendation = /\b(recommend|better|best|top|highest|match|suggest|prioritize)\b/i.test(request);
  const wantsEligibilityCheck = /\b(eligible|qualify|eligibility|requirement|criteria)\b/i.test(request);
  const wantsActionPlan = /\b(plan|checklist|task|step|action|what\s+do|how\s+to)\b/i.test(request);
  
  // Consequential actions require approval
  const consequentialPatterns = [
    /submit|apply|send|complete|finish/i,
    /schedule|reminder|reminder/i,
    /draft|compose|write/i,
  ];
  const isConsequentialAction = consequentialPatterns.some(p => p.test(request));
  
  // Extract primary goal
  const goalPatterns = [
    { regex: /recommend\s+(me\s+)?the\s+(best|top|highest)\s*(opportunity|fellowship|grant|scholarship)/i, goal: 'find_best_match' },
    { regex: /apply\s+to\s+(?:the\s+)?(.+)/i, goal: 'apply_to_opportunity' },
    { regex: /check\s+(my\s+)?eligibility\s+(for|to|on)?\s*(?:the\s+)?(.+)/i, goal: 'check_eligibility' },
    { regex: /what\s+(opportunities|fellowships|grants|scholarships)\s+(do\s+I\s+)?qualify\s+for/i, goal: 'list_qualifying' },
    { regex: /help\s+me\s+(apply|prepare|submit)/i, goal: 'prepare_application' },
    { regex: /plan|checklist|task|steps?/i, goal: 'create_action_plan' },
    { regex: /upload|document|transcript|cv|resume/i, goal: 'upload_documents' },
    { regex: /status|progress|track/i, goal: 'check_status' },
  ];
  
  let primaryGoal = 'general_inquiry';
  for (const { regex, goal } of goalPatterns) {
    if (regex.test(request)) {
      primaryGoal = goal;
      break;
    }
  }
  
  return {
    primaryGoal,
    mentionedOpportunities,
    mentionedDocuments,
    hasUrgency,
    hasDeadlineConstraint,
    deadlineHint: deadlineMatch?.[0],
    wantsRecommendation,
    wantsEligibilityCheck,
    wantsActionPlan,
    isConsequentialAction,
  };
}

/**
 * Score an opportunity against user profile and preferences
 * Returns a relevance score (0-100) and personalization factors
 */
export interface OpportunityScore {
  relevanceScore: number;  // 0-100, purely relevance-based
  personalizationFactors: {
    domainMatch: number;  // 0-1, domain alignment
    deadlineProximity: number;  // 0-1, closer deadlines = higher
    qualificationStrength: number;  // 0-1, profile strength
    preferenceAlignment: number;  // 0-1, preference match
  };
  reasoning: string[];
}

export function scoreOpportunity(
  opportunity: Opportunity,
  profile: CandidateProfile,
  preferences: UserPreferences,
  documentCount: number
): OpportunityScore {
  const factors: OpportunityScore['personalizationFactors'] = {
    domainMatch: 0,
    deadlineProximity: 0,
    qualificationStrength: 0,
    preferenceAlignment: 0,
  };
  
  const reasoning: string[] = [];
  
  // Domain match: compare opportunity domainFocus with profile domainTags
  const oppDomains = opportunity.domainFocus.map(d => d.toLowerCase());
  const profileDomains = profile.domainTags.map(d => d.name.toLowerCase());
  const matchingDomains = oppDomains.filter(d => profileDomains.some(p => p.includes(d) || d.includes(p)));
  factors.domainMatch = matchingDomains.length > 0 ? matchingDomains.length / oppDomains.length : 0;
  if (factors.domainMatch > 0) {
    reasoning.push(`Domain alignment: ${matchingDomains.length}/${oppDomains.length} domains match your expertise (${profileDomains.join(', ')})`);
  } else {
    reasoning.push(`Limited domain alignment: opportunity focuses on ${oppDomains.join(', ')}`);
  }
  
  // Deadline proximity: closer deadlines = higher priority score
  const deadlineDate = new Date(opportunity.deadline);
  const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  // Score: 1.0 if <= 7 days, 0.5 if <= 30 days, 0.2 if <= 90 days, 0 otherwise
  if (daysUntilDeadline <= 0) {
    factors.deadlineProximity = 0;  // Past deadline
    reasoning.push(`Deadline passed: ${opportunity.deadline}`);
  } else if (daysUntilDeadline <= 7) {
    factors.deadlineProximity = 1.0;
    reasoning.push(`Imminent deadline: ${daysUntilDeadline} days remaining (highest priority)`);
  } else if (daysUntilDeadline <= 30) {
    factors.deadlineProximity = 0.5;
    reasoning.push(`Near deadline: ${daysUntilDeadline} days remaining`);
  } else if (daysUntilDeadline <= 90) {
    factors.deadlineProximity = 0.2;
    reasoning.push(`Moderate deadline: ${daysUntilDeadline} days remaining`);
  } else {
    factors.deadlineProximity = 0;
    reasoning.push(`Distant deadline: ${daysUntilDeadline} days remaining`);
  }
  
  // Qualification strength: basic profile completeness
  const profileStrength = [
    profile.gpa > 0 ? 1 : 0,
    profile.degree ? 1 : 0,
    profile.graduationDate ? 1 : 0,
    profile.workAuthorization ? 1 : 0,
    documentCount > 0 ? 1 : 0,
  ].filter(Boolean).length;
  factors.qualificationStrength = profileStrength / 5;
  reasoning.push(`Profile strength: ${profileStrength}/5 components complete (${documentCount} document(s) uploaded)`);
  
  // Preference alignment: user's preferred sponsors and domains
  let preferenceScore = 0;
  if (preferences.preferredSponsors.length > 0) {
    if (preferences.preferredSponsors.some(s => opportunity.sponsor.toLowerCase().includes(s.toLowerCase()))) {
      preferenceScore += 0.3;
      reasoning.push(`Sponsor preference: ${opportunity.sponsor} is in your preferred list`);
    }
  }
  if (preferences.interestedDomains.length > 0) {
    const matchingPrefs = preferences.interestedDomains.filter(d => 
      opportunity.domainFocus.some(od => od.toLowerCase().includes(d.toLowerCase()))
    );
    if (matchingPrefs.length > 0) {
      preferenceScore += 0.3;
      reasoning.push(`Domain preferences: ${matchingPrefs.length}/${preferences.interestedDomains.length} of your preferred domains match`);
    }
  }
  // Work authorization check
  if (preferences.workAuthorization && opportunity.citizenshipTiers.length > 0) {
    if (opportunity.citizenshipTiers.some(t => t === preferences.workAuthorization)) {
      preferenceScore += 0.2;
      reasoning.push(`Work authorization: ${preferences.workAuthorization} matches opportunity requirements`);
    } else {
      reasoning.push(`Work authorization mismatch: ${preferences.workAuthorization} vs ${opportunity.citizenshipTiers.join(', ')}`);
    }
  }
  factors.preferenceAlignment = preferenceScore;
  if (preferenceScore === 0) {
    reasoning.push(`No explicit preference alignment detected`);
  }
  
  // Calculate overall relevance (weighted)
  const relevanceScore = Math.round(
    (factors.domainMatch * 40) +  // Domain match is most important
    (factors.deadlineProximity * 25) +  // Time sensitivity
    (factors.qualificationStrength * 20) +  // Profile readiness
    (factors.preferenceAlignment * 15)  // User preferences
  );
  
  return {
    relevanceScore: Math.min(100, Math.max(0, relevanceScore)),
    personalizationFactors: factors,
    reasoning,
  };
}

/**
 * Generate planning tasks from parsed intent and opportunities
 */
export function generatePlanningTasks(
  parsedIntent: ParsedIntent,
  opportunities: Opportunity[],
  profile: CandidateProfile,
  preferences: UserPreferences,
  documentCount: number
): PlanningTask[] {
  const tasks: PlanningTask[] = [];
  const taskId = () => `task-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  
  // Always start with understanding the request
  tasks.push({
    id: taskId(),
    description: `Understand user request: "${parsedIntent.primaryGoal}"`,
    responsibility: 'PLANNER',
    status: 'COMPLETED',
    dependsOn: [],
    createdAt: now,
    completedAt: now,
    result: parsedIntent,
  });
  
  // If specific opportunity mentioned, generate retrieval tasks
  if (parsedIntent.mentionedOpportunities.length > 0) {
    for (const oppId of parsedIntent.mentionedOpportunities) {
      const opp = opportunities.find(o => o.id === oppId);
      if (opp) {
        tasks.push({
          id: taskId(),
          description: `Retrieve opportunity details for ${opp.title}`,
          responsibility: 'RETRIEVER',
          status: 'PENDING',
          dependsOn: [tasks[0].id],
          createdAt: now,
        });
        
        if (parsedIntent.wantsEligibilityCheck || parsedIntent.primaryGoal === 'check_eligibility') {
          tasks.push({
            id: taskId(),
            description: `Evaluate eligibility for ${opp.title}`,
            responsibility: 'EVALUATOR',
            status: 'PENDING',
            dependsOn: [tasks[tasks.length - 1].id],
            createdAt: now,
          });
        }
        
        if (parsedIntent.wantsActionPlan || parsedIntent.primaryGoal === 'prepare_application') {
          tasks.push({
            id: taskId(),
            description: `Generate action checklist for ${opp.title}`,
            responsibility: 'ACTION_COORDINATOR',
            status: 'PENDING',
            dependsOn: [tasks[tasks.length - 1]?.id || tasks[0].id],
            createdAt: now,
          });
        }
      }
    }
  }
  
  // If wants recommendations, generate scoring tasks for all opportunities
  if (parsedIntent.wantsRecommendation && opportunities.length > 0) {
    tasks.push({
      id: taskId(),
      description: `Score all ${opportunities.length} opportunities against profile and preferences`,
      responsibility: 'PLANNER',
      status: 'PENDING',
      dependsOn: [tasks[0].id],
      createdAt: now,
    });
    
    // After scoring, generate retrieval tasks for top matches
    tasks.push({
      id: taskId(),
      description: `Retrieve evidence for top-ranked opportunities`,
      responsibility: 'RETRIEVER',
      status: 'PENDING',
      dependsOn: [tasks[tasks.length - 1].id],
      createdAt: now,
    });
  }
  
  // Document upload tasks if needed
  if (parsedIntent.mentionedDocuments.length > 0 && documentCount === 0) {
    tasks.push({
      id: taskId(),
      description: `Request required documents: ${parsedIntent.mentionedDocuments.join(', ')}`,
      responsibility: 'ACTION_COORDINATOR',
      status: 'PENDING',
      dependsOn: [tasks[0].id],
      createdAt: now,
    });
  }
  
  // Generate checklist if asked for action plan
  if (parsedIntent.wantsActionPlan && parsedIntent.mentionedOpportunities.length > 0) {
    let lastEvaluatorIndex = -1;
    for (let i = tasks.length - 1; i >= 0; i--) {
      if (tasks[i].responsibility === 'EVALUATOR') {
        lastEvaluatorIndex = i;
        break;
      }
    }
    const lastTask = lastEvaluatorIndex >= 0 ? tasks[lastEvaluatorIndex] : undefined;
    tasks.push({
      id: taskId(),
      description: `Generate personalized checklist and draft response`,
      responsibility: 'ACTION_COORDINATOR',
      status: 'PENDING',
      dependsOn: [lastTask?.id || tasks[0].id],
      createdAt: now,
    });
  }
  
  return tasks;
}

/**
 * Main planner execution: parse intent, score opportunities, generate tasks
 */
export function executePlanner(
  request: CreateWorkflowRequest,
  opportunities: Opportunity[],
  profile: CandidateProfile,
  preferences: UserPreferences,
  documents: IngestedDocument[]
): {
  intent: ParsedIntent;
  tasks: PlanningTask[];
  recommendations: OpportunityRecommendation[];
} {
  // Parse user intent
  const intent = parseUserIntent(request.userRequest, opportunities);
  
  // Generate planning tasks
  const tasks = generatePlanningTasks(
    intent,
    opportunities,
    profile,
    preferences,
    documents.length
  );
  
  // Generate recommendations if requested or if no specific opportunity mentioned
  const recommendations: OpportunityRecommendation[] = [];
  
  if (intent.wantsRecommendation || 
      (intent.mentionedOpportunities.length === 0 && opportunities.length > 0)) {
    
    // Score all opportunities
    const scored = opportunities.map(opp => {
      const score = scoreOpportunity(opp, profile, preferences, documents.length);
      return {
        opportunity: opp,
        score,
      };
    });
    
    // Sort by relevance score (descending)
    scored.sort((a, b) => b.score.relevanceScore - a.score.relevanceScore);
    
    // Take top N recommendations
    const topN = Math.min(5, scored.length);
    for (let i = 0; i < topN; i++) {
      const { opportunity, score } = scored[i];
      
      // Run quick eligibility check (if we have profile and documents)
      let eligibilityStatus: DecisionOutcome = 'INSUFFICIENT_EVIDENCE';
      if (profile.gpa > 0 && documents.length > 0) {
        // We could run full evaluation here, but for planning we just note
        eligibilityStatus = 'INSUFFICIENT_EVIDENCE';
      }
      
      // Build recommendation
      const recommendation: OpportunityRecommendation = {
        opportunityId: opportunity.id,
        opportunityTitle: opportunity.title,
        priorityRank: i + 1,
        matchTier: score.relevanceScore >= 70 ? 'HIGH_MATCH' : 
                  score.relevanceScore >= 40 ? 'SUPPLEMENTAL_NEEDED' : 'DISQUALIFIED',
        eligibilityStatus,
        recommendationReasons: score.reasoning,
        evidenceReferences: [],  // Will be populated by retriever
        personalizationFactors: score.personalizationFactors,
        relevanceNote: `Relevance score: ${score.relevanceScore}/100 (based on domain match, deadline proximity, profile readiness, and preference alignment). This is a relevance ranking, NOT an eligibility verdict.`,
        eligibilityNote: `Eligibility has NOT been determined yet. Run the Evaluator to get criterion-level eligibility results.`,
      };
      
      recommendations.push(recommendation);
    }
  }
  
  return {
    intent,
    tasks,
    recommendations,
  };
}

/**
 * Initial workflow state creation
 */
export function createInitialWorkflowState(request: CreateWorkflowRequest): QualiWorkflowState {
  const now = new Date().toISOString();
  
  return {
    workflowId: request.resumeFrom || `wf-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`,
    userId: request.userId,
    status: 'PLANNING',
    createdAt: now,
    updatedAt: now,
    currentStep: 'PLANNER',
    userRequest: request.userRequest,
    userPreferences: {
      interestedDomains: [],
      priorityDeadlines: [],
      preferredSponsors: [],
      workAuthorization: '',
      ...request.userPreferences,
    },
    evidenceReferences: [],
    criterionResults: [],
    pendingActions: [],
    planningTasks: [],
    transcript: request.transcript || [],
    lastError: undefined,
    completedToolCalls: [],
  };
}

/**
 * Resume workflow from interrupt point
 */
export function resumeWorkflow(state: QualiWorkflowState): QualiWorkflowState {
  if (state.status !== 'RESUMABLE') {
    throw new Error(`Cannot resume workflow in status: ${state.status}`);
  }
  
  return {
    ...state,
    status: 'PLANNING',
    updatedAt: new Date().toISOString(),
    currentStep: state.interruptPoint || 'PLANNER',
  };
}
