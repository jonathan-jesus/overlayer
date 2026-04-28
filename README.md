# Overlayer

A serverless, database-free video processing pipeline that composites an image overlay onto a base video using FFmpeg. Users upload a video and either upload or draw an overlay image via an interactive canvas, and the system renders the combined output - fully event-driven, with no persistent infrastructure beyond object storage.

The project demonstrates production-grade cloud architecture on **AWS**, emphasising composability, decoupling, and deliberate technology selection over convenience.

## Architecture Overview

The pipeline is organised into four layers, each mapped to a specific cloud-native primitive:

| Layer               | Primitive & Details                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend**        | Astro (Static) + React Island (Canvas Designer).                                                                                |
| **API**             | .NET 10 Minimal API on AWS Lambda. Generates Presigned POST URLs - infers job state at read-time from S3 prefixes.              |
| **Storage & State** | AWS S3 (Private Bucket) - acts as both storage and state machine. No database. Prefix convention: `jobs/{SessionId}/{JobId}/`   |
| **Event Bus**       | AWS SQS Queue. Receives S3 Event Notifications (`s3:ObjectCreated:*`).                                                          |
| **Compute**         | .NET 10 Worker on AWS Fargate (Docker). Dequeues SQS → Sibling check → S3 Lock → renders FFmpeg output to S3 `outputs/` prefix. |

### Data Flow

1. **Client** generates a UUID session, uploads a video and overlay image directly to S3 via Presigned POST URLs obtained from the API.
2. **S3 Event Notification** fires on each `s3:ObjectCreated:*` in the `jobs/` prefix, pushing facts directly to an **SQS Queue**.
3. **Worker (Fargate)** dequeues the SQS message and performs a "Sibling Check" - verifying both `video.mp4` and `overlay.png` exist for a job.
4. If ready, the **Worker** acquires an S3 distributed lock, runs FFmpeg to composite the overlay, and uploads the result (or an `error.json` tombstone) directly to S3 via its IAM role.
5. **Client** polls `GET /api/jobs` - the API infers job state (`PROCESSING`, `COMPLETED`, `FAILED`) at read-time from S3 object existence and timestamps.

> Key architectural decisions are documented as [Architecture Decision Records](docs/adr/).

## Repository Structure

Production code (`src/`) and test code (`tests/`) are separated following standard .NET solution conventions.

```text
overlayer/
├── docs/                                # Documentation
│
├── infra/                               # Pulumi Infrastructure as Code
│
├── src/
│   └── backend/
│       ├── Overlayer.Shared/            # Domain POCOs, DTOs, enums, S3 constants
│       ├── Overlayer.Api/               # .NET 10 Minimal API (AWS Lambda)
│       └── Overlayer.Worker/            # FFmpeg processor (Fargate)
│
└── tests/
    ├── Overlayer.TestSupport/           # Shared test utilities (LocalStack, WireMock helpers)
    ├── Overlayer.Api.Tests/
    └── Overlayer.Worker.Tests/
```

### Projects & Technologies

| Project              | Role                                             | Stack                 | Hosting          |
| -------------------- | ------------------------------------------------ | --------------------- | ---------------- |
| **Overlayer.Shared** | Domain models, DTOs, constants                   | .NET 10, C#           | -                |
| **Overlayer.Api**    | Presigned URL generation, job status             | .NET 10, Minimal APIs | AWS Lambda       |
| **Overlayer.Worker** | SQS consumer, S3 sibling check, FFmpeg execution | .NET 10, C#, FFmpeg   | Fargate (Docker) |

## Quality Strategy

The project follows an **outside-in TDD** approach with a layered test strategy per service. Tests are organised into outer-loop (acceptance/integration) and inner-loop (unit) tiers.

### Overlayer.Api

| Tier           | Scope                            | Approach                                                                                    |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------- |
| **Acceptance** | Full HTTP request/response cycle | `WebApplicationFactory` tests validated against [contract.md](docs/contract.md)             |
| **Unit**       | Service logic in isolation       | Mocked `AWSSDK.S3` interfaces; validates URL generation rules and read-time state inference |

### Overlayer.Worker

| Tier            | Scope                         | Approach                                                                         |
| --------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| **Integration** | Real FFmpeg execution         | LocalStack S3 + SQS + real FFmpeg binary; verifies output generation             |
| **Unit**        | Command builder, worker logic | Sibling check, S3 lock strategy, idempotency logic, FFmpeg argument construction |

> Full details in [tdd-strategy.md](docs/tdd-strategy.md).

## Constraints

### Deliberate Architectural Constraints

- **No Database.** S3 is the sole source of truth for state. Job status is inferred at read-time from object existence and timestamps ([ADR 001](docs/adr/adr-001-s3-as-state.md)).
- **No Authentication Provider.** Session isolation is enforced via client-generated UUIDs passed as `X-Session-ID`. If the user clears browser storage, job history is lost ([ADR 002](docs/adr/adr-002-client-uuid-sessions.md)).
- **No Lambda Orchestration.** S3 Event Notifications push to an SQS queue. The worker alone consumes events and makes all coordination decisions, removing intermediate failure points ([ADR 006](docs/adr/adr-006-decoupled-worker.md) & [ADR 009](docs/adr/adr-009-sqs-over-lambda-dispatcher.md)).
- **Direct S3 Access via IAM.** The Fargate worker uses its task IAM role for direct S3 access, obtaining conditional locks and rendering files without relying on short-lived presigned URL handoffs.
- **No Retry on Failed Jobs.** Failed jobs are terminal. The user must re-upload files to create a new job, preventing the "Poison Pill" pattern where corrupted files repeatedly crash the worker ([ADR 007](docs/adr/adr-007-error-handling.md)).

### Operational Constraints

- **Configurable Ingestion Limits.** Upload sizes are capped per file type (default: 10 MB video, 4 MB overlay) to prevent abuse in an unauthenticated system. Limits are configurable via environment variables, enforced at the S3 edge via Presigned POST policies, and surfaced in the API response so the frontend validates client-side before upload.
- **Worker Concurrency Ceiling.** Fargate's maximum task count acts as a circuit breaker against resource exhaustion ([ADR 005](docs/adr/adr-005-serverless-parallelism.md)).
- **Asset Expiry.** S3 Lifecycle Rules auto-delete objects in both the `jobs/` and `processed/` prefixes.
- **Client-Side Rendering.** Canvas-to-PNG conversion happens in the browser. Resolution and quality decisions are made client-side ([ADR 003](docs/adr/adr-003-canvas-rendering.md)).
- **Stateless API.** The API has no server-side session store and no write-back to any state layer. All state is derived from S3 at query time.
