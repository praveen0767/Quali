/**
 * Cases API Service
 */

import { apiClient, isMockModeEnabled } from './client';
import { CaseRecord } from './types';
import { MOCK_CASES } from '../mockData';

export async function getCases(): Promise<CaseRecord[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([...MOCK_CASES]);
  }
  return apiClient<CaseRecord[]>('/api/v1/cases');
}

export async function getCase(id: string): Promise<CaseRecord> {
  if (isMockModeEnabled()) {
    const found = MOCK_CASES.find((c) => c.id === id || c.caseNumber.includes(id));
    if (!found) {
      // Default to primary case if not found
      return Promise.resolve(MOCK_CASES[0]);
    }
    return Promise.resolve(found);
  }
  return apiClient<CaseRecord>(`/api/v1/cases/${encodeURIComponent(id)}`);
}
