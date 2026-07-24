import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job } from '../../api/apiClient';
import { listJobs, RateLimitError } from '../../api/apiClient';
import './JobListingPanel.css';

const POLL_INTERVAL_MS = 10_000;

function isProcessing(job: Job): boolean {
  return job.status === 'PROCESSING';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatusBadge({ status }: { status: Job['status'] }) {
  const label: Record<Job['status'], string> = {
    PROCESSING: 'Processing',
    MISSING_ASSETS: 'Missing overlay',
    COMPLETED: 'Completed',
    FAILED: 'Failed',
  };

  return (
    <span className={`job-listing__badge job-listing__badge--${status.toLowerCase()}`}>
      {label[status]}
    </span>
  );
}

const STATUS_ORDER: Record<Job['status'], number> = {
  MISSING_ASSETS: 1,
  PROCESSING: 2,
  FAILED: 3,
  COMPLETED: 4,
};

function sortJobs(jobs: Job[]): Job[] {
  return [...jobs].sort((a, b) => {
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) {
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

interface JobListingPanelProps {
  onActionDesign?: (jobId: string) => void;
}

export default function JobListingPanel({ onActionDesign }: JobListingPanelProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopPolling = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (timeoutRef.current !== null) return;

    const poll = async () => {
      let delay = POLL_INTERVAL_MS;
      try {
        const { jobs: updated } = await listJobs({
          onRateLimit: () => setIsRateLimited(true),
        });
        setIsRateLimited(false);
        setJobs(sortJobs(updated));
        if (!updated.some(isProcessing)) {
          stopPolling();
          return;
        }
      } catch (error) {
        if (error instanceof RateLimitError) {
          console.warn(`Rate limit hit, pausing polling for ${error.retryAfterMs}ms`);
          delay = error.retryAfterMs;
          setIsRateLimited(true);
        } else {
          console.error('Failed to list jobs during poll:', error);
          setIsRateLimited(false);
        }
      }
      timeoutRef.current = setTimeout(poll, delay);
    };

    timeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS);
  }, [stopPolling]);

  useEffect(() => {
    listJobs({
      onRateLimit: () => setIsRateLimited(true),
    })
      .then(({ jobs: fetched }) => {
        setIsRateLimited(false);
        setJobs(sortJobs(fetched));
        setIsLoading(false);
        if (fetched.some(isProcessing)) {
          startPolling();
        }
      })
      .catch((error) => {
        console.error('Failed to list jobs:', error);
        if (error instanceof RateLimitError) {
          setIsRateLimited(true);
        } else {
          setIsRateLimited(false);
        }
        setIsLoading(false);
      });

    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return (
    <section className="job-listing app__section" aria-label="Job history">
      <h2 className="app__section-title">Your jobs</h2>

      {!isLoading && isRateLimited && (
        <p role="alert" className="job-listing__error">
          Rate limit reached. Waiting for cooldown...
        </p>
      )}

      {isLoading ? (
        <ul className="job-listing__list" role="list">
          <li className="job-listing__row" style={{ display: 'flex', justifyContent: 'center' }}>
            <span className="job-listing__empty" style={{ padding: 0 }}>
              <span className="job-listing__spinner" aria-hidden="true" style={{ marginRight: '8px', display: 'inline-block' }} />
              {isRateLimited ? 'Rate limit reached. Waiting for cooldown...' : 'Loading jobs...'}
            </span>
          </li>
        </ul>
      ) : jobs.length === 0 ? (
        <ul className="job-listing__list" role="list">
          <li className="job-listing__row" style={{ display: 'flex', justifyContent: 'center' }}>
            <span className="job-listing__empty" style={{ padding: 0 }}>No jobs yet.</span>
          </li>
        </ul>
      ) : (
        <ul className="job-listing__list" role="list">
          {jobs.map((job) => (
            <li
              key={job.jobId}
              className={`job-listing__row ${isProcessing(job) ? 'job-listing__row--processing' : ''}`}
            >
              <span className="job-listing__id" title={job.jobId}>
                {job.jobId.slice(0, 8)}…
              </span>

              <span className="job-listing__date">{formatDate(job.createdAt)}</span>

              <div className="job-listing__status">
                {isProcessing(job) && (
                  <span className="job-listing__spinner" aria-hidden="true" />
                )}
                <StatusBadge status={job.status} />
              </div>

              <div className="job-listing__action">
                {job.status === 'MISSING_ASSETS' && onActionDesign && (
                  <button
                    onClick={() => onActionDesign(job.jobId)}
                    className="job-listing__download"
                    style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Resume job creation
                  </button>
                )}
                {job.status === 'COMPLETED' && job.downloadUrl && (
                  <a
                    href={job.downloadUrl}
                    className="job-listing__download"
                    download
                  >
                    Download
                  </a>
                )}
                {job.status === 'FAILED' && (
                  <button
                    className="job-listing__details-btn"
                    onClick={() => setErrorDetail(job.reason || 'Unknown error.')}
                  >
                    See details
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {errorDetail && (
        <dialog
          className="job-listing__modal"
          open
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setErrorDetail(null);
            }
          }}
        >
          <div className="job-listing__modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="job-listing__modal-title">Job failed</h3>
            <p className="job-listing__modal-body">{errorDetail}</p>
            <div className="job-listing__modal-actions">
              <button
                className="job-listing__modal-ok"
                onClick={() => setErrorDetail(null)}
              >
                Ok
              </button>
            </div>
          </div>
        </dialog>
      )}
    </section>
  );
}
