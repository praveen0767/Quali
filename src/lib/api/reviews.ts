/**
 * Human Review Queue API Service
 */

import { apiClient, isMockModeEnabled } from './client';
import { ReviewCase, CorrectionSubmission } from './types';
import { MOCK_REVIEWS } from '../mockData';

let localReviews: ReviewCase[] = [...MOCK_REVIEWS];

export async function getReviews(): Promise<ReviewCase[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([...localReviews]);
  }
  return apiClient<ReviewCase[]>('/api/v1/reviews');
}

export async function getReview(id: string): Promise<ReviewCase> {
  if (isMockModeEnabled()) {
    const rev = localReviews.find((r) => r.id === id);
    if (!rev) {
      if (localReviews.length > 0) return Promise.resolve(localReviews[0]);
      throw new Error(`Review with ID "${id}" not found.`);
    }
    return Promise.resolve(rev);
  }
  return apiClient<ReviewCase>(`/api/v1/reviews/${encodeURIComponent(id)}`);
}

export interface ReviewActionResponse {
  success: boolean;
  reviewId: string;
  status: 'ACCEPTED' | 'CORRECTED' | 'REJECTED';
  updatedDocumentStatus: string;
  message: string;
}

export async function submitReviewAction(
  reviewId: string,
  action: 'ACCEPT' | 'CORRECT' | 'REJECT',
  payload?: Partial<CorrectionSubmission>
): Promise<ReviewActionResponse> {
  if (isMockModeEnabled()) {
    const target = localReviews.find((r) => r.id === reviewId);
    if (target) {
      target.status = action === 'ACCEPT' ? 'ACCEPTED' : action === 'CORRECT' ? 'CORRECTED' : 'REJECTED';
      if (action === 'CORRECT' && payload?.correctedValue) {
        target.currentValue = payload.correctedValue;
        target.resolutionNote = payload.reason || 'Corrected by reviewer';
      }
    }
    const resolvedStatus: 'ACCEPTED' | 'CORRECTED' | 'REJECTED' =
      action === 'ACCEPT' ? 'ACCEPTED' : action === 'CORRECT' ? 'CORRECTED' : 'REJECTED';

    return Promise.resolve({
      success: true,
      reviewId,
      status: resolvedStatus,
      updatedDocumentStatus: action === 'CORRECT' ? 'VERIFIED' : 'REVIEW_REQUIRED',
      message: `Review #${reviewId} successfully processed with action: ${action}`,
    });
  }

  return apiClient<ReviewActionResponse>(`/api/v1/reviews/${encodeURIComponent(reviewId)}/action`, {
    method: 'POST',
    body: JSON.stringify({
      action,
      ...payload,
    }),
  });
}
