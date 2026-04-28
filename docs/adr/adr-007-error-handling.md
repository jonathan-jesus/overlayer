# Architecture Decision Record (ADR)

### ADR 007: Stateless Error Handling via Time-Based State Inference

- **Context**
  In an S3-driven state machine, graceful errors are handled by writing an explicit `error.json` tombstone to the `outputs/` prefix. However, if the Fargate worker experiences a hard crash - OOM kill, extreme timeout, or infrastructure failure - it cannot write anything. Without a separate mechanism to detect this, a job with inputs in `jobs/` and no output in `outputs/` would remain in a permanent `PROCESSING` state with no recovery path.
  Additionally, a retry mechanism must be designed carefully. Allowing users to immediately retry a failed job using existing uploaded files risks the "Poison Pill" pattern - where a structurally invalid file repeatedly dispatches and crashes the worker.
- **Decision**
  Implement **read-time state inference** combined with a **force re-upload** policy for failed jobs.

  **Clarification on Failure Types and Retries:**
  - **Transient Infrastructure Failures** (e.g., S3 network timeouts, concurrency lock collisions): Unhandled exceptions bubble up to the SQS polling loop. The message is _not_ deleted from SQS, allowing standard AWS visibility timeout mechanics to automatically retry the job.
  - **Terminal Business Failures** (e.g., invalid video dimensions, FFmpeg crashes): These are "Poison Pills." The worker catches these, writes an `error.json` tombstone to S3, and completes gracefully. The SQS message _is_ deleted, preventing any automatic retries.
  1. **Time-Based Inference:** During `GET /api/jobs`, the .NET API evaluates any job that has inputs in `jobs/` but no corresponding output or error file in `outputs/`. If the `LastModified` timestamp of the input video exceeds the maximum possible worker execution duration (e.g., 30 minutes), the API infers a silent crash and returns FAILED - without any background janitor process or scheduled reconciliation job.
  2. **Force Re-Upload:** For terminal business failures (or hard crashes that exhaust SQS retries), there is no retry mechanism using existing assets. A failed job is terminal. The user must initiate a new job and re-upload their files. Failed assets are left in place and expire via the standard S3 Lifecycle Rule.

- **Consequences (Positive)**
  - **Resilience Without Infrastructure:** The system handles silent worker crashes, OOM kills, and infrastructure dropouts without a polling function, a scheduled task, or any additional compute.
  - **Poison Pill Protection:** Forcing a re-upload introduces deliberate friction as a circuit breaker. A user cannot repeatedly dispatch a corrupted file - each retry requires a new upload, which naturally rate-limits abuse of the compute layer.

- **Consequences (Negative / Mitigation)**
  - **Friction on Transient Failures:** A user who experiences a genuine non-deterministic infrastructure failure must re-upload valid files.
    - _Mitigation:_ Accepted as a deliberate trade-off in favour of system stability. Where the failure was handled gracefully (an `error.json` exists), the UI surfaces the specific error reason so the user is informed before attempting a new upload.

- **`error.json` Tombstone Schema**

  When the worker encounters a graceful failure, it writes an `error.json` tombstone to the `outputs/{SessionId}/{JobId}/` prefix:

  ```json
  {
    "reason": "Video format not supported",
    "stage": "process",
    "timestamp": "2026-04-14T08:01:00Z"
  }
  ```

  | Field       | Type     | Description                                                                                                                                                                                                         |
  | ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `reason`    | `string` | Required. Human-readable error description. Surfaced directly as the `reason` field in the `GET /api/jobs` response.                                                                                                |
  | `stage`     | `string` | Required. The pipeline stage where the failure occurred. One of: `download` (failed to retrieve inputs via Presigned GET), `process` (FFmpeg execution error), `upload` (failed to write output via Presigned PUT). |
  | `timestamp` | `string` | Required. ISO 8601 UTC timestamp of when the failure was recorded.                                                                                                                                                  |
