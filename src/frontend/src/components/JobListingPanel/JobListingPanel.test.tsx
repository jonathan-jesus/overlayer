import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { apiHandlers } from '../../test/handlers/apiHandlers';
import JobListingPanel from './JobListingPanel';
import type { Job, JobStatus } from '../../api/apiClient';

const server = setupServer(...apiHandlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.clearAllTimers();
});
afterAll(() => server.close());

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    jobId: 'test-job-id-' + Math.random().toString(36).substring(7),
    status: 'COMPLETED' as JobStatus,
    createdAt: new Date('2026-07-10T12:00:00Z').toISOString(),
    ...overrides,
  };
}

describe('JobListingPanel', () => {
  it('shows a loading indicator on mount (before the first fetch resolves)', () => {
    // We don't await the render so we can catch the initial loading state
    render(<JobListingPanel />);
    expect(screen.getByText(/loading jobs/i)).toBeInTheDocument();
  });

  it('shows "No jobs yet." when the API returns an empty list', async () => {
    // Default apiHandler returns []
    render(<JobListingPanel />);
    await waitFor(() => {
      expect(screen.getByText(/no jobs yet/i)).toBeInTheDocument();
    });
  });

  it('shows rate limit message during initial load if 429 is encountered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    server.use(
      http.get('/api/jobs', () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '10' } }))
    );
    render(<JobListingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Rate limit reached. Waiting for cooldown...')).toBeInTheDocument();
    });
    vi.useRealTimers();
  });

  it('renders a row for each job returned', async () => {
    server.use(
      http.get('/api/jobs', () => HttpResponse.json({ jobs: [makeJob(), makeJob()] }))
    );
    render(<JobListingPanel />);

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });
  });

  it('displays truncated job ID (first 8 chars + …)', async () => {
    server.use(
      http.get('/api/jobs', () => HttpResponse.json({ jobs: [makeJob({ jobId: '1234567890' })] }))
    );
    render(<JobListingPanel />);

    await waitFor(() => {
      const idElement = screen.getByText('12345678…');
      expect(idElement).toBeInTheDocument();
      expect(idElement).toHaveAttribute('title', '1234567890');
    });
  });

  it('renders correct badge label per status', async () => {
    const jobs = [
      makeJob({ status: 'PROCESSING' }),
      makeJob({ status: 'MISSING_ASSETS' }),
      makeJob({ status: 'COMPLETED' }),
      makeJob({ status: 'FAILED' }),
    ];
    server.use(
      http.get('/api/jobs', () => HttpResponse.json({ jobs }))
    );
    render(<JobListingPanel />);

    await waitFor(() => {
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByText('Missing overlay')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  it('shows the download link only for COMPLETED jobs with a downloadUrl', async () => {
    server.use(
      http.get('/api/jobs', () => HttpResponse.json({
        jobs: [
          makeJob({ status: 'COMPLETED', downloadUrl: 'https://example.com/video.mp4' }),
          makeJob({ status: 'COMPLETED', downloadUrl: undefined })
        ]
      }))
    );
    render(<JobListingPanel />);

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
    });

    const listItems = screen.getAllByRole('listitem');
    
    // First job has download url
    const downloadLink = within(listItems[0]).getByRole('link', { name: /download/i });
    expect(downloadLink).toHaveAttribute('href', 'https://example.com/video.mp4');
    expect(downloadLink).toHaveAttribute('download');

    // Second job does not
    expect(within(listItems[1]).queryByRole('link', { name: /download/i })).not.toBeInTheDocument();
  });

  it('shows "Resume job creation" button for MISSING_ASSETS jobs and calls onActionDesign when clicked', async () => {
    const jobId = 'missing-assets-job-1';
    server.use(
      http.get('/api/jobs', () => HttpResponse.json({ jobs: [makeJob({ jobId, status: 'MISSING_ASSETS' })] }))
    );
    const onActionDesign = vi.fn();
    const user = userEvent.setup();
    render(<JobListingPanel onActionDesign={onActionDesign} />);

    const button = await screen.findByRole('button', { name: /resume job creation/i });
    await user.click(button);

    expect(onActionDesign).toHaveBeenCalledOnce();
    expect(onActionDesign).toHaveBeenCalledWith(jobId);
  });

  it('shows "See details" button for FAILED jobs and opens modal with reason', async () => {
    server.use(
      http.get('/api/jobs', () => HttpResponse.json({
        jobs: [makeJob({ status: 'FAILED', reason: 'Invalid video format' })]
      }))
    );
    const user = userEvent.setup();
    render(<JobListingPanel />);

    const detailsButton = await screen.findByRole('button', { name: /see details/i });
    expect(detailsButton).toBeInTheDocument();
    
    expect(screen.queryByText('Invalid video format')).not.toBeInTheDocument();

    await user.click(detailsButton);

    expect(screen.getByText('Invalid video format')).toBeInTheDocument();
    
    const okButton = screen.getByRole('button', { name: /ok/i });
    await user.click(okButton);
    
    expect(screen.queryByText('Invalid video format')).not.toBeInTheDocument();
  });

  it('closes the modal when clicking outside of it (on the backdrop)', async () => {
    server.use(
      http.get('/api/jobs', () => HttpResponse.json({
        jobs: [makeJob({ status: 'FAILED', reason: 'Some error' })]
      }))
    );
    const user = userEvent.setup();
    const { container } = render(<JobListingPanel />);

    const detailsButton = await screen.findByRole('button', { name: /see details/i });
    await user.click(detailsButton);

    expect(screen.getByText('Some error')).toBeInTheDocument();

    const dialog = container.querySelector('.job-listing__modal');
    if (dialog) await user.click(dialog);

    expect(screen.queryByText('Some error')).not.toBeInTheDocument();
  });

  it('shows fallback message when FAILED job has no reason', async () => {
    server.use(
      http.get('/api/jobs', () => HttpResponse.json({
        jobs: [makeJob({ status: 'FAILED', reason: undefined })]
      }))
    );
    const user = userEvent.setup();
    render(<JobListingPanel />);

    const detailsButton = await screen.findByRole('button', { name: /see details/i });
    await user.click(detailsButton);

    expect(screen.getByText('Unknown error.')).toBeInTheDocument();
  });

  it('non-terminal jobs have the processing row class and a spinner', async () => {
    server.use(
      http.get('/api/jobs', () => HttpResponse.json({
        jobs: [makeJob({ status: 'PROCESSING' })]
      }))
    );
    render(<JobListingPanel />);

    await waitFor(() => {
      expect(screen.getByRole('listitem')).toHaveClass('job-listing__row--processing');
      // The spinner has aria-hidden="true" in the component, so we can't query by role easily
      // We can query by class name instead
      const spinner = screen.getByRole('listitem').querySelector('.job-listing__spinner');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('polling', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('polling starts when there are non-terminal jobs and stops once all reach terminal status', async () => {
      let callCount = 0;
      server.use(
        http.get('/api/jobs', () => {
          callCount++;
          if (callCount === 1) {
            // First fetch: one non-terminal job
            return HttpResponse.json({ jobs: [makeJob({ status: 'PROCESSING' })] });
          } else {
            // Second fetch: job is terminal
            return HttpResponse.json({ jobs: [makeJob({ status: 'COMPLETED' })] });
          }
        })
      );
      
      render(<JobListingPanel />);

      // Wait for initial fetch to resolve
      await waitFor(() => {
        expect(screen.getByText('Processing')).toBeInTheDocument();
      });

      // Advance time by 10s (POLL_INTERVAL_MS)
      await vi.advanceTimersByTimeAsync(10_000);

      // Wait for second fetch to update UI
      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument();
      });

      expect(callCount).toBe(2);

      // Advance time again. Since jobs are terminal, it shouldn't poll anymore
      await vi.advanceTimersByTimeAsync(10_000);
      
      // Call count should still be 2
      expect(callCount).toBe(2);
    });

    it('shows rate limit banner during polling if 429 is encountered', async () => {
      let callCount = 0;
      server.use(
        http.get('/api/jobs', () => {
          callCount++;
          if (callCount === 1) {
            return HttpResponse.json({ jobs: [makeJob({ status: 'PROCESSING' })] });
          } else {
            return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '10' } });
          }
        })
      );
      
      render(<JobListingPanel />);

      await waitFor(() => {
        expect(screen.getByText('Processing')).toBeInTheDocument();
      });

      // trigger next poll
      await vi.advanceTimersByTimeAsync(10_000);

      await waitFor(() => {
        expect(screen.getByText('Rate limit reached. Waiting for cooldown...')).toBeInTheDocument();
      });
    });
  });
});
