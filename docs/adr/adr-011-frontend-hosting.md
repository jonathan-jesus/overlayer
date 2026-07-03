# ADR 011: Frontend Hosting Strategy

## Context and Problem Statement

Our core backend infrastructure (API, Worker, Storage, Queues) is hosted on AWS using Lambda, Fargate, S3, and SQS, orchestrated via Pulumi. The frontend is a fully static Astro application with React islands. We need to decide where to host the static frontend assets.

We evaluated whether to keep the frontend hosting within our AWS ecosystem (S3 + CloudFront) or utilize an external, specialized edge platform (e.g., Vercel, Cloudflare Pages, Netlify).

## Evaluation Dimensions

### 1. Performance Implications

- **Asset Delivery (CDN):** Both CloudFront and specialized external platforms offer massive global edge networks. Cloudflare and Vercel often have a slight edge in TTFB (Time to First Byte) for static assets due to aggressive edge caching optimizations out-of-the-box, but CloudFront is highly performant.
- **API Latency (The Browser Context):** Because the Astro frontend is completely static, all API calls to the backend (`POST /api/jobs/...`) are made **directly from the user's browser**, not from the frontend hosting server. Therefore, the physical distance between the external CDN and our AWS region does not affect API latency.
- **CORS & Connection Overhead (The Main Penalty):** Hosting outside of AWS usually means the API lives on a separate domain (e.g., `api.overlayer.com`) from the frontend (`overlayer.com`). This forces the browser to perform a separate DNS lookup, establish a second TLS connection for the API, and execute CORS (Cross-Origin Resource Sharing) preflight `OPTIONS` requests before the actual API requests. This adds a latency penalty to the initial API interaction. Hosting both the frontend and API behind a single AWS CloudFront distribution (using path routing like `/api/*`) eliminates this overhead entirely.

### 2. Operational Overhead & Infrastructure as Code (IaC)

- **AWS (CloudFront + S3):** Provides a "Single Pane of Glass." Infrastructure is entirely codified in our existing Pulumi setup, ensuring unified logging, billing, and IAM permissions.
- **External (e.g., Vercel / Cloudflare Pages):** Splits infrastructure state, requiring the team to manage configurations, API keys, and access controls across two distinct platforms, though they offer excellent out-of-the-box Developer Experience (DX).

### 3. Security

- **AWS (CloudFront + S3):** Placing the frontend and API behind the same CloudFront distribution eliminates CORS issues and allows enforcement of a unified AWS WAF (Web Application Firewall) policy across both static assets and the API.
- **External:** Requires strict CORS policies on the AWS API to only accept traffic from specific external frontend domains, and WAF rules must be managed separately.

## Decision Criteria Matrix

| Criteria                  | AWS (CloudFront + S3)                            | External Edge (Vercel/Cloudflare)                 |
| :------------------------ | :----------------------------------------------- | :------------------------------------------------ |
| **Asset Delivery Speed**  | High                                             | Very High                                         |
| **Initial API Latency**   | **Fastest** (Same domain = no CORS/TLS overhead) | **Slower** (Extra TLS handshake + CORS preflight) |
| **Developer Experience**  | Medium (Requires manual CI/CD setup)             | **Excellent** (Automated PR preview environments) |
| **Security & Compliance** | **Excellent** (Unified IAM & WAF)                | Good (Requires CORS management & split WAF)       |
| **IaC Unification**       | **Excellent** (100% Pulumi)                      | Poor (Split configuration state)                  |

## Decision

We will host the frontend using **AWS CloudFront and S3**.

### Rationale

By keeping the frontend hosting within AWS:

1. We maintain a unified infrastructure managed entirely via Pulumi.
2. We eliminate CORS completely and remove the TLS handshake penalty for our API calls by routing both the frontend and API through the same CloudFront distribution.
3. We align with our existing security model, utilizing a single AWS WAF policy for the entire application boundary.
