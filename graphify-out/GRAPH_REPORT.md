# Graph Report - mr2labs-outreach  (2026-08-31)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 399 nodes · 598 edges · 32 communities (17 shown, 12 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `38abf7fb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- admin.ts
- enrichment.ts
- types/audit.ts
- app/page.tsx
- pitch.ts
- discovery.ts
- compilerOptions
- devDependencies
- dependencies
- groq.ts
- convert-readme-assets-webp.mjs
- process-readme-buttons.mjs
- process-sponsor-badge.mjs
- cheerio.ts
- updateSession
- layout.tsx
- actions.ts
- tracker/page.tsx
- build-emil-sponsor-row.mjs
- skill.sh
- route.tsx
- track-intent/route.ts
- tracker/route.ts
- campaigns/page.tsx
- serper.ts
- eslint.config.mjs
- next.config.ts
- postcss.config.mjs
- vercel.json

## God Nodes (most connected - your core abstractions)
1. `deepEnrichDomain()` - 24 edges
2. `supabaseAdmin` - 20 edges
3. `compilerOptions` - 16 edges
4. `generateAuditAndPitch()` - 12 edges
5. `processSingleQueuedLead()` - 9 edges
6. `discoverTargetDomains()` - 9 edges
7. `isValidLeadEmail()` - 8 edges
8. `sanitizeGreetingAndBody()` - 8 edges
9. `OutreachLead` - 7 edges
10. `scoreEmailConfidence()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `OutreachLead` --references--> `AuditData`  [EXTRACTED]
  src/types/lead.ts → src/types/audit.ts
- `LeadDetailDrawerProps` --references--> `OutreachLead`  [EXTRACTED]
  src/components/leads/LeadDetailDrawer.tsx → src/types/lead.ts
- `LeadsTableProps` --references--> `OutreachLead`  [EXTRACTED]
  src/components/leads/LeadsTable.tsx → src/types/lead.ts
- `GET()` --calls--> `autoDispatchPastDueLeads()`  [EXTRACTED]
  src/app/api/followups/route.ts → src/lib/queue/auto-dispatcher.ts
- `GET()` --calls--> `autoDispatchPastDueLeads()`  [EXTRACTED]
  src/app/api/logs/route.ts → src/lib/queue/auto-dispatcher.ts

## Import Cycles
- None detected.

## Communities (32 total, 12 thin omitted)

### Community 0 - "admin.ts"
Cohesion: 0.06
Nodes (17): dynamic, revalidate, dynamic, revalidate, dynamic, GET(), revalidate, dynamic (+9 more)

### Community 1 - "enrichment.ts"
Cohesion: 0.10
Nodes (38): RFC-1918, GET(), catchAllCache, checkGravatar(), DetailedVerificationResult, EmailConfidenceResult, hasValidMxRecords(), scoreEmailConfidence() (+30 more)

### Community 2 - "types/audit.ts"
Cohesion: 0.08
Nodes (29): GET(), POST(), supabase, AuditApiResponse, AuditLandingPage(), LeadInfo, buildSolutionCards(), categorizeAuditIssues() (+21 more)

### Community 3 - "app/page.tsx"
Cohesion: 0.09
Nodes (18): AdminDashboard(), CampaignSetupForm(), CampaignSetupFormProps, CsvImporter(), LiveLogs(), SystemLog, LeadDetailDrawer(), LeadDetailDrawerProps (+10 more)

### Community 4 - "pitch.ts"
Cohesion: 0.13
Nodes (23): cleanDomain(), dynamic, maxDuration, POST(), POST(), supabase, maxDuration, POST() (+15 more)

### Community 5 - "discovery.ts"
Cohesion: 0.10
Nodes (26): maxDuration, POST(), dynamic, GET(), maxDuration, POST(), revalidate, getCoordinates() (+18 more)

### Community 6 - "compilerOptions"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, **/*.mts, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules (+20 more)

### Community 7 - "devDependencies"
Cohesion: 0.07
Nodes (27): eslint, eslint-config-next, devDependencies, eslint, eslint-config-next, tailwindcss, @tailwindcss/postcss, @types/node (+19 more)

### Community 8 - "dependencies"
Cohesion: 0.08
Nodes (25): cheerio, lucide-react, next, openai, dependencies, cheerio, lucide-react, next (+17 more)

### Community 9 - "groq.ts"
Cohesion: 0.31
Nodes (9): POST(), AuditResult, callAIWithFallback(), classifyEmailResponse(), cleanAndRepairJson(), generateLeadAuditAndPitch(), getGroqClient(), getOpenRouterClient() (+1 more)

### Community 10 - "convert-readme-assets-webp.mjs"
Cohesion: 0.31
Nodes (6): emilBadgeToWebp(), getBounds(), isBackground(), pngToWebp, removeOuterBackground(), root

### Community 11 - "process-readme-buttons.mjs"
Cohesion: 0.43
Nodes (6): getBounds(), isBackground(), mapping, outDir, processOne(), removeOuterBackground()

### Community 12 - "process-sponsor-badge.mjs"
Cohesion: 0.33
Nodes (5): bounds, isBackground(), out, removeOuterBackground(), rgba

### Community 13 - "cheerio.ts"
Cohesion: 0.53
Nodes (4): checkMxRecords(), deepScrapeSite(), ScrapeResult, isValidLeadEmail()

### Community 14 - "updateSession"
Cohesion: 0.53
Nodes (4): getUserFromCookies(), updateSession(), config, proxy()

### Community 15 - "layout.tsx"
Cohesion: 0.40
Nodes (3): geistMono, geistSans, metadata

### Community 16 - "actions.ts"
Cohesion: 0.70
Nodes (3): login(), signOut(), createClient()

## Knowledge Gaps
- **140 isolated node(s):** `DetailedVerificationResult`, `EmailConfidenceResult`, `DisambiguatedFounder`, `EmailSource`, `PsiMetrics` (+135 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 184 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `supabaseAdmin` connect `admin.ts` to `groq.ts`, `pitch.ts`, `discovery.ts`?**
  _High betweenness centrality (0.073) - this node is a cross-community bridge._
- **Why does `AuditData` connect `types/audit.ts` to `app/page.tsx`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `OutreachLead` connect `app/page.tsx` to `types/audit.ts`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `DetailedVerificationResult`, `EmailConfidenceResult`, `DisambiguatedFounder` to the rest of the system?**
  _140 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `admin.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.05858585858585859 - nodes in this community are weakly interconnected._
- **Should `enrichment.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.10077519379844961 - nodes in this community are weakly interconnected._
- **Should `types/audit.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.08232118758434548 - nodes in this community are weakly interconnected._