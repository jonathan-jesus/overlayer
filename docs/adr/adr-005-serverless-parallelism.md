# Architecture Decision Record (ADR)

### ADR 005: Bounded Parallel Processing via Fargate Task Concurrency

- **Context**
  FFmpeg render jobs are independent of one another - there is no shared state between jobs that would require sequential processing. The question is whether to enforce a strict sequential queue or allow parallel execution, and how to prevent unbounded concurrency from causing resource exhaustion or cascading failures. The worker is hosted on Fargate and receives jobs via SQS.
- **Decision**
  Allow parallel job processing by running multiple Fargate task instances, each consuming messages concurrently from the SQS queue. Set a hard maximum task count on the ECS service to cap concurrent executions. Configure SQS message visibility timeout to align with the maximum expected render duration, ensuring failed tasks cause messages to become visible again without creating duplicate processing races.
- **Consequences**
  Jobs that arrive simultaneously are processed in parallel, improving throughput and perceived responsiveness without any additional queue management logic. The Fargate task ceiling acts as a circuit breaker - it defines the system's concurrency ceiling and prevents runaway execution. The S3 conditional write lock [ADR 009](adr-009-sqs-over-lambda-dispatcher.md) provides the final safety net: even if two workers dequeue the same message simultaneously, only one can acquire the lock and proceed - the other exits cleanly. As queue depth grows, ECS Application Auto Scaling can be configured to scale the task count up within the defined ceiling, then scale back down during idle periods.
