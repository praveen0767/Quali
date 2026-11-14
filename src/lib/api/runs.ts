/**
 * Agent Runs API Service
 */

import { apiClient, isMockModeEnabled } from './client';
import { AgentTrace } from './types';
import { MOCK_TRACE } from '../mockData';

export async function getRuns(): Promise<AgentTrace[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([MOCK_TRACE]);
  }
  return apiClient<AgentTrace[]>('/api/v1/runs');
}

export async function getRun(id: string): Promise<AgentTrace> {
  if (isMockModeEnabled()) {
    return Promise.resolve(MOCK_TRACE);
  }
  return apiClient<AgentTrace>(`/api/v1/runs/${encodeURIComponent(id)}`);
}
