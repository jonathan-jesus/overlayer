# Architecture Decision Record (ADR)

### ADR 001: S3 as the State Machine (No Persistent Database)

- **Context**
  Tracking user sessions, job readiness, and completed renders in a traditional architecture requires a persistent database (SQL or NoSQL) to store and query job state. This introduces an always-on stateful dependency into an otherwise event-driven system, and couples the dispatch logic to a separate data layer that must be kept consistent with actual storage.
- **Decision**
  Use S3 prefix structure and object existence as the sole source of truth for job state. The presence or absence of specific objects within a `jobs/{SessionId}/{JobId}/` prefix is sufficient to determine whether a job is pending, ready to dispatch, or complete.
- **Consequences**
  The architecture becomes inherently event-driven - S3 object creation is itself the state transition trigger, eliminating the need for a separate write to a state store. The prefix design (`jobs/{SessionId}/{JobId}/`) must be deliberate to ensure `ListObjects` queries remain efficient and unambiguous. There is no separate reconciliation step between storage state and database state, because they are the same thing.
