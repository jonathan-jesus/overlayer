# ADR 012: API Rate Limiting

## Context

The API requires rate limiting to protect backend resources from abuse (e.g., creating excessive jobs or requesting too many upload URLs). Since the application allows anonymous use without required user authentication, standard identity-based rate limiting (like limiting by a registered user ID) is not fully applicable. We needed a solution that works for anonymous clients while remaining scalable across a distributed backend.

## Decision

We implemented a custom rate limiting solution using an ASP.NET Core Middleware backed by DynamoDB.

### Implementation Details

- **Fixed Window Counter:** The rate limit is calculated over a fixed time window (configured to 60 seconds by default) based on Unix time increments.
- **Dual Identifiers:** Requests are identified and throttled by two distinct limits to handle anonymous traffic:
  1. **Session ID:** Identified by the `X-Session-ID` header. This allows us to limit individual anonymous clients tracking their own sessions.
  2. **IP Address:** Identified via a client IP resolver. This acts as a secondary layer to prevent abuse from a single source attempting to bypass session-based limits by generating new session IDs.
- **DynamoDB Store:** A DynamoDB table is used to store the counters, allowing distributed state tracking across multiple API instances. Counters automatically expire using DynamoDB TTL (Time To Live).
- **Endpoint Policies:** Specific policies assigned per endpoint.

## Consequences

### Positive

- Protects the application against basic automated abuse and overwhelming traffic spikes.
- DynamoDB storage allows the rate limiter to work safely in a load-balanced, distributed serverless environment.
- Dual limiting handles the anonymous nature of the app (using Session IDs primarily, while IP limits prevent a single host from regenerating session IDs indefinitely to spam the API).

### Negative

- **Imperfect Protection:** Because the app allows anonymous use, a sophisticated attacker could rotate both IP addresses and session IDs to bypass the limits. This is an accepted limitation of the application's anonymous design.
- **Fixed Window Limitations:** A fixed window counter can suffer from traffic spikes at the edges of the time windows, unlike a sliding window log or token bucket algorithm.
- **Infrastructure Overhead:** Every rate-limited request incurs a DynamoDB update, which adds slight latency and costs.
