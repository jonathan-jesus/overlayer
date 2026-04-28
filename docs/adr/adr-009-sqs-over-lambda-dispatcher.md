# Architecture Decision Record (ADR)

### ADR 009: SQS over Lambda Dispatcher for Pipeline Coordination

- **Status:** Decided - Lambda Dispatcher approach **rejected**.

---

- **Context**
  The pipeline must react to S3 upload events and trigger FFmpeg rendering when both input files for a job (`video.mp4` and `overlay.png`) are present. A Lambda Dispatcher was considered as an intermediate step between S3 and the worker. Under this design, the Lambda would:
  1. Receive an S3 event notification directly from the bucket.
  2. Perform a sibling check (verify both files exist via `ListObjects` or `HeadObject`).
  3. Generate Presigned GET/PUT URLs for the worker.
  4. Make an HTTP `POST` to the worker's `/render` endpoint with the prepared payload.

- **Decision**
  The Lambda Dispatcher is **not adopted**. S3 events are published directly to an SQS queue with no intermediate Lambda. The Fargate worker dequeues messages from SQS and is solely responsible for all coordination and processing logic.

  **The chosen pipeline is:**

  ```
  S3 Event → SQS → Fargate Worker
  ```

  The worker performs the sibling check, idempotency guard, lock acquisition, and render execution internally (see [ADR 006](adr-006-decoupled-worker.md)).

---

- **Why the Lambda Dispatcher Was Rejected**

  ### 1. Duplicated Logic

  The sibling check, idempotency guard, and lock acquisition must all exist in the worker regardless of the Lambda's presence. SQS guarantees at-least-once delivery, meaning the worker could receive the same message twice even if the Lambda only emitted it once. The worker cannot trust that the Lambda has already validated readiness - it must do so itself. The Lambda's checks therefore become redundant, executed twice with no added value.

  ### 2. Increased Failure Surface

  The Lambda introduces a third execution environment with its own:
  - Cold start latency.
  - IAM role, memory limit, and timeout configuration.
  - Error handling and retry logic (Lambda's SQS trigger has its own retry and DLQ semantics separate from the worker's).
  - Deployment artefact and release cycle.

  A failure in the Lambda - timeout, throttle, misconfiguration - would silently block all jobs from ever reaching the worker. The Lambda becomes a single point of failure between S3 and processing, despite being designed as a simple pass-through.

  ### 3. Synchronous Orchestration in an Async Pipeline

  The Lambda design introduces a synchronous HTTP call at the point of dispatch: the Lambda must call the worker and wait for an acknowledgement before completing. This imposes a synchronous coordination step in a pipeline that is otherwise entirely event-driven and asynchronous. It also means the Lambda's execution window is now on the critical path - a slow or unavailable worker directly causes Lambda timeouts and message re-delivery. The S3 → SQS → Worker chain has no synchronous steps anywhere. The worker consumes messages at its own pace, and no component waits on another.

  ### 4. Presigned URL Complexity

  The Lambda's role would include generating short-lived Presigned URLs and injecting them into the worker payload. This creates a tight timing dependency: the URL's validity window begins at dispatch time, not at worker execution time. Under load or during scale-out, a worker might not begin execution until minutes after dispatch, consuming part of the URL's validity window before any actual work starts. The worker using its Fargate task IAM role for direct S3 access eliminates this fragility entirely.

  ### 5. Philosophical Misalignment

  The architectural principle is: **S3 is the state, SQS is the event buffer, the worker is the decision engine.** A Lambda performing sibling checks and dispatching render payloads violates this principle - it makes decisions that belong to the worker. The simplest, most consistent system routes events directly to the single entity responsible for acting on them.

---

- **Alternatives Considered**

  | Option                                  | Description                                                          | Outcome                                                                                            |
  | --------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
  | **Lambda checks + dispatches**          | Lambda receives S3 event, validates readiness, calls worker via HTTP | **Rejected** (this ADR)                                                                            |
  | **Lambda as pure forwarder (no logic)** | Lambda receives S3 event, publishes to SQS without any validation    | Rejected - adds infrastructure cost and complexity without benefit; S3 can publish to SQS directly |
  | **S3 → SQS → Worker (chosen)**          | S3 publishes events natively to SQS; worker owns all logic           | **Adopted**                                                                                        |

---

- **Future Reconsideration**
  Lambda may be reconsidered as a dispatcher in a future iteration when cost optimisation requires per-job ECS `RunTask` calls rather than a persistent Fargate fleet. In that scenario, the Lambda's role would be narrowly scoped to triggering a Fargate task, not to performing application-level coordination logic. This remains a future evolution path, not a current requirement.
