/**
 * Evidence API Service
 */

import { apiClient, isMockModeEnabled } from './client';
import { EvidenceSource } from './types';
import { MOCK_EVIDENCE_LIST } from '../mockData';

export async function getAllEvidence(): Promise<EvidenceSource[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([...MOCK_EVIDENCE_LIST]);
  }
  return apiClient<EvidenceSource[]>('/api/v1/evidence');
}

export async function getEvidenceForDocument(documentId: string): Promise<EvidenceSource[]> {
  if (isMockModeEnabled()) {
    const list = MOCK_EVIDENCE_LIST.filter((e) => e.documentId === documentId);
    return Promise.resolve(list.length > 0 ? list : MOCK_EVIDENCE_LIST);
  }
  return apiClient<EvidenceSource[]>(`/api/v1/evidence?document_id=${encodeURIComponent(documentId)}`);
}

export async function getEvidence(evidenceId: string): Promise<EvidenceSource> {
  if (isMockModeEnabled()) {
    const ev = MOCK_EVIDENCE_LIST.find((e) => e.id === evidenceId);
    if (!ev) return Promise.resolve(MOCK_EVIDENCE_LIST[0]);
    return Promise.resolve(ev);
  }
  return apiClient<EvidenceSource>(`/api/v1/evidence/${encodeURIComponent(evidenceId)}`);
}
