import { apiClient, isMockModeEnabled } from './client';
import { CriteriaRubric, VerificationStatus } from './types';
import { MOCK_CRITERIA_RUBRIC } from './mockAdapter';

let localRubrics: CriteriaRubric[] = [...MOCK_CRITERIA_RUBRIC];

export async function getCriteria(opportunityId?: string): Promise<CriteriaRubric[]> {
  if (isMockModeEnabled()) {
    if (!opportunityId) return Promise.resolve([...localRubrics]);
    return Promise.resolve(localRubrics.filter((r) => r.opportunityId === opportunityId));
  }
  const query = opportunityId ? `?opportunity_id=${encodeURIComponent(opportunityId)}` : '';
  return apiClient<CriteriaRubric[]>(`/api/v1/criteria${query}`);
}

export async function updateCriterionStatus(
  id: string,
  status: VerificationStatus,
  note?: string
): Promise<CriteriaRubric> {
  if (isMockModeEnabled()) {
    const item = localRubrics.find((r) => r.id === id);
    if (item) {
      item.status = status;
      if (note) item.evaluatorNote = note;
      return Promise.resolve(item);
    }
    return Promise.resolve(localRubrics[0]);
  }

  return apiClient<CriteriaRubric>(`/api/v1/criteria/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note }),
  });
}
