import { apiClient, isMockModeEnabled } from './client';
import { CandidateProfile, PrivacyControls } from './types';
import { INITIAL_CANDIDATE_PROFILE, MOCK_PRIVACY_CONTROLS } from './mockAdapter';

let localProfile: CandidateProfile = { ...INITIAL_CANDIDATE_PROFILE };
let localPrivacy: PrivacyControls = { ...MOCK_PRIVACY_CONTROLS };

export async function getProfile(): Promise<CandidateProfile> {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ...localProfile });
  }
  return apiClient<CandidateProfile>('/api/v1/profile');
}

export async function updateProfile(partial: Partial<CandidateProfile>): Promise<CandidateProfile> {
  if (isMockModeEnabled()) {
    localProfile = { ...localProfile, ...partial };
    return Promise.resolve({ ...localProfile });
  }
  return apiClient<CandidateProfile>('/api/v1/profile', {
    method: 'PATCH',
    body: JSON.stringify(partial),
  });
}

export async function resetToDemoProfile(): Promise<CandidateProfile> {
  localProfile = { ...INITIAL_CANDIDATE_PROFILE };
  return Promise.resolve({ ...localProfile });
}

export async function getPrivacySettings(): Promise<PrivacyControls> {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ...localPrivacy });
  }
  return apiClient<PrivacyControls>('/api/v1/profile/privacy');
}

export async function updatePrivacySettings(partial: Partial<PrivacyControls>): Promise<PrivacyControls> {
  if (isMockModeEnabled()) {
    localPrivacy = { ...localPrivacy, ...partial };
    return Promise.resolve({ ...localPrivacy });
  }
  return apiClient<PrivacyControls>('/api/v1/profile/privacy', {
    method: 'PATCH',
    body: JSON.stringify(partial),
  });
}

export async function triggerCryptographicShred(): Promise<{ success: boolean; message: string; purgeTimestamp: string }> {
  if (isMockModeEnabled()) {
    return Promise.resolve({
      success: true,
      message: 'Zero-Leak Enclave purge verified. All local candidate artifacts cryptographically overwritten across cache tiers.',
      purgeTimestamp: new Date().toISOString(),
    });
  }
  return apiClient<{ success: boolean; message: string; purgeTimestamp: string }>('/api/v1/profile/shred', {
    method: 'POST',
  });
}
