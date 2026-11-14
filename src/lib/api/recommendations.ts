import { apiClient, isMockModeEnabled } from './client';
import { OpportunityRecommendation } from './types';
import { MOCK_RECOMMENDATIONS } from './mockAdapter';

export async function getRecommendations(): Promise<OpportunityRecommendation[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([...MOCK_RECOMMENDATIONS]);
  }
  return apiClient<OpportunityRecommendation[]>('/api/v1/recommendations');
}
