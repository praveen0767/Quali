/**
 * Reconciliation API Service
 */

import { apiClient, isMockModeEnabled } from './client';
import { ReconciliationResult } from './types';
import { MOCK_RECONCILIATION } from '../mockData';

let currentRecon: ReconciliationResult = { ...MOCK_RECONCILIATION };

export async function getReconciliation(caseId = 'REC-8821'): Promise<ReconciliationResult> {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ...currentRecon });
  }
  return apiClient<ReconciliationResult>(`/api/v1/reconciliation/${encodeURIComponent(caseId)}`);
}

export async function approveWithException(
  id: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  if (isMockModeEnabled()) {
    currentRecon = {
      ...currentRecon,
      status: 'MATCH',
      trustStatus: 'VERIFIED',
      trustScore: 0.95,
    };
    return Promise.resolve({
      success: true,
      message: `Exception approved by Lead Verification Officer. Reason: ${reason}`,
    });
  }
  return apiClient<{ success: boolean; message: string }>(
    `/api/v1/reconciliation/${encodeURIComponent(id)}/approve-exception`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

export async function requestCreditNote(
  id: string,
  amount: number
): Promise<{ success: boolean; creditNoteReference: string; message: string }> {
  if (isMockModeEnabled()) {
    return Promise.resolve({
      success: true,
      creditNoteReference: `CN-REQ-${Date.now()}`,
      message: `Credit note request generated for ₹${amount.toLocaleString()} and transmitted to vendor ABC Technologies Pvt Ltd.`,
    });
  }
  return apiClient<{ success: boolean; creditNoteReference: string; message: string }>(
    `/api/v1/reconciliation/${encodeURIComponent(id)}/request-credit-note`,
    {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }
  );
}
