import type { Job } from '../api/apiClient';

export class JobFailedError extends Error {
  constructor(reason: string) {
    super(`Job failed: ${reason}`);
    this.name = 'JobFailedError';
  }
}

export class TimeoutError extends Error {
  constructor(jobId: string, timeoutMs: number) {
    super(`Polling for job "${jobId}" timed out after ${timeoutMs}ms. The job may still be processing on the server`);
    this.name = 'TimeoutError';
  }
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;

export async function pollJobUntilDone(
  jobId: string,
  getJobStatusFn: () => Promise<Job | undefined>,
  options?: PollOptions
): Promise<Job> {
  const intervalMs = options?.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const job = await getJobStatusFn();

    if (job?.status === 'COMPLETED') return job;
    if (job?.status === 'FAILED') throw new JobFailedError(job.reason ?? 'Unknown error');

    if (Date.now() >= deadline) {
      throw new TimeoutError(jobId, timeoutMs);
    }

    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
  }
}
