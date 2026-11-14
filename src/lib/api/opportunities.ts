import { apiClient, isMockModeEnabled } from './client';
import { Opportunity } from './types';
import { MOCK_OPPORTUNITIES } from './mockAdapter';

let localOpportunities: Opportunity[] = [...MOCK_OPPORTUNITIES];

export async function getOpportunities(): Promise<Opportunity[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([...localOpportunities]);
  }
  return apiClient<Opportunity[]>('/api/v1/opportunities');
}

export async function getOpportunity(id: string): Promise<Opportunity> {
  if (isMockModeEnabled()) {
    const opp = localOpportunities.find((o) => o.id === id);
    if (!opp) {
      if (localOpportunities.length > 0) return Promise.resolve(localOpportunities[0]);
      throw new Error(`Opportunity with ID "${id}" not found.`);
    }
    return Promise.resolve(opp);
  }
  return apiClient<Opportunity>(`/api/v1/opportunities/${encodeURIComponent(id)}`);
}
