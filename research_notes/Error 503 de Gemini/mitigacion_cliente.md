# Client-side mitigation of Gemini API 503 UNAVAILABLE ("model is currently experiencing high demand")

Research date: 2026-10-05. Model names in current Google docs: Gemini 3.8 Flash (stable), 3.7 Flash, 3.5 Flash / 3.5 Flash-Lite, 2.5 Pro/Flash (access now restricted), 2.0 Flash (shut down).

## 1. Retry policy recommended by Google, and @google/genai built-in retries

### Takeaway
Google's official guidance is: retry only transient codes (429, 408, 5xx), exponential backoff starting ~1 s (1→2→4→8 s) with random jitter, and a hard cap on attempts. The JS SDK `@google/genai` has built-in retries (since v1.41.0, Feb 2026) with defaults of 5 attempts / 1 s initial / 60 s max / base 2 / jitter on, retrying 408/429/500/502/503/504 — BUT in JS it is opt-in: if `httpOptions.retryOptions` is not passed, the SDK makes a single fetch. It does not read Retry-After / retryInfo.

### Cited Findings
- Gemini troubleshooting page (updated 2026-10-01): for `429 RESOURCE_EXHAUSTED` or `503 UNAVAILABLE` "we recommend implementing an exponential backoff strategy"; wait ~1 s, then 2 s, 4 s, 8 s; add random jitter; only retry 429, 408 or 5xx, not 400/402/403; set a maximum number of attempts. States the Python SDK automatically retries up to 4 times with ~1 s initial delay and 60 s max delay. — [Gemini troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)
- API errors page (updated 2026-09-20): 503 = "service is temporarily overloaded or down. Wait and retry with exponential backoff"; 500 = retry, contact support if persistent; 504 = request didn't finish within deadline — remove/adjust client deadline to use server defaults. The page does not mention `retryInfo` or `Retry-After`. — [Gemini API errors](https://ai.google.dev/gemini-api/docs/api-errors)
- js-genai source (`src/_api_client.ts`, main branch, read 2026-10-05): `DEFAULT_RETRY_ATTEMPTS = 5` (including initial call), `DEFAULT_RETRY_INITIAL_DELAY = 1.0` s, `DEFAULT_RETRY_MAX_DELAY = 60.0` s, `DEFAULT_RETRY_EXP_BASE = 2`, `DEFAULT_RETRY_JITTER = 1`, retryable codes `[408, 429, 500, 502, 503, 504]`; comment says config is based on Cloud Storage retry strategy. Implementation uses `p-retry`; `if (!retryOptions) return runFetch();` i.e. no retries unless `retryOptions` is supplied (even `{}` enables defaults). `timeout` is per-attempt (fresh AbortSignal per attempt), not a budget for the whole retry sequence. No code reads `Retry-After` or `retryInfo`. — [js-genai _api_client.ts](https://github.com/googleapis/js-genai/blob/main/src/_api_client.ts)
- js-genai CHANGELOG: v1.41.0 (2026-02-10) "Add HTTP retry support to the SDK"; v2.15.0 (2026-07-30) "Support per-request retryOptions"; latest v2.27.0 (2026-10-02). — [js-genai CHANGELOG](https://github.com/googleapis/js-genai/blob/main/CHANGELOG.md)
- Example JS config: `new GoogleGenAI({ httpOptions: { retryOptions: { attempts: 5 }, timeout: 120*1000 } })`; same default status-code list. — [Medium/Google Cloud: resilience with TypeScript](https://medium.com/google-cloud/how-to-build-genai-apps-for-resilience-with-typescript-06908aca62c2); field documentation request in [google/adk-docs #966](https://github.com/google/adk-docs/issues/966)
- Known pitfall (Python): cookbook's `retry.if_transient_error` did not catch google-genai errors. — [google-gemini/cookbook #1091](https://github.com/google-gemini/cookbook/issues/1091)
- Third-party guide (2026-08-21): "an overload that outlives ~5 attempts over a minute isn't going to pass quickly"; cap total wait to what the caller can absorb; 503 is Google capacity, 429 is your quota. — [Kunavo guide](https://kunavo.com/guides/gemini-api-model-overloaded)
- Community report (embabel, Jun–Aug 2026): recommended Gemini-specific config of 3 attempts, 10 s initial backoff, ×2, 60 s max ("longer initial delay, fewer total attempts"); warns "Google appears to be counting failed 503 retries toward the daily rate limit quota" (unverified, anecdotal). — [embabel discussion #1742](https://github.com/embabel/embabel-agent/discussions/1742)
- Forum (Apr 2026): one dev reported success only on the 6th retry; another needed 20+ retries across different times; no Google staff response in thread. — [Google AI Dev Forum thread 138664](https://discuss.ai.google.dev/t/503-this-model-is-currently-experiencing-high-demand-spikes-in-demand-are-usually-temporary-please-try-again-later/138664)

### Inferences
- In Node.js, always pass `httpOptions: { retryOptions: {...}, timeout }` explicitly; otherwise a 503 fails immediately. Since SDK backoff caps at 60 s and doesn't honor server hints, wrap it in an outer app-level loop (model fallback + long-delay requeue) rather than raising `attempts` very high.
- Practical policy synthesized from sources: per model 3–5 attempts, 1–10 s initial, ×2, jitter, ~60 s cap / ~1–2 min total budget; then fall back to another model; then requeue the job for minutes later.
- Because 429 (quota) and 503 (capacity) look similar but need different handling, branch on status: 429 → slow down / wait for quota reset; 503 → backoff then switch model.

### Gaps
- No official statement found on whether Gemini returns `Retry-After` header or `google.rpc.RetryInfo` details on 503 (the API errors page is silent). Logging raw 503 responses is needed to confirm.
- The claim that failed 503s count against daily quota is a single unverified community report.
- Vertex AI retry-strategy page ([link](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/retry-strategy)) could not be read (fetch returned only navigation).

## 2. Model fallback chains; stable vs preview vs "-latest"

### Takeaway
Preview/experimental builds have smaller capacity pools and stricter limits; production should pin a specific stable version and fall back across model families/sizes. Fallback helps but is not a guarantee: during broad incidents (Sept 2025, Apr 2026) multiple models 503'd at once. Avoid shut-down models (gemini-2.0-flash) and note 2.5 access is now restricted to prior users.

### Cited Findings
- Models page (updated 2026-10-01): stable models "usually don't change" and are recommended for production; preview models have "more restrictive rate limits"; "latest" aliases can point to a stable, preview or experimental release and are hot-swapped (2-week notice); Gemini 2.5 access limited "to users who have actively used them in the past"; new projects should use 3.5 Flash-Lite or 3.8 Flash; Gemini 2.0 Flash is shut down. — [Gemini models](https://ai.google.dev/gemini-api/docs/models)
- "-exp and preview builds run on small pools and overload first. Pin the stable alias for production." Fallback order suggested: stable alias (if on preview) → sibling model (flash↔pro) → different provider. — [Kunavo guide, 2026-08-21](https://kunavo.com/guides/gemini-api-model-overloaded)
- Google shut down gemini-2.0-flash on June 1, 2026 — do not use as fallback. — [simplemetrics guide (2026)](https://simplemetrics.xyz/how-to-handle-model-is-overloaded-error-503-when-using-gemini/)
- Static fallback pattern reported: flash-lite → flash, plus try/catch escalation lite → full on transient error. — [embabel discussion #1742](https://github.com/embabel/embabel-agent/discussions/1742)
- Counter-evidence: in Apr 2026 forum thread, model switching was tried but "problems persisted" across 2.5 Pro, 2.5 Flash, 3.x Pro/Flash. — [Forum 138664](https://discuss.ai.google.dev/t/503-this-model-is-currently-experiencing-high-demand-spikes-in-demand-are-usually-temporary-please-try-again-later/138664). Sept 2025: persistent 503 on 2.5 Pro and Flash for several days despite backoff and model switching; not shown on status page; issue open (P2). — [python-genai #1373](https://github.com/googleapis/python-genai/issues/1373)
- Oct 2, 2026: video analysis 503 "high demand" on both gemini-3.7-flash and gemini-3.8-flash (same family switch didn't help); no fix documented. — [claude-video #250](https://github.com/bradautomates/claude-video/issues/250)
- Examples of open-source fixes merging "retry + model fallback" for high-demand 503s. — [morning-light-cinema PR #1](https://github.com/Alarm2024/morning-light-cinema/pull/1); [goodai-group/john PR #40](https://github.com/goodai-group/john/pull/40)

### Inferences
- A sensible 2026 chain for video analysis: pinned stable `gemini-3.8-flash` → older stable generation (e.g. 3.5 Flash, or 2.5 Flash only if your project still has access) → `3.5 Flash-Lite` (lower quality; flag output as degraded). Crossing generations is likelier to hit a different capacity pool than switching between 3.7/3.8 Flash, which failed together in #250.
- Avoid "-latest" aliases for production fallback: they can silently point to a preview build (smaller pool).

### Gaps
- No quantitative data found comparing 503 rates across specific models or alias types; evidence is qualitative.

## 3. Request-shaping (size, fps, media_resolution, segments, streaming, thinking, timeouts) and paid tiers

### Takeaway
Google documents knobs that cut video tokens (fps, clipping offsets, media resolution, "agentic" mode), and third-party guides recommend smaller contexts/streaming under load, but no source proves these reduce 503 frequency. The one documented capacity-level lever is the Priority service tier: overflow is gracefully downgraded to Standard instead of returning 503/429. Flex tier is the opposite: shed first.

### Cited Findings
- Video doc (updated 2026-09-23): default sampling 1 fps, configurable `fps`; `start_offset`/`end_offset` clipping; ~100 tokens/s at default (low) media resolution vs ~300 tokens/s high; audio ~32 tokens/s; Gemini 3.8 Flash+ supports "Agentic" processing using "up to 88% fewer tokens" on long-form content. — [Video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)
- Guide recommends: reduce context during peak hours, avoid max output caps under load, enable streaming for heavy requests (advice, no data). — [Kunavo guide](https://kunavo.com/guides/gemini-api-model-overloaded)
- Priority inference (updated 2026-09-02): available to Tier 2 & Tier 3; priced 75–100% above standard; "overflow requests are automatically and gracefully downgraded to Standard processing instead of failing with a 503 or 429 error"; rate limit 0.3× standard; JS `config: { serviceTier: "priority" }`, REST `"service_tier": "priority"`. — [Priority inference](https://ai.google.dev/gemini-api/docs/generate-content/priority-inference)
- Flex inference (updated 2026-09-02): 50% cheaper; can return 503/429 when Flex capacity is full and "won't automatically upgrade a Flex request to the Standard tier"; Flex "may be preempted or evicted" during standard spikes; recommends client timeouts ≥10 minutes and retries (example max_retries=3, base_delay=5 s doubling). — [Flex inference](https://ai.google.dev/gemini-api/docs/generate-content/flex-inference)
- 504 guidance: let server default deadline apply rather than short client deadlines. — [API errors](https://ai.google.dev/gemini-api/docs/api-errors)
- js-genai `timeout` applies per attempt. — [_api_client.ts](https://github.com/googleapis/js-genai/blob/main/src/_api_client.ts)
- Truncated JSON on long video responses can surface as an app-level 503 (EventRelay repaired the JSON prefix instead of failing). — [EventRelay #2070](https://github.com/groupthinking/EventRelay/issues/2070)

### Inferences
- For video analysis: use `fps` ≤1 (or lower for long videos), LOW media resolution, and segment long videos via offsets — this reduces cost and per-request latency/timeout risk and makes retries cheaper, even if it doesn't change Google's capacity shedding.
- Never use Flex for the critical path of interactive analysis; it is the first to get 503. If budget allows and account is Tier 2+, Priority tier is the only documented way to convert 503s into (slower) successes.
- Set generous timeouts (e.g. 5–10 min per attempt for long video) to avoid self-inflicted 504s that then get retried.

### Gaps
- No evidence found that streaming (`streamGenerateContent`) vs non-streaming changes 503 rate, nor that lowering thinking budget reduces 503s. No source found.

## 4. Files API vs inline data vs YouTube URLs

### Takeaway
Docs recommend Files API for >100 MB or >10 min videos and inline for <100 MB/<1 min clips. The 503 "high demand" arises at generateContent regardless of input method; the key client practice is to upload once and reuse the file URI across retries/fallback models instead of re-uploading. The Files upload endpoint itself has had its own 503 outages.

### Cited Findings
- Files API up to 20 GB (paid) / 2 GB (free), recommended for 100 MB+ and 10 min+; inline <100 MB for clips under ~1 min; YouTube URLs public videos only (free tier 8 h/day). — [Video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)
- Oct 2026: uploads succeeded but generateContent returned 503 high demand; reporter asked for bounded retries that reuse the uploaded file rather than re-uploading. — [claude-video #250](https://github.com/bradautomates/claude-video/issues/250)
- Files API outage starting 2026-05-21: intermittent then hard 503s on `files.upload`. — [Forum: files.upload 503 outage](https://discuss.ai.google.dev/t/outage-files-upload-503-service-unavailabl/146858)

### Inferences
- Separate the upload step and the analysis step in both n8n and Node: persist the file URI/name and on 503 retry only the analysis call (also with the fallback model). Also check upload state is ACTIVE before analyzing.
- Pre-transcoding huge 60 fps / 3K screen recordings (like #250's 2 GB MOV) to smaller files reduces upload time and failure surface.

### Gaps
- No source found showing YouTube URL vs Files API vs inline changes 503 frequency. File retention period was not verified in this session.

## 5. Off-peak scheduling

### Takeaway
Only weak evidence: aggregator/SEO guides claim peak windows in Pacific Time and recommend running batch jobs overnight PT, but cite no verifiable data. Forum users report no reliable time-of-day pattern.

### Cited Findings
- Search snippet attributed to third-party guides: highest-risk windows 9–11 AM, 1–3 PM, 6–10 PM PT; "community data" showed ~45% failure in peak; suggests 11 PM–7 AM PT for batch. Primary page (inventivehq) returned HTTP 403, so the claim could not be verified; likely from [aifreeapi guide](https://www.aifreeapi.com/en/posts/gemini-3-pro-image-503-overloaded) / [inventivehq KB](https://inventivehq.com/knowledge-base/gemini/gemini-503-model-is-overloaded). Treat as unverified.
- Forum thread (Apr 2026): "No specific times of day, regions, or paid tier advantages mentioned as reliable solutions"; one user needed 20+ retries "across different times". — [Forum 138664](https://discuss.ai.google.dev/t/503-this-model-is-currently-experiencing-high-demand-spikes-in-demand-are-usually-temporary-please-try-again-later/138664)
- Guide: reduce context "during peak hours" (no hours given). — [Kunavo](https://kunavo.com/guides/gemini-api-model-overloaded)

### Inferences
- Low-cost to try: schedule non-urgent n8n batches overnight PT (which is evening/night in Latin America) and log 503 rate per hour to build your own evidence.

### Gaps
- No primary/official data on hourly 503 rates.

## 6. n8n-specific patterns

### Takeaway
n8n's built-in Retry On Fail is capped at 5 tries and 5000 ms fixed wait (no exponential backoff), which is too short for Gemini overload episodes that last ~1+ minute. Use Retry On Fail as the inner layer plus an explicit loop (error output → Wait node with growing delay → IF attempt counter → switch model), and an error workflow / requeue for long jobs.

### Cited Findings
- Retry On Fail caps: Max Tries limited to 5; Wait Between Tries capped at 5000 ms (higher values revert). — [n8n issue #23658](https://github.com/n8n-io/n8n/issues/23658); [community thread](https://community.n8n.io/t/nodes-settings-retry-on-fail-issue-when-lost-focus-on-wait-between-tries-ms/209284); [n8n issue #16083](https://github.com/n8n-io/n8n/issues/16083)
- HTTP Request node docs: enable Settings > Retry on Fail (Max Tries, Wait Between Tries); Batching option (Items per Batch, Batch Interval ms) to throttle. — [n8n HTTP Request common issues](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/common-issues)
- Known incompatibility between some HTTP Request error-handling options. — [n8n issue #9236](https://github.com/n8n-io/n8n/issues/9236)
- Community articles on catch/retry/alert and idempotency patterns (2026). — [n8nlogic](https://n8nlogic.com/blog/n8n-error-handling-catch-retry-alert-failures-2026); [abhiman.io](https://abhiman.io/blog/n8n-error-handling/)

### Inferences
- Recommended n8n design: (1) HTTP Request to Gemini with Retry On Fail 3–5 tries × 5000 ms and On Error = "Continue (using error output)"; (2) error branch → Code node reads status (503 vs 429), increments `attempt`, computes delay (e.g. 15 s, 30 s, 60 s, 120 s + jitter) and next `model` from a chain array; (3) Wait node with expression delay; loop back; (4) after N rounds, write job to a queue (Data Table/Sheet) with status `pending_retry` and let a Schedule Trigger workflow resume later; (5) Error Trigger workflow for alerts. Store Files API URI in the job record so resumes skip re-upload.
- Alternatively call Gemini from a Code node using fetch with custom exponential backoff, since Code nodes aren't limited by the 5 s cap.

### Gaps
- Official n8n error-handling page (Error Trigger, retry executions) could not be fetched (404 at old URL); details above come from community/issues.

## 7. Real-world reports of what fixed persistent 503s

### Takeaway
No report shows a definitive client-side "fix"; persistent 503s are capacity incidents on Google's side. What reliably helped: bounded backoff retries (success often after several attempts), fallback to a different model/generation, and degrading gracefully (alternate provider/local pipeline). Priority tier is the only official mechanism that avoids 503s by design.

### Cited Findings
- Retry eventually succeeded on the 6th try; others needed 20+ retries; no Google response (Apr 2026). — [Forum 138664](https://discuss.ai.google.dev/t/503-this-model-is-currently-experiencing-high-demand-spikes-in-demand-are-usually-temporary-please-try-again-later/138664)
- Multi-day outage, retries + switching didn't help, status page silent (Sept 2025). — [python-genai #1373](https://github.com/googleapis/python-genai/issues/1373)
- Projects adding bounded retries because Gemini 503 failed immediately. — [erode #344](https://github.com/erode-app/erode/issues/344); [fin-ai-lab #216](https://github.com/devTomaszStoklosa/fin-ai-lab/issues/216)
- Retries limited to 503 class with short backoff (500 ms, 1500 ms), quota/auth errors fail fast; or 3 tries 1 s→2 s on 503/429. — [goodai-group/john PR #40](https://github.com/goodai-group/john/pull/40); [morning-light-cinema PR #1](https://github.com/Alarm2024/morning-light-cinema/pull/1)
- Video 503s on 3.7/3.8 Flash with local WhisperX fallback as degradation path (Oct 2026). — [claude-video #250](https://github.com/bradautomates/claude-video/issues/250)
- Priority tier downgrades instead of 503. — [Priority inference](https://ai.google.dev/gemini-api/docs/generate-content/priority-inference)

### Inferences
- Playbook ranking: (1) enable SDK retries / n8n retries; (2) outer loop with longer waits + model fallback across generations; (3) upload once, reuse URI; (4) shrink video requests (fps, low res, segments); (5) requeue and resume later / off-peak; (6) Priority tier if Tier 2+ and the job is valuable; (7) alternate provider as last resort.

### Gaps
- No controlled measurements of success-rate improvement for any single tactic were found.
