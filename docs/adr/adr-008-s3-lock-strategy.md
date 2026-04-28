# Architecture Decision Record (ADR)

### ADR 008: S3 Conditional Write as Worker Lock Strategy

- **Context**
  Multiple Fargate task instances may dequeue the same SQS message simultaneously - either due to SQS at-least-once delivery guarantees or during scale-out events. Without coordination, two workers could pass the sibling check and each attempt to render the same job, wasting compute and risking corrupted output if writes overlap.
  A distributed lock is required. The solution must be atomic, introduce no additional infrastructure dependencies, and align with the system's core principle of using S3 as the state machine.
- **Decision**
  Use an S3 conditional `PUT` (with `If-None-Match: *`) as the locking primitive. Before processing any job, the worker attempts to create a lock object:

  ```
  PUT  locks/{sessionId}/{jobId}.lock
  Header: If-None-Match: *
  ```

  If the object does not exist, S3 creates it atomically and returns `200 OK`. The worker holds the lock and proceeds. If another worker already created the object, S3 returns `412 Precondition Failed`. The worker treats this as a clean exit - the job is already owned.

  Lock objects are stored under the `locks/` prefix, which is deliberately outside the `jobs/` prefix to avoid triggering new S3 event notifications.

- **Consequences (Positive)**
  - **Atomic by Design:** S3's conditional write is a server-side atomic operation. There is no race window during lock creation.
  - **No New Infrastructure:** The lock mechanism requires no DynamoDB table, no Redis cluster, and no additional IAM policies beyond the existing S3 bucket access the worker already holds.
  - **Prefix Isolation:** Using `locks/` as a dedicated prefix means lock objects never appear in job listings or trigger processing events.

- **Consequences (Negative / Mitigation)**
  - **Stale Locks on Worker Crash:** If a worker acquires the lock and crashes before completing, the lock object persists indefinitely, blocking any future retry for that job.
    - _Mitigation (v1):_ Accepted as a known limitation. Stale jobs are detected by the API's time-based inference [ADR 007](adr-007-error-handling.md) and surfaced as `FAILED`. In a future iteration, lock objects can include a creation timestamp in their metadata and be cleaned up by a scheduled rule or TTL-equivalent lifecycle policy.
  - **No Native Lock TTL:** S3 objects have no built-in TTL unless an S3 Lifecycle Rule is configured.
    - _Mitigation (v1):_ An S3 Lifecycle Rule is configured on the `locks/` prefix to delete objects after a period exceeding the maximum expected job duration (e.g., 1 hour). This is a **cleanup-only infrastructure rule** - it has no effect on application logic. The worker only evaluates whether a lock object _exists_ at the moment of acquisition; it never inspects the object's age or metadata. The rule ensures stale locks from crashed workers do not accumulate indefinitely in the bucket.
