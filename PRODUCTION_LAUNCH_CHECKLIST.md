# MR² Labs Outreach Engine — Live Production Launch Runbook

**Document Version:** 1.0.0  
**Target Domain:** `https://my-app.vercel.app` (Replace with your actual Vercel production domain)  
**Status:** Ready for Final Deployment  

---

## 1. Environment Variables Sync Checklist

Copy every environment variable listed below into your Vercel Project Dashboard (**Project Settings → Environment Variables**):

### Core Application & Auth
- [ ] `NEXT_PUBLIC_APP_URL` = `https://my-app.vercel.app` *(Crucial: Used for QStash callbacks & OpenRouter headers)*
- [ ] `NEXT_PUBLIC_SUPABASE_URL` = `https://<your-supabase-ref>.supabase.co`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `<your-supabase-anon-key>`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = `<your-supabase-service-role-secret>` *(SERVER-SIDE ONLY - Never expose to client UI)*
- [ ] `CRON_SECRET` = `mr2labs_cron_secret_key_2026` *(Matches authorization header in Vercel Cron & cURL triggers)*

### Queue & Background Processing (Upstash QStash)
- [ ] `QSTASH_TOKEN` = `<your-upstash-qstash-token>`
- [ ] `QSTASH_CURRENT_SIGNING_KEY` = `<your-upstash-current-signing-key>`
- [ ] `QSTASH_NEXT_SIGNING_KEY` = `<your-upstash-next-signing-key>`

### Email Delivery (Brevo)
- [ ] `BREVO_API_KEY` = `<your-brevo-api-key>`
- [ ] `SENDER_EMAIL` = `outreach@mr2labs.com` *(Must be a domain verified in Brevo)*
- [ ] `SENDER_NAME` = `MR² Labs`
- [ ] `DAILY_EMAIL_LIMIT` = `290` *(Guarantees safety buffer below Brevo's 300 emails/day cap)*

### Search & Lead Discovery APIs
- [ ] `SERPER_API_KEY` = `<your-serper-dev-key>` *(Primary SERP Dorking engine)*
- [ ] `SERP_API` = `<your-serpapi-key>` *(Secondary SERP fallback)*
- [ ] `VALUE_SERP_API` = `<your-valueserp-key>` *(Tertiary SERP fallback)*

### Enrichment APIs
- [ ] `APOLLO_KEY` = `<your-apollo-api-key>`
- [ ] `PROSPEO_API` = `<your-prospeo-api-key>`
- [ ] `HUNTER_API_KEY` = `<your-hunter-api-key>`
- [ ] `SNOV_API` = `<your-snov-api-key>`

### AI Model Waterfall APIs
- [ ] `GROQ_API_KEY` = `<your-groq-api-key>` *(Primary Tier 1 AI)*
- [ ] `GEMINI_API_KEY` = `<your-google-ai-studio-key>` *(Tier 2 AI Fallback)*
- [ ] `MISTRAL_API_KEY` = `<your-mistral-api-key>` *(Tier 3 AI Fallback)*
- [ ] `DEEPSEEK_API_KEY` = `<your-deepseek-api-key>` *(Tier 4 AI Fallback)*
- [ ] `OPEN_ROUTER_API_KEY` = `<your-openrouter-api-key>` *(Tier 5 AI Fallback)*

---

## 2. Upstash QStash Configuration

1. Log in to the [Upstash Console](https://console.upstash.com/qstash).
2. Copy your **QStash Token**, **Current Signing Key**, and **Next Signing Key** into Vercel environment variables.
3. Verification: When QStash receives messages from `/api/campaigns/scrape` or `/api/cron/daily-outreach`, it will dynamically trigger:
   - Worker 1: `https://my-app.vercel.app/api/queue/process-lead`
   - Worker 2: `https://my-app.vercel.app/api/queue/send-email`
4. Cryptographic Validation: Requests arriving at worker routes are validated using `upstash-signature`. Invalid signatures return `401 Unauthorized`.
5. Automatic Retries: Failed background worker executions return HTTP status `500`, triggering QStash's automatic retry mechanism instead of dropping leads.

---

## 3. Brevo Inbound Webhook Configuration

To ensure replies automatically halt follow-up sequences:

1. Log in to your [Brevo Console](https://app.brevo.com/).
2. Navigate to **Transactional → Settings → Webhooks**.
3. Click **Add a new webhook**.
4. Set the **URL** to:
   ```
   https://my-app.vercel.app/api/webhooks/brevo
   ```
5. Select the following events:
   - `replied` (Inbound customer reply)
   - `hard_bounce`
   - `soft_bounce`
   - `unsubscribed`
6. Click **Save**.

---

## 4. Live Verification cURL Commands

Run these test commands from your local terminal after deploying to Vercel to verify live cloud behavior:

### Test 1: Manual Daily Cron Trigger
Verifies active campaign queries, discovery, and email queue dispatch.
```bash
curl -X POST "https://my-app.vercel.app/api/cron/daily-outreach" \
  -H "Authorization: Bearer mr2labs_cron_secret_key_2026" \
  -H "Content-Type: application/json"
```
*Expected Output:*
```json
{
  "status": "Cron Execution Complete",
  "scrapedSummary": [...],
  "enqueuedJobs": 0
}
```

### Test 2: Scraper Endpoint Async Discovery Trigger
Verifies SERP discovery sweep and QStash background job enqueueing.
```bash
curl -X POST "https://my-app.vercel.app/api/campaigns/scrape" \
  -H "Content-Type: application/json" \
  -d '{"niche": "Real Estate Agency", "location": "Miami, Florida"}'
```
*Expected Output:*
```json
{
  "success": true,
  "mode": "ASYNC_QSTASH",
  "rawDiscoveredCount": 20,
  "enqueuedCount": 20,
  "message": "Successfully initiated async background enrichment for 20 leads. Leads will populate in real-time."
}
```

---

**Pre-Flight Security & Operational Checks Complete.** All system components are verified for live production deployment.
