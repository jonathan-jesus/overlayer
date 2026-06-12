import { useEffect, useState } from 'react';
import type { Job } from '../../api/apiClient';
import { listJobs } from '../../api/apiClient';
import { pollJobUntilDone, JobFailedError, TimeoutError } from '../../polling/pollingEngine';
import './JobStatusIsland.css';

interface JobStatusIslandProps {
  jobId: string;
  getJobStatusFn?: () => Promise<Job | undefined>;
}

type StatusState =
  | { kind: 'processing' }
  | { kind: 'completed'; job: Job }
  | { kind: 'failed'; reason: string }
  | { kind: 'timeout' };

export default function JobStatusIsland({ jobId, getJobStatusFn }: JobStatusIslandProps) {
  const [status, setStatus] = useState<StatusState>({ kind: 'processing' });

  useEffect(() => {
    const bridgeFn =
      getJobStatusFn ??
      (() => listJobs().then(({ jobs }) => jobs.find((j) => j.jobId === jobId)));

    pollJobUntilDone(jobId, bridgeFn)
      .then((job) => setStatus({ kind: 'completed', job }))
      .catch((err) => {
        if (err instanceof TimeoutError) {
          setStatus({ kind: 'timeout' });
        } else if (err instanceof JobFailedError) {
          setStatus({ kind: 'failed', reason: err.message });
        } else {
          setStatus({ kind: 'failed', reason: 'An unexpected error occurred.' });
        }
      });
  }, [jobId, getJobStatusFn]);

  if (status.kind === 'processing') {
    return (
      <div className="job-status job-status--processing" role="status" aria-label="Processing">
        <span className="job-status__spinner" aria-hidden="true" />
        <p className="job-status__label">Processing your video…</p>
      </div>
    );
  }

  if (status.kind === 'completed') {
    return (
      <div className="job-status job-status--completed">
        <p className="job-status__heading">Your video is ready!</p>
        <a
          href={status.job.downloadUrl}
          className="job-status__download"
          download
        >
          Download
        </a>
      </div>
    );
  }

  if (status.kind === 'failed') {
    return (
      <div className="job-status job-status--failed" role="alert">
        <p className="job-status__heading">Processing failed</p>
        <p className="job-status__reason">{status.reason}</p>
      </div>
    );
  }

  return (
    <div className="job-status job-status--timeout" role="alert">
      <p className="job-status__heading">Timed out</p>
      <p className="job-status__reason">
        Your video is taking longer than expected. It may still be processing — check back later.
      </p>
    </div>
  );
}
