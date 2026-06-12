import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import JobStatusIsland from './JobStatusIsland';
import { TimeoutError } from '../../polling/pollingEngine';
import type { Job } from '../../api/apiClient';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: 'test-job-id',
    status: 'PROCESSING',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('JobStatusIsland', () => {
  it('shows a processing indicator while the job is in flight', () => {
    const getJobStatusFn = vi.fn(() => new Promise<Job | undefined>(() => { }));

    render(<JobStatusIsland jobId="test-job-id" getJobStatusFn={getJobStatusFn} />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows a download link when the job completes successfully', async () => {
    const completedJob = makeJob({
      status: 'COMPLETED',
      downloadUrl: 'https://cdn.example.com/output.mp4',
    });
    const getJobStatusFn = vi.fn(async () => completedJob);

    render(<JobStatusIsland jobId="test-job-id" getJobStatusFn={getJobStatusFn} />);

    const link = await screen.findByRole('link', { name: /download/i });
    expect(link).toHaveAttribute('href', 'https://cdn.example.com/output.mp4');
  });

  it('shows the failure reason when the job fails', async () => {
    const getJobStatusFn = vi.fn(async () =>
      makeJob({ status: 'FAILED', reason: 'Encoding error' })
    );

    render(<JobStatusIsland jobId="test-job-id" getJobStatusFn={getJobStatusFn} />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/encoding error/i)
    );
  });

  it('shows a timeout message when polling times out', async () => {
    const getJobStatusFn = vi.fn(async (): Promise<Job | undefined> => {
      throw new TimeoutError('test-job-id', 100);
    });

    render(<JobStatusIsland jobId="test-job-id" getJobStatusFn={getJobStatusFn} />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/timed out/i)
    );
  });
});
