import { getSessionId } from '../session/session';

export type JobStatus = 'MISSING_ASSETS' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface PresignedUploadFields {
  key: string;
  contentType: string;
  policy: string;
  xAmzAlgorithm: string;
  xAmzCredential: string;
  xAmzDate: string;
  xAmzSignature: string;
  xAmzSecurityToken?: string;
}

export interface PresignedUpload {
  url: string;
  maxFileSize: number;
  fields: PresignedUploadFields;
}

export interface RequestUploadUrlsResponse {
  jobId: string;
  videoUpload: PresignedUpload;
  overlayUpload: PresignedUpload;
}

export interface Job {
  jobId: string;
  status: JobStatus;
  createdAt: string;
  downloadUrl?: string;
  reason?: string;
}

export interface JobsResponse {
  jobs: Job[];
}

const API_BASE = import.meta.env.PUBLIC_API_BASE_URL ?? '/api';

function sessionHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'X-Session-ID': getSessionId(),
  };
}

async function assertOk(response: Response): Promise<void> {
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
}

export class RateLimitError extends Error {
  public retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

async function fetchWithRetry(url: string, options?: RequestInit, retries = 3): Promise<Response> {
  let attempt = 0;
  while (attempt <= retries) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      let delayMs = 0;
      const retryAfterHeader = response.headers.get('Retry-After');
      if (retryAfterHeader) {
        const asNumber = parseInt(retryAfterHeader, 10);
        if (!isNaN(asNumber)) {
          // If it's a number, it's seconds
          delayMs = asNumber * 1000;
        } else {
          // Otherwise, it might be an HTTP date
          const date = new Date(retryAfterHeader).getTime();
          if (!isNaN(date)) {
            delayMs = Math.max(0, date - Date.now());
          }
        }
      }

      if (delayMs <= 0) {
        // Fallback to exponential backoff
        delayMs = Math.pow(2, attempt) * 1000;
      }

      if (attempt === retries) {
        throw new RateLimitError(`API error: 429 Too Many Requests`, delayMs);
      }

      await new Promise(resolve => setTimeout(resolve, delayMs));
      attempt++;
      continue;
    }

    await assertOk(response);
    return response;
  }
  throw new Error('Unreachable');
}

export async function requestUploadUrls(jobId: string): Promise<RequestUploadUrlsResponse> {
  const response = await fetchWithRetry(`${API_BASE}/jobs/${jobId}/upload-urls`, {
    headers: sessionHeaders(),
  });
  return response.json();
}

export async function listJobs(): Promise<JobsResponse> {
  const response = await fetchWithRetry(`${API_BASE}/jobs`, {
    headers: sessionHeaders(),
  });
  return response.json();
}
