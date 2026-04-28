# Architecture Decision Record (ADR)

### ADR 002: Client-Side UUID for Anonymous Sessions

- **Context**
  The application must support isolated, per-user file namespacing without an authentication provider. Introducing Cognito, Auth0, or a custom session server would add significant operational complexity and create a stateful dependency that conflicts with the serverless architecture model.
- **Decision**
  The client generates a UUID stored in browser `localStorage` and passes it on every request via the `X-Session-ID` header. This ID is used directly as the top-level prefix in S3, providing clean logical isolation between users.
- **Consequences**
  Session identity maps directly and predictably to S3 folder structure, with no server-side session store required. If a user clears their browser storage, they lose access to their job history - an accepted trade-off given the short-lived nature of processed assets and the absence of user accounts. The server treats the `SessionId` as an opaque namespace key, not as an authenticated identity.
