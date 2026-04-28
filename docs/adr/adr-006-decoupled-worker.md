# Architecture Decision Record (ADR)

### ADR 006: Worker as Single Decision Point (No Lambda Orchestration)

- **Context**
  When an S3 upload event arrives, the system must determine whether both required files (`video.mp4` and `overlay.png`) exist before triggering a render. A separate orchestration layer could perform this check before the worker is involved. The question is where this logic should live: in an intermediate Lambda function, or in the worker itself.
- **Decision**
  The Fargate worker is the single decision point for all processing logic. S3 events are delivered to an SQS queue without any intermediate function. The worker dequeues messages and is solely responsible for:
  1. **Sibling validation** - checking via `HEAD` requests that both `video.mp4` and `overlay.png` exist in S3.
  2. **Idempotency** - aborting immediately if the output already exists.
  3. **Lock acquisition** - performing an atomic S3 conditional write (`PUT locks/... If-None-Match: *`) to prevent concurrent workers from processing the same job.
  4. **Execution** - invoking FFmpeg, uploading the result or error tombstone.

  There is no Lambda, no dispatcher service, and no orchestration layer between the SQS queue and the worker.

- **Consequences (Positive)**
  - **Single Failure Surface:** Removing the intermediate Lambda means there are fewer components to fail, monitor, and deploy. All observable behaviour is contained within the worker.
  - **Consistent Logic:** The sibling check, idempotency guard, and lock are co-located. They cannot diverge or produce inconsistent state across two separate codebases.
  - **Simplicity:** S3 → SQS → Worker is a three-component chain that is easy to trace, test, and reason about.

- **Consequences (Negative / Mitigation)**
  - **Higher No-Op Message Volume:** Every S3 upload triggers a message. When only one of the two files has been uploaded, the worker performs the sibling check and exits cleanly without processing. This results in some messages being processed as no-ops.
    - _Mitigation:_ No-op processing is extremely fast (two S3 `HEAD` requests + return). The cost and latency impact is negligible. SQS message volume remains bounded by the number of uploads (at most 2 messages per job).

- **Alternatives Considered**
  - **Option A: Lambda Dispatcher performs sibling check and calls Worker via HTTP** - Rejected. See [ADR 009](adr-009-sqs-over-lambda-dispatcher.md) for the full rationale.
