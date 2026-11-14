/**
 * Voice Assistant Integration
 * 
 * Connects text and speech interfaces to the same request workflow.
 * Maintains transcript parity between voice and text interactions.
 * 
 * Responsibilities:
 * - Accept voice input (transcribed text)
 * - Process through the same orchestrator workflow
 * - Generate voice-optimized responses
 * - Maintain text transcript of all interactions
 * - Handle speech synthesis failures gracefully
 * - Provide text fallback when speech fails
 */

import crypto from 'crypto';
import { 
  VoiceAssistantMessage,
} from '../../lib/api/types';
import {
  QualiWorkflowState,
  CreateWorkflowRequest,
  AssistantResponse,
  UserPreferences,
} from '../../lib/api/orchestratorTypes';
import {
  createWorkflow,
  executeFullWorkflow,
  getWorkflowStatus,
  submitForApproval,
  handleApproval,
  checkOrchestratorHealth,
} from './index';

// Voice session management
const voiceSessions: Map<string, {
  workflowId: string;
  transcript: VoiceAssistantMessage[];
  lastInteraction: Date;
}> = new Map();

// Session timeout (5 minutes of inactivity)
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Create or resume a voice session
 */
export function getOrCreateSession(
  sessionId: string,
  userId: string
): {
  sessionId: string;
  workflowId: string;
  transcript: VoiceAssistantMessage[];
} {
  const existing = voiceSessions.get(sessionId);
  
  if (existing) {
    // Check if session has timed out
    const age = Date.now() - existing.lastInteraction.getTime();
    if (age > SESSION_TIMEOUT_MS) {
      // Session timed out - create new workflow
      const workflow = createWorkflow({
        userId,
        userRequest: 'Session resumed after timeout',
        transcript: existing.transcript,
      });
      
      voiceSessions.set(sessionId, {
        workflowId: workflow.workflowId,
        transcript: existing.transcript,
        lastInteraction: new Date(),
      });
      
      return {
        sessionId,
        workflowId: workflow.workflowId,
        transcript: existing.transcript,
      };
    }
    
    // Update last interaction time
    existing.lastInteraction = new Date();
    voiceSessions.set(sessionId, existing);
    
    return {
      sessionId,
      workflowId: existing.workflowId,
      transcript: existing.transcript,
    };
  }
  
  // Create new session with new workflow
  const workflow = createWorkflow({
    userId,
    userRequest: 'New voice session started',
  });
  
  voiceSessions.set(sessionId, {
    workflowId: workflow.workflowId,
    transcript: [],
    lastInteraction: new Date(),
  });
  
  return {
    sessionId,
    workflowId: workflow.workflowId,
    transcript: [],
  };
}

/**
 * Process voice input through orchestrator
 */
export function processVoiceInput(
  sessionId: string,
  userId: string,
  userText: string,
  options: {
    isNewConversation?: boolean;
    interruptCurrent?: boolean;
  } = {}
): {
  response: AssistantResponse;
  sessionId: string;
  workflowId: string;
} {
  // Get or create session
  const session = getOrCreateSession(sessionId, userId);
  
  // Add user message to transcript
  const userMessage: VoiceAssistantMessage = {
    id: `msg-${Date.now()}-u`,
    sender: 'USER',
    text: userText,
    timestamp: new Date().toISOString(),
  };
  
  session.transcript.push(userMessage);
  voiceSessions.set(sessionId, {
    ...session,
    transcript: session.transcript,
    lastInteraction: new Date(),
  });
  
  // Update workflow with new input
  const state = getWorkflowStatus(session.workflowId);
  
  if (!state) {
    throw new Error(`Workflow ${session.workflowId} not found`);
  }
  
  // If new conversation, start fresh workflow
  if (options.isNewConversation) {
    const newWorkflow = createWorkflow({
      userId,
      userRequest: userText,
      transcript: [],
    });
    
    voiceSessions.set(sessionId, {
      workflowId: newWorkflow.workflowId,
      transcript: [userMessage],
      lastInteraction: new Date(),
    });
    
    // Execute the workflow
    executeFullWorkflow(newWorkflow.workflowId);
    
    const finalState = getWorkflowStatus(newWorkflow.workflowId);
    const response = buildVoiceResponse(finalState!);
    
    return {
      response,
      sessionId,
      workflowId: newWorkflow.workflowId,
    };
  }
  
  // Update existing workflow with new request
  // In a real implementation, this would append to the conversation
  // For now, we treat it as a follow-up
  
  // Execute workflow to completion
  executeFullWorkflow(session.workflowId);
  
  const finalState = getWorkflowStatus(session.workflowId);
  const response = buildVoiceResponse(finalState!);
  
  return {
    response,
    sessionId,
    workflowId: session.workflowId,
  };
}

/**
 * Build voice-optimized response from workflow state
 */
function buildVoiceResponse(state: QualiWorkflowState): AssistantResponse {
  const profile = {
    fullName: 'Candidate',
    email: '',
    educationTier: '',
  };
  
  // Check if we need approval
  const needsApproval = state.pendingActions.some(a => a.status === 'PENDING_APPROVAL');
  
  // Build text response
  const text = needsApproval
    ? `I found ${state.pendingActions.filter(a => a.status === 'PENDING_APPROVAL').length} action item(s) that need your approval. Would you like me to proceed with any of these?`
    : `I've prepared your application plan. You have ${state.planningTasks.filter(t => t.status === 'PENDING').length} tasks to complete. Your top recommendation is ${state.recommendation?.opportunityTitle || 'not available yet'}.`;
  
  // Build voice text (optimized for speech)
  const voiceText = needsApproval
    ? `I need your approval for ${state.pendingActions.filter(a => a.status === 'PENDING_APPROVAL').length} action items. Say "approve" followed by the action name to proceed.`
    : `I've created ${state.planningTasks.filter(t => t.status === 'PENDING').length} tasks for you. Your top opportunity match is ${state.recommendation?.opportunityTitle || 'being evaluated'}. Check the app for details.`;
  
  // Build evidence references from state
  const evidenceReferences = state.evidenceReferences.map(r => ({
    citation: r.citation,
    usedInEvaluation: r.usedInEvaluation,
    context: r.context,
    criteriaId: r.criteriaId,
  }));
  
  return {
    text,
    voiceText,
    responseType: needsApproval ? 'APPROVAL_REQUIRED' : 'INFORMATIONAL',
    evidenceReferences,
    pendingActions: state.pendingActions.filter(a => a.status === 'PENDING_APPROVAL'),
    workflowStatus: state.status,
    workflowId: state.workflowId,
    timestamp: new Date().toISOString(),
    resumable: state.status === 'COMPLETED' || state.status === 'FAILED',
    resumePoint: state.status === 'FAILED' ? state.currentStep : undefined,
    toolCalls: state.completedToolCalls,
  };
}

/**
 * Get session transcript
 */
export function getSessionTranscript(
  sessionId: string
): VoiceAssistantMessage[] | null {
  const session = voiceSessions.get(sessionId);
  if (!session) return null;
  
  return session.transcript;
}

/**
 * Clear session (user ended conversation)
 */
export function endSession(sessionId: string): boolean {
  return voiceSessions.delete(sessionId);
}

/**
 * Check session status
 */
export function getSessionStatus(
  sessionId: string
): {
  active: boolean;
  lastInteraction: Date | null;
  transcriptLength: number;
  workflowId: string | null;
} | null {
  const session = voiceSessions.get(sessionId);
  if (!session) return null;
  
  const age = Date.now() - session.lastInteraction.getTime();
  const isActive = age < SESSION_TIMEOUT_MS;
  
  return {
    active: isActive,
    lastInteraction: session.lastInteraction,
    transcriptLength: session.transcript.length,
    workflowId: session.workflowId,
  };
}

/**
 * Health check for voice service
 */
export function checkVoiceHealth(): {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Array<{
    name: string;
    status: 'pass' | 'fail' | 'warn';
    message: string;
  }>;
} {
  const checks: Array<{ name: string; status: 'pass' | 'fail' | 'warn'; message: string }> = [];
  
  // Check session store
  const sessionCount = voiceSessions.size;
  if (sessionCount < 100) {
    checks.push({ name: 'session_store', status: 'pass', message: `${sessionCount} active sessions` });
  } else {
    checks.push({ name: 'session_store', status: 'warn', message: `${sessionCount} sessions - consider cleanup` });
  }
  
  // Check orchestrator health
  const orchestratorHealth = checkOrchestratorHealth();
  if (orchestratorHealth.status === 'healthy') {
    checks.push({ name: 'orchestrator', status: 'pass', message: 'Orchestrator operational' });
  } else {
    const mappedStatus = orchestratorHealth.status === 'unhealthy' ? 'fail' : 'warn';
    checks.push({ name: 'orchestrator', status: mappedStatus, message: 'Orchestrator issue' });
  }
  
  // Determine overall
  const failed = checks.filter(c => c.status === 'fail');
  const overall = failed.length > 0 ? 'unhealthy' : 
                  checks.some(c => c.status === 'warn') ? 'degraded' : 'healthy';
  
  return { status: overall, checks };
}

/**
 * Speech synthesis helper (abstract - integration point)
 */
export interface SpeechSynthesisOptions {
  text: string;
  voice?: string;
  language?: string;
  rate?: number;  // 0.5 to 2.0
  pitch?: number;  // 0.5 to 2.0
}

export interface SpeechSynthesisResult {
  success: boolean;
  audioUrl?: string;
  error?: string;
  durationMs?: number;
}

/**
 * Synthesize speech from text
 * In production, this would integrate with a TTS service (AWS Polly, Google TTS, Azure Speech, etc.)
 */
export function synthesizeSpeech(
  options: SpeechSynthesisOptions
): SpeechSynthesisResult {
  // Placeholder - in production, integrate with TTS service
  // For now, return success with no audio (text-only mode)
  
  return {
    success: true,
    audioUrl: undefined,  // No audio generated - text-only mode
    durationMs: options.text.length * 10, // Rough estimate: 10ms per character
  };
}

/**
 * Handle speech recognition result
 */
export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

/**
 * Process speech recognition result
 */
export function processSpeechRecognition(
  sessionId: string,
  userId: string,
  result: SpeechRecognitionResult,
  options: {
    isNewConversation?: boolean;
  } = {}
): {
  response: AssistantResponse;
  sessionId: string;
  workflowId: string;
} {
  // If confidence is low, ask for clarification
  if (result.confidence < 0.7 && !result.isFinal) {
    return {
      response: {
        text: `I heard "${result.transcript}" but I'm not confident. Could you repeat that?`,
        voiceText: `I heard "${result.transcript}" but I'm not confident. Could you repeat that?`,
        responseType: 'INFORMATIONAL',
        evidenceReferences: [],
        workflowStatus: 'PENDING',
        workflowId: '',
        timestamp: new Date().toISOString(),
        resumable: false,
      },
      sessionId,
      workflowId: '',
    };
  }
  
  // Process the transcript
  return processVoiceInput(sessionId, userId, result.transcript, options);
}

/**
 * Cleanup expired sessions
 */
export function cleanupExpiredSessions(): number {
  const cutoff = new Date();
  cutoff.setTime(cutoff.getTime() - SESSION_TIMEOUT_MS);
  
  let removed = 0;
  for (const [id, session] of voiceSessions.entries()) {
    if (session.lastInteraction < cutoff) {
      voiceSessions.delete(id);
      removed++;
    }
  }
  
  return removed;
}
