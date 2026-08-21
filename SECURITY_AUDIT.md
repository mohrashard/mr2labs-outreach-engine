# MR² Labs Outreach Engine — SAST Security Audit & Penetration Test Report

**Audit Date:** August 21, 2026  
**Auditor:** Senior Cloud Security Engineer  
**Scope:** Next.js `/src` directory, API routes, Auth middleware, and external service integrations  
**Final Status:** PASS — Hardened & Approved for Production Deployment  

---

## Executive Summary

A comprehensive Static Application Security Testing (SAST) audit was conducted across the codebase to identify potential attack vectors, unauthorized access points, secret leakages, or SSRF risks before deployment to Vercel. 

The architecture successfully passed all critical checks. All server-side secrets remain completely isolated from client bundles, Supabase Admin service-role keys are strictly kept server-side, QStash background queues use cryptographic signature verification, and SSRF prevention guards have been applied to outbound DOM fetchers.

---

## Vulnerability Findings & Assessment Matrix

| ID | Vulnerability Category | Risk Level | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Environment Secret Leakage | **CRITICAL** | Audit for `NEXT_PUBLIC_` misuse on sensitive API keys. | **PASS** (Zero secret leaks found) |
| **SEC-02** | Supabase Service Role Isolation | **CRITICAL** | Verify `supabaseAdmin` is never imported into client `.tsx` components. | **PASS** (Strictly server-side only) |
| **SEC-03** | Middleware & Auth Guards | **HIGH** | Confirm `/login` redirection for unauthenticated users & background API exemptions. | **PASS** (Enforced in `middleware.ts`) |
| **SEC-04** | QStash Queue Verification | **HIGH** | Ensure `upstash-signature` headers are cryptographically verified on worker routes. | **PASS** (Verified with `Receiver`) |
| **SEC-05** | Brevo Inbound Webhook Auth | **HIGH** | Unauthenticated webhook endpoint vulnerable to arbitrary lead status spoofing. | **FIXED** (Secret token verification added) |
| **SEC-06** | SSRF & Domain Validation | **MEDIUM** | Outbound DOM fetcher vulnerable to internal IP scanning (SSRF). | **FIXED** (IP/Host validation guard added) |

---

## Detailed Audit Results by Vector

### 1. Environment Variable Leakage (CRITICAL)
- **Check:** Scanned all `process.env` references across `/src`.
- **Findings:**
  - `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `QSTASH_TOKEN`, `BREVO_API_KEY`, `SERPER_API_KEY`, `APOLLO_KEY`, `PROSPEO_API`, `HUNTER_API_KEY`, and `SNOV_API` are exclusively referenced on the server.
  - `NEXT_PUBLIC_` prefix is strictly restricted to non-sensitive public variables:
    - `NEXT_PUBLIC_SUPABASE_URL`
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
    - `NEXT_PUBLIC_APP_URL`
- **Result:** **PASSED.** No sensitive keys are exposed to the client bundle.

---

### 2. Supabase Service Role Isolation (CRITICAL)
- **Check:** Scanned for imports of `supabaseAdmin` from `@/lib/supabase/admin`.
- **Findings:**
  - `supabaseAdmin` is imported **only** in server-side API routes (`src/app/api/**`) and server-side utilities (`src/lib/scraper/*`).
  - Zero imports of `supabaseAdmin` exist in any `"use client"` `.tsx` component.
  - Client components strictly use `createClient()` from `@/lib/supabase/client` with standard Row Level Security (RLS).
- **Result:** **PASSED.** Service role credentials cannot be accessed or manipulated by client-side JavaScript.

---

### 3. Middleware & Route Protection (HIGH)
- **Check:** Evaluated `src/middleware.ts` and `src/lib/supabase/middleware.ts`.
- **Findings:**
  - Intercepts all requests to root `/`, `/templates`, and dashboard routes.
  - Validates active user sessions using `supabase.auth.getUser()`. Redirects unauthenticated users to `/login`.
  - Redirects authenticated users accessing `/login` back to the root dashboard (`/`).
  - Explicitly exempts `/api/queue/*`, `/api/cron/*`, and `/api/webhooks/*` to allow autonomous background worker execution and external webhooks without browser cookies.
- **Result:** **PASSED.** Auth guards are active and unauthenticated access to the UI is blocked.

---

### 4. Queue & Webhook Authorization (HIGH)
- **Check:** Verified signature handling in worker routes and webhooks.
- **Findings:**
  - **QStash Workers (`/api/queue/process-lead` & `/api/queue/send-email`):** Uses `@upstash/qstash` `Receiver` with `QSTASH_CURRENT_SIGNING_KEY` and `QSTASH_NEXT_SIGNING_KEY` to cryptographically verify `upstash-signature` headers. Requests with missing or invalid signatures return `401 Unauthorized`.
  - **Brevo Inbound Webhook (`/api/webhooks/brevo`):** **Remediated.** Added authorization check verifying `CRON_SECRET` in either the `Authorization` header (`Bearer <token>`) or the `?token=` query parameter. Unauthenticated webhook calls return `401 Unauthorized` in production.
- **Result:** **FIXED & PASSED.** Unauthenticated actors cannot trigger background execution or manipulate lead status.

---

### 5. Input Validation & SSRF Prevention (MEDIUM)
- **Check:** Evaluated domain inputs in CSV bulk import and deep enrichment DOM fetcher.
- **Findings:**
  - **Deduplication & Normalization:** `cleanDomain` strips protocols, `www.`, and path segments to ensure clean domain strings.
  - **SSRF Prevention Guard:** **Remediated.** Added domain host validation inside `deepEnrichDomain()` in `src/lib/scraper/enrichment.ts`. Requests targeting `localhost`, `127.0.0.1`, `0.0.0.0`, `169.254.169.254` (AWS Metadata), or private RFC1918 IP ranges (`10.x.x.x`, `192.168.x.x`, `172.16.x.x`) are automatically rejected before initiating `fetch()`.
- **Result:** **FIXED & PASSED.** Server-Side Request Forgery against internal cloud metadata or local microservices is prevented.

---

## Remediation Summary & Patches Applied

### Patch 1: Brevo Inbound Webhook Secret Authorization
* **File:** [`src/app/api/webhooks/brevo/route.ts`](file:///c:/Projects/mr2labs-outreach/src/app/api/webhooks/brevo/route.ts)
* **Change:** Added secret token validation against `process.env.CRON_SECRET`.

### Patch 2: Server-Side Request Forgery (SSRF) Host Guard
* **File:** [`src/lib/scraper/enrichment.ts`](file:///c:/Projects/mr2labs-outreach/src/lib/scraper/enrichment.ts)
* **Change:** Added URL hostname parser to validate domain structure and reject internal IP addresses (`127.0.0.1`, `169.254.169.254`, `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`) before executing outbound HTTP fetch requests.

---

## Final Security Recommendation

The MR² Labs Outreach Engine codebase is **hardened and ready for production deployment** on Vercel. Ensure all environment variables are correctly entered in the Vercel Dashboard as outlined in [`PRODUCTION_LAUNCH_CHECKLIST.md`](file:///c:/Projects/mr2labs-outreach/PRODUCTION_LAUNCH_CHECKLIST.md).
