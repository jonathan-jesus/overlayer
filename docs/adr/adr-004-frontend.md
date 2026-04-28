# Architecture Decision Record (ADR)

### ADR 004: Micro-Frontend with Astro + React Islands

- **Context**
  The application has two distinct frontend concerns with conflicting requirements: a highly stateful, interactive canvas designer, and a largely static shell for routing, dashboards, and content delivery. Treating the entire frontend as a single React SPA would impose unnecessary JavaScript overhead on every page. Introducing SSR adds server infrastructure that conflicts with the goal of fully static hosting.
- **Decision**
  Use Astro as the static site generator for routing and all standard UI. Embed the canvas designer as a React Island (`client:load`) - a hydrated interactive component scoped strictly to where stateful interactivity is required.
- **Consequences**
  The interactive boundary is explicit and contained. Static pages receive zero JavaScript overhead. The React component lifecycle only runs where it is architecturally justified. The application can be hosted entirely on a CDN with no origin server, while still supporting the complex stateful UI that the canvas feature requires.
