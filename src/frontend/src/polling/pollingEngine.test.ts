import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pollJobUntilDone, JobFailedError, TimeoutError } from './pollingEngine';
import type { Job } from '../api/apiClient';

const INTERVAL_MS = 10_000;
const TIMEOUT_MS = 900_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function makeGetJobStatusFn(responses: (Job | undefined)[]) {
  let callCount = 0;
  return vi.fn(async (): Promise<Job | undefined> =>
    responses[Math.min(callCount++, responses.length - 1)]
  );
}

describe('pollJobUntilDone', () => {
  it('resolves through MISSING_ASSETS -> PROCESSING -> COMPLETED transitions', async () => {
    const getJobStatusFn = makeGetJobStatusFn([
      { jobId: 'j1', status: 'MISSING_ASSETS', createdAt: '' },
      { jobId: 'j1', status: 'PROCESSING', createdAt: '' },
      { jobId: 'j1', status: 'COMPLETED', createdAt: '', downloadUrl: 'https://cdn.example.com/j1.mp4' },
    ]);

    const promise = pollJobUntilDone('j1', getJobStatusFn, { intervalMs: INTERVAL_MS, timeoutMs: TIMEOUT_MS });

    await vi.advanceTimersByTimeAsync(2 * INTERVAL_MS);
    const result = await promise;

    expect(result.status).toBe('COMPLETED');
    expect(result.downloadUrl).toBe('https://cdn.example.com/j1.mp4');
  });

  it('rejects with JobFailedError when status is FAILED, including the reason', async () => {
    const getJobStatusFn = makeGetJobStatusFn([
      { jobId: 'j1', status: 'FAILED', createdAt: '', reason: 'Encoding error' },
    ]);

    await expect(
      pollJobUntilDone('j1', getJobStatusFn, { intervalMs: INTERVAL_MS, timeoutMs: TIMEOUT_MS })
    ).rejects.toThrow(JobFailedError);

    await expect(
      pollJobUntilDone('j1', getJobStatusFn, { intervalMs: INTERVAL_MS, timeoutMs: TIMEOUT_MS })
    ).rejects.toThrow('Encoding error');
  });

  it('rejects with TimeoutError when no terminal state is reached within timeoutMs', async () => {
    const getJobStatusFn = makeGetJobStatusFn([
      { jobId: 'j1', status: 'PROCESSING', createdAt: '' },
    ]);

    const promise = pollJobUntilDone('j1', getJobStatusFn, { intervalMs: INTERVAL_MS, timeoutMs: TIMEOUT_MS });
    const expectPromise = expect(promise).rejects.toThrow(TimeoutError);

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + INTERVAL_MS);

    await expectPromise;
  });

  it('calls listJobsFn at the correct 10s interval', async () => {
    const getJobStatusFn = makeGetJobStatusFn([
      { jobId: 'j1', status: 'PROCESSING', createdAt: '' },
      { jobId: 'j1', status: 'COMPLETED', createdAt: '' },
    ]);

    const promise = pollJobUntilDone('j1', getJobStatusFn, { intervalMs: INTERVAL_MS, timeoutMs: TIMEOUT_MS });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
    expect(getJobStatusFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await promise;
    expect(getJobStatusFn).toHaveBeenCalledTimes(2);
  });

  it('rejects with AbortError when signal is aborted before the first fetch', async () => {
    const controller = new AbortController();
    controller.abort();

    const getJobStatusFn = makeGetJobStatusFn([
      { jobId: 'j1', status: 'PROCESSING', createdAt: '' },
    ]);

    const err = await pollJobUntilDone('j1', getJobStatusFn, { intervalMs: INTERVAL_MS, timeoutMs: TIMEOUT_MS, signal: controller.signal })
      .catch((e: unknown) => e);

    expect((err as Error).name).toBe('AbortError');
    expect(getJobStatusFn).not.toHaveBeenCalled();
  });

  it('rejects with AbortError when signal is aborted while sleeping between polls', async () => {
    const controller = new AbortController();
    const getJobStatusFn = makeGetJobStatusFn([
      { jobId: 'j1', status: 'PROCESSING', createdAt: '' },
    ]);

    const promise = pollJobUntilDone('j1', getJobStatusFn, { intervalMs: INTERVAL_MS, timeoutMs: TIMEOUT_MS, signal: controller.signal })
      .catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(0);
    expect(getJobStatusFn).toHaveBeenCalledTimes(1);

    controller.abort();
    await vi.advanceTimersByTimeAsync(INTERVAL_MS);

    const err = await promise;
    expect((err as Error).name).toBe('AbortError');
  });
});
