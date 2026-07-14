import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job } from '../../api/apiClient';
import { listJobs } from '../../api/apiClient';
import './JobListingPanel.css';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED']);
const POLL_INTERVAL_MS = 10_000;

function isNonTerminal(job: Job): boolean {
  return !TERMINAL_STATUSES.has(job.status);
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

interface JobListingPanelProps {
  onActionDesign?: (jobId: string) => void;
}

export default function JobListingPanel({ onActionDesign }: JobListingPanelProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current !== null) return;

    intervalRef.current = setInterval(async () => {
      const { jobs: updated } = await listJobs();
      setJobs(updated);
      if (updated.every((j) => TERMINAL_STATUSES.has(j.status))) {
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  useEffect(() => {
    listJobs()
      .then(({ jobs: fetched }) => {
        setJobs(fetched);
        setIsLoading(false);
        if (fetched.some(isNonTerminal)) {
          startPolling();
        }
      })
      .catch((error) => {
        console.error('Failed to list jobs:', error);
        setIsLoading(false);
      });

    return () => stopPolling();
  }, [startPolling, stopPolling]);

  return (
    <section className="job-listing app__section" aria-label="Job history">
      <h2 className="app__section-title">Your jobs</h2>

      {isLoading ? (
        <ul className="job-listing__list" role="list">
          <li className="job-listing__row" style={{ display: 'flex', justifyContent: 'center' }}>
            <span className="job-listing__empty" style={{ padding: 0 }}>
              <span className="job-listing__spinner" aria-hidden="true" style={{ marginRight: '8px', display: 'inline-block' }} />
              Loading jobs...
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
              className={`job-listing__row ${isNonTerminal(job) ? 'job-listing__row--processing' : ''}`}
            >
              <span className="job-listing__id" title={job.jobId}>
                {job.jobId.slice(0, 8)}…
              </span>

              <span className="job-listing__date">{formatDate(job.createdAt)}</span>

              <div className="job-listing__status">
                {isNonTerminal(job) && job.status !== 'MISSING_ASSETS' && (
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
