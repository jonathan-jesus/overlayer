# Architecture Decision Record (ADR)

### ADR 010: Independent Per-Job Polling Loops (No Shared Coordinator)

- **Context**
  The polling engine (`pollJobUntilDone`) accepts a `getJobStatusFn: () => Promise<Job | undefined>` closure that is pre-bound to a single `jobId` at the call site. Internally, that closure calls `GET /api/jobs` — which returns all jobs for the session — and filters the result down to the one job it cares about. When multiple jobs are polled concurrently, each job's independent loop issues its own `GET /api/jobs` request on every tick. With N jobs in progress, the client makes N requests per 10-second interval, each returning all session jobs but discarding N-1 of them. The waste scales linearly with concurrent job count.

- **Decision**
  Accept the per-job independent loop approach and do not introduce a shared polling coordinator at this time. The primary use case is a user uploading a single video-plus-overlay pair; simultaneous concurrent jobs are possible but not a core scenario. The 10-second polling interval is already conservative, and the extra network cost of a small number of redundant requests is negligible in practice. A `JobPollingCoordinator` — a single shared loop that calls `listJobs()` once per interval and dispatches results to all registered per-job subscribers — would be the correct architectural fix but adds meaningful complexity for a problem that does not yet manifest as a user-facing issue.

- **Consequences**
  The current design is correct for a single concurrent job and acceptable for a small number of concurrent jobs. If the product evolves to support batch uploads, a job history dashboard, or any feature that drives many simultaneous in-progress jobs, the per-job loop model should be replaced with a shared coordinator. The abstraction boundary introduced by `getJobStatusFn` is already compatible with that future refactor: the coordinator would simply inject a different implementation of `getJobStatusFn` that reads from a shared in-memory cache populated by the single shared loop, leaving `pollJobUntilDone` itself unchanged.
