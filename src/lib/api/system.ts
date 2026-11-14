import { apiClient, isMockModeEnabled } from './client';
import { SystemTelemetry, SystemHealth } from './types';
import { MOCK_SYSTEM_TELEMETRY } from './mockAdapter';
import { MOCK_SYSTEM_HEALTH } from '../mockData';

export async function getSystemTelemetry(): Promise<SystemTelemetry> {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ...MOCK_SYSTEM_TELEMETRY });
  }
  return apiClient<SystemTelemetry>('/api/v1/system/telemetry');
}

// Legacy TruDoc Compatibility Exports
export async function getSystemHealth(): Promise<SystemHealth> {
  if (isMockModeEnabled()) {
    return Promise.resolve({ ...MOCK_SYSTEM_HEALTH });
  }
  return apiClient<SystemHealth>('/api/v1/system/health');
}

export async function pingService(serviceKey: string): Promise<{ service: string; latencyMs: number; status: string }> {
  if (isMockModeEnabled()) {
    return Promise.resolve({
      service: serviceKey,
      latencyMs: 14,
      status: 'CONNECTED',
    });
  }
  return apiClient<{ service: string; latencyMs: number; status: string }>(
    `/api/v1/system/ping?service=${encodeURIComponent(serviceKey)}`
  );
}
