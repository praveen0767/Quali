/**
 * Policy Controls API Service
 */

import { apiClient, isMockModeEnabled } from './client';
import { PolicyRule } from './types';
import { MOCK_POLICIES } from '../mockData';

let localPolicies: PolicyRule[] = [...MOCK_POLICIES];

export async function getPolicies(): Promise<PolicyRule[]> {
  if (isMockModeEnabled()) {
    return Promise.resolve([...localPolicies]);
  }
  return apiClient<PolicyRule[]>('/api/v1/policies');
}

export async function getPolicy(id: string): Promise<PolicyRule> {
  if (isMockModeEnabled()) {
    const p = localPolicies.find((pol) => pol.id === id || pol.code === id);
    if (!p) return Promise.resolve(localPolicies[0]);
    return Promise.resolve(p);
  }
  return apiClient<PolicyRule>(`/api/v1/policies/${encodeURIComponent(id)}`);
}

export async function updatePolicyStatus(
  id: string,
  status: PolicyRule['status']
): Promise<PolicyRule> {
  if (isMockModeEnabled()) {
    const p = localPolicies.find((pol) => pol.id === id || pol.code === id);
    if (p) p.status = status;
    return Promise.resolve(p || localPolicies[0]);
  }
  return apiClient<PolicyRule>(`/api/v1/policies/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
