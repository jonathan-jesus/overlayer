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

export async function requestUploadUrls(jobId: string): Promise<RequestUploadUrlsResponse> {
  const response = await fetch(`${API_BASE}/jobs/${jobId}/upload-urls`, {
    headers: sessionHeaders(),
  });
  await assertOk(response);
  return response.json();
}

export async function listJobs(): Promise<JobsResponse> {
  const response = await fetch(`${API_BASE}/jobs`, {
    headers: sessionHeaders(),
  });
  await assertOk(response);
  return response.json();
}
