/**
 * Centralized Quali API Client
 * Interfaces with Authoritative Python / FastAPI backend at /api/v1/*
 * Isolates mock data behind development adapter
 */

export class ApiError extends Error {
  status: number;
  statusText: string;
  data?: unknown;

  constructor(message: string, status: number, statusText: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.data = data;
  }
}

// Configuration
export const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_BASE_URL) ||
  'http://localhost:8000';

const MOCK_STORAGE_KEY = 'quali_use_mocks';

export function isMockModeEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(MOCK_STORAGE_KEY);
  if (stored !== null) {
    return stored === 'true';
  }
  const envVal =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_USE_MOCKS) ||
    (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_USE_MOCKS);
  if (envVal !== undefined) {
    return envVal === 'true';
  }
  // Default to development mock adapter unless explicit live backend specified
  return true;
}

export function setMockMode(enabled: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(MOCK_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('quali_mock_mode_changed', { detail: enabled }));
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }

      let errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
      if (typeof errorBody === 'object' && errorBody !== null && 'detail' in errorBody) {
        const detail = (errorBody as { detail: unknown }).detail;
        errorMessage = typeof detail === 'string' ? detail : JSON.stringify(detail);
      } else if (typeof errorBody === 'string' && errorBody.length > 0) {
        errorMessage = errorBody;
      }

      if (response.status === 404) {
        errorMessage = `Resource not found: ${endpoint}`;
      } else if (response.status === 500) {
        errorMessage = `Quali verification engine internal error (${response.statusText}).`;
      } else if (response.status === 503) {
        errorMessage = 'Quali verification engine service unavailable.';
      }

      throw new ApiError(errorMessage, response.status, response.statusText, errorBody);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      throw error;
    }
    const msg =
      error instanceof Error
        ? `Quali engine connection error at ${API_BASE_URL} (${error.message})`
        : 'Network connection error to backend';
    throw new ApiError(msg, 0, 'NETWORK_ERROR');
  }
}
