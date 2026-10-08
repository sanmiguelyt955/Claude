# Causes of Gemini API 503 UNAVAILABLE "This model is currently experiencing high demand"

Research date: 2026-10-05. Scope: Gemini Developer API (generativelanguage.googleapis.com), free tier, gemini-3.x flash models, video via Files API plus a long prompt.

## 1. What Google officially says 503 means, and how it differs from 429 and 500

### Takeaway
Google defines 503 as a server-side capacity problem ("temporarily overloaded or down"), not something tied to your account. 429 means you went over one of your own quotas (RPM/TPM/RPD). 500 is an unexpected internal error. The documentation treats 429 and 5xx as transient errors to retry with exponential backoff.

### Cited Findings
- API error reference (last updated 2026-09-20): 503 `service_unavailable`, "The service is temporarily overloaded or down", with the advice "Wait and retry with exponential backoff." 500 `api_error`, "An unexpected error occurred on the server", with the advice to retry and contact support if it persists. 504 `deadline_exceeded`, "The request didn't finish within the deadline." 429 comes in three variants: `rate_limit_exceeded` (per-minute/per-second request or token limit), `quota_exceeded` (daily quota) and `too_many_requests`. — [Gemini API errors](https://ai.google.dev/gemini-api/docs/api-errors)
- Troubleshooting guide (last updated 2026-10-01): lists 429 and 5xx as transient errors to retry with exponential backoff and jitter. It notes that the official SDKs include automatic retry with backoff and says not to retry 400/402/403. — [Troubleshooting](https://ai.google.dev/gemini-api/docs/troubleshooting)
- Google staff (Jon_Matthews, 2026-02-20, official forum): "503 ('Service Unavailable') errors are unrelated to your quota and indicate our services are temporarily overloaded and can't service your request. These errors are more common during certain times of the day." On 429, he says they are "usually triggered if you exceed one of our listed quotas" (RPM, TPM or RPD). Google also says it is "working hard to provision more resources." — [Forum: Handling 429 / 503 errors](https://discuss.ai.google.dev/t/handling-429-503-errors-from-the-gemini-api/124640)
- Google staff (Pooja Kapse, late Sep 2026), replying to free-tier reports: "503 errors are due to our services being temporarily overloaded." She did not point to any problem specific to the user's project. — [Forum: 503 consume Free Tier RPD](https://discuss.ai.google.dev/t/gemini-api-503-errors-appear-to-consume-free-tier-rpd-leading-to-429-quota-exhaustion/184644); [Forum: Repeated 503 on Free tier, tiny text request](https://discuss.ai.google.dev/t/repeated-503-unavailable-on-free-tier-including-a-tiny-text-only-generatecontent-request-from-apps-script/185898)
- Flex inference docs: when capacity is unavailable the API returns "503 Service Unavailable: The system is currently at capacity." 429 is listed separately for rate limits or resource exhaustion. — [Flex inference](https://ai.google.dev/gemini-api/docs/flex-inference)

### Inferences
- The exact text "This model is currently experiencing high demand" is the per-model form of the 503 capacity error. The model's serving pool is saturated. It does not mean the user's key or quota is wrong.

### Gaps
- No official doc maps the specific string "experiencing high demand" to a particular internal mechanism (global pool saturation, regional saturation or per-request admission control).

## 2. Is free-tier traffic shed first, ahead of paid traffic?

### Takeaway
Google documents that load shedding depends on the service tier: Flex is "Sheddable" and Priority is "Non-sheddable", and congestion shows up as 503. I found **no official statement** that free-tier Standard traffic is shed before paid Standard traffic. The evidence on that point is mixed. Paid Tier 2 users who have Priority enabled also report long runs of 503s.

### Cited Findings
- The reliability table on the Flex and Priority pages (last updated 2026-09-23) reads: Priority "High (Non-sheddable)", Standard "High / Medium-high", Flex "Best-effort (Sheddable)", Batch "High (for throughput)". — [Priority inference](https://ai.google.dev/gemini-api/docs/priority-inference); [Flex inference](https://ai.google.dev/gemini-api/docs/flex-inference)
- Flex: "Flex traffic is treated with lower priority. If there is a spike in standard traffic, Flex requests may be preempted or evicted to ensure capacity for high-priority users." Also: "No server-side fallback", meaning Flex is not upgraded to Standard when Flex capacity is full. — [Flex inference](https://ai.google.dev/gemini-api/docs/flex-inference)
- Priority: "Traffic spikes exceeding dynamic limits are automatically downgraded to the Standard tier for processing instead of failing." Downgraded requests are billed at Standard rates. — [Priority inference](https://ai.google.dev/gemini-api/docs/priority-inference)
- Logan Kilpatrick (Google) announced the service tiers: Flex is about 50% cheaper "with lower reliability" and Priority costs about 80% more for "higher priority". The tiers went live around 2026-04-01. — [X post](https://x.com/OfficialLoganK/status/2039795986713776135); [Threads report](https://www.threads.com/@platinumpathway/post/DWqXwp9FvWt/google-adds-flex-and-priority-tiers-to-gemini-api-google-on-tuesday-introduced)
- Counter-evidence: a forum thread (2026-08-27 to 08-31) reports sustained 503s on `gemini-3.7-flash` for Tier 2 paid projects with Priority enabled. One user saw 973 consecutive 503s over 12+ hours. Workloads were about 50k input tokens plus 12 images with JSON output and thinking, streamed. No Google staff answered publicly. The community suspected Priority might not apply consistently to streaming, and suspected problems with prepaid billing accounts; neither is confirmed. — [Forum: Persistent 503 on gemini-3.7-flash with Priority tier](https://discuss.ai.google.dev/t/persistent-503-on-gemini-3-7-flash-with-priority-tier-tier-2-paid-0-success-over-multiple-retries/179804)
- A second thread reports persistent 503 on a paid `gemini-3.7-flash` project. — [Forum: Persistent 503 for paid gemini-3.7-flash project](https://discuss.ai.google.dev/t/persistent-503-unavailable-for-paid-gemini-3-7-flash-project/183055)
- Community and third-party opinions contradict each other. Some say "free tier shares capacity with everyone and gets deprioritized under load", others that "503 is shared serving capacity, free and paid both see it". Neither cites Google. — [n8n community](https://community.n8n.io/t/gemini-api-503-error-on-free-tier-does-paying-help/304875/3?tl=en); [Kunavo guide](https://kunavo.com/guides/gemini-api-model-overloaded); [Apiyi blog](https://help.apiyi.com/en/gemini-api-high-demand-503-error-solution-guide-en.html)
- A third-party research PR (2026-10-02) argues that 503 is "tier-linked load shedding" based on the Flex/Priority table. It explicitly marks as **unverified** the claim that "free-tier requests use sheddable capacity, while billed requests are protected". — [GitHub PR RedstoneX/quant-agent#1159](https://github.com/RedstoneX/quant-agent/pull/1159)

### Inferences
- Google has confirmed that admission control is tiered (Priority > Standard > Flex). It is plausible that free-tier Standard traffic ranks below paid Standard traffic when capacity is short, but this is not documented. Paying Tier 1+ probably raises the odds of getting through without guaranteeing it, and the paid Priority reports show that even Priority does not prevent 503s on a saturated new flash model.
- Priority falls back to Standard instead of failing, so paid Priority users who still get 503s suggest the Standard pool itself was saturated at those times.

### Gaps
- No Google staff statement, public or in a thread, confirms or denies that free-tier traffic is deprioritized relative to paid Standard.
- The docs I fetched do not state whether the free tier can use Flex or Priority.

## 3. Do preview/new models get more 503s than stable models? Is flash-lite less congested?

### Takeaway
User reports cluster around newly released models (gemini-3-flash-preview, 3.7-flash, 3.8-flash). A common workaround is to fall back to the previous version (for example 3.6-flash). Flash-lite is **not** immune: gemini-3.5-flash-lite returned repeated 503s in late Sep 2026, even on minimal text requests.

### Cited Findings
- gemini-3-flash-preview had about 50–70% failures for 1–2 weeks around 2026-04-02 (batch/multi-row workloads). The staff reply mentioned a Batch API fix for jobs stuck pending. — [Forum: Frequent 503 with gemini-3-flash-preview](https://discuss.ai.google.dev/t/frequent-503-errors-with-gemini-3-flash-preview-50-failure-rate/137624)
- Production downtime was reported on gemini-2.5-flash and gemini-3-flash-preview, so stable models are affected too. — [Forum: Production Downtime](https://discuss.ai.google.dev/t/production-downtime-gemini-2-5-flash-gemini-3-flash-preview-503-service-unavailable/139749)
- 3.7-flash, Aug 2026: users fell back to `gemini-3.6-flash`, which "generally succeeds faster". — [Forum thread 179804](https://discuss.ai.google.dev/t/persistent-503-on-gemini-3-7-flash-with-priority-tier-tier-2-paid-0-success-over-multiple-retries/179804)
- Free tier, 2026-09-28/29: both gemini-3.8-flash and gemini-3.5-flash-lite returned 503, including a 230-byte request. — [Forum thread 185898](https://discuss.ai.google.dev/t/repeated-503-unavailable-on-free-tier-including-a-tiny-text-only-generatecontent-request-from-apps-script/185898); [Forum: 3.5 Flash-Lite repeated 503](https://discuss.ai.google.dev/t/gemini-3-5-flash-lite-repeated-503-unavailable-including-minimal-text-request/185876)
- Earlier, there was a thread titled "Frequent 503 Errors across all models". — [Forum thread 116450](https://discuss.ai.google.dev/t/frequent-503-errors-service-unavailable-across-all-models/116450)
- Developers moved from gemini-3-pro-preview to 3.1-pro-preview because of the 503 errors. — [Devpost forum](https://gemini3.devpost.com/forum_topics/43115-updated-my-project-from-gemini-3-pro-preview-to-gemini-3-1-pro-preview-due-to-503-this-model-is-experiencing-high-demand-error-gemini-3-pro-preview)
- A third-party claim says gemini-2.5-flash-lite was "popular and often congested". — [n8n community](https://community.n8n.io/t/gemini-api-503-error-on-free-tier-does-paying-help/304875/3?tl=en)

### Inferences
- Congestion depends on each model's own serving pool and its current popularity. The newest flash model tends to be the most saturated. An older generation (for example 3.6) may have spare capacity, and so may a different family (pro or lite), but none of them is reliably free of 503s.

### Gaps
- Google publishes no per-model 503 rates. Preview vs GA has not been compared in any controlled way.

## 4. Does request size (long context, video tokens, fps, output) affect how often you get 503?

### Takeaway
No official source says that request size raises the chance of a 503. Reports show that tiny requests also get 503 when a pool is saturated. However, many of the heavy 503 reports involve large multimodal payloads, and video at 2 fps is expensive in tokens. The idea that bigger requests are admitted less often under load is plausible but unconfirmed.

### Cited Findings
- On the free tier, a stripped-down request ("Return exactly this JSON", 256 max output tokens, 230-byte payload) also got 503 on 3.8-flash and 3.5-flash-lite. — [Forum thread 185898](https://discuss.ai.google.dev/t/repeated-503-unavailable-on-free-tier-including-a-tiny-text-only-generatecontent-request-from-apps-script/185898)
- Heavy 503 reports on 3.7-flash involved about 50k input tokens plus 12 images, PDFs and structured output. — [Forum thread 179804](https://discuss.ai.google.dev/t/persistent-503-on-gemini-3-7-flash-with-priority-tier-tier-2-paid-0-success-over-multiple-retries/179804)
- Video analysis: uploads succeeded, then analysis got repeated 503 "high demand" errors on gemini-3.7-flash and 3.8-flash (123.6 s @ 60fps, 382 MB; 657 s, 1.97 GB). The reporter judged it provider-side and not a quota problem. — [GitHub claude-video#250](https://github.com/bradautomates/claude-video/issues/250)
- Video token cost: about 258 tokens per sampled second, so roughly 15.5k tokens per minute at 1 fps (third-party summary of Google's docs). — [fast.io](https://fast.io/resources/gemini-context-window/)
- A third-party guide associates very long prompts and very long outputs with **timeouts (504)**, which is a separate failure class. — [aifreeapi timeout guide](https://www.aifreeapi.com/en/posts/gemini-3-1-pro-timeout-fix)

### Inferences
- For the user's case: a 2-minute segment at fps 2 is about 240 frames. At about 258 tokens per frame that is roughly 60k video tokens (plus audio), on top of a ~25k text prompt, so about 85k+ input tokens per call. That is far larger than "short text questions". If admission control weighs by token cost or concurrency, these calls are more likely to be refused when a pool is near saturation, which would explain why short questions sometimes work. **This is an inference, not documented.** Lowering fps (1 or below) or using mediaResolution LOW would reduce the tokens and is a reasonable experiment.

### Gaps
- No Google source confirms or rules out size-weighted admission or load shedding.

## 5. Do 503 responses count against rate limits / quota (RPM/RPD)?

### Takeaway
Google staff say 503s are "unrelated to your quota". Several users, however, have dashboard evidence that 503 attempts **do** increment RPM/RPD, which leads to 429 daily exhaustion on the free tier (20 RPD on 3.8-flash in Sep 2026). Google has not answered this directly.

### Cited Findings
- Google staff: "503 ... errors are unrelated to your quota." — [Forum thread 124640](https://discuss.ai.google.dev/t/handling-429-503-errors-from-the-gemini-api/124640)
- User report from 2026-05-08 with dashboard data: May 5 had 382 requests at 16.2% success; May 6 had 152 at 1.3%; May 7 had 1,426 at 9.5%. The user states "failed 503 attempts are still counted toward my request quota (RPM/RPD)". They asked @Jon_Matthews for an official position and got no visible reply. — [Forum thread 144053](https://discuss.ai.google.dev/t/503-retries-are-counted-against-the-rpd-rpm-quota-making-the-effective-quota-a-fraction-of-whats-shown/144053)
- Free tier, 2026-09-23/24, gemini-3.8-flash: a run of 503s was followed by a 429 reporting the "Free Tier limit of 20 requests per day". The staff reply (Pooja Kapse) did not address whether 503s count. — [Forum thread 184644](https://discuss.ai.google.dev/t/gemini-api-503-errors-appear-to-consume-free-tier-rpd-leading-to-429-quota-exhaustion/184644)
- Usage data in the dashboard lags by about 15 minutes. — [Forum thread 124640](https://discuss.ai.google.dev/t/handling-429-503-errors-from-the-gemini-api/124640)

### Inferences
- With a free-tier RPD around 20 on flash models, aggressive retries through 3.8 → 3.7 → 3.6 → 3.5 → 3-flash-preview can burn through each model's daily quota on 503s alone. Retries should be bounded and spaced out, and fallback across models (each with its own quota) treated as consuming quota.

### Gaps
- No official confirmation either way. Whether TPM is also charged for 503'd large video requests is unknown.

## 6. Time-of-day patterns

### Takeaway
Google staff confirm that 503s are "more common during certain times of the day" without naming the hours. Third-party blogs point to US Pacific business hours as the peak, but their numbers are not verifiable.

### Cited Findings
- "These errors are more common during certain times of the day." — Google staff, [Forum thread 124640](https://discuss.ai.google.dev/t/handling-429-503-errors-from-the-gemini-api/124640)
- Third-party claim (low-confidence aggregator): about 45% failure at peak (9 AM–5 PM PT) against under 5% off-peak (2–7 AM PT). It suggests avoiding 9–11 AM, 1–3 PM and 6–10 PM PT and running batch jobs 11 PM–7 AM PT. — [Apiyi blog](https://help.apiyi.com/en/gemini-api-high-demand-503-error-solution-guide-en.html); [inventivehq](https://inventivehq.com/knowledge-base/gemini/gemini-503-model-is-overloaded)
- Counter-signal: one free-tier user's sequence of 503s and quota exhaustion ran overnight in Madrid time (03:25 on Sep 24, which is around 18:25 PT the day before, within the claimed evening peak). — [Forum thread 184644](https://discuss.ai.google.dev/t/gemini-api-503-errors-appear-to-consume-free-tier-rpd-leading-to-429-quota-exhaustion/184644)
- Paid users saw 503s continue for 12+ hours, which suggests some outages last longer than a daily peak. — [Forum thread 179804](https://discuss.ai.google.dev/t/persistent-503-on-gemini-3-7-flash-with-priority-tier-tier-2-paid-0-success-over-multiple-retries/179804)

### Inferences
- For a user in Spain/Europe, the European afternoon and evening overlap US PT morning and afternoon. European early morning (around 08:00–15:00 CET, which is 23:00–06:00 PT) is probably the quietest window, but this is not verified.

### Gaps
- Google publishes no hour-by-hour data. The percentages above come from unverified secondary sources.

## 7. Known incidents and status pages

### Takeaway
Many 503 incidents were reported through 2026, with a cluster in September 2026 (3.5/3.6/3.7/3.8 flash). Google's official status page for this API is aistudio.google.com/status, and third-party monitors such as StatusGator track it.

### Cited Findings
- StatusGator (monitoring Google AI Studio and Gemini API) logged a 503 incident on 2026-09-15 and API 503 errors on 2026-09-28. On 2026-09-03 Gemini 3.5 and 3.6 Flash were not loading or responding. — [StatusGator](https://statusgator.com/services/google-ai-studio-and-gemini-api)
- Forum threads cover a 503 that lasted more than 24 hours and the Gemini 3 Pro Image ("Nano Banana") 503 episodes. — [Forum thread 172445](https://discuss.ai.google.dev/t/gemini-api-is-returning-a-503-unavailable-high-demand-error-continuously-for-more-than-24-hours-and-i-need-help-understanding-the-cause-and-expected-resolution-time/172445); [Forum thread 126434](https://discuss.ai.google.dev/t/constant-503-error-high-demand-when-using-nano-banana-gemini-3-preview/126434)
- An AI Studio / API outage was reported in March 2026 (Nano Banana Pro). — [Apiyi blog](https://help.apiyi.com/en/google-gemini-aistudio-api-outage-march-2026-nano-banana-alternative-guide-en.html)
- One thread reported 503 on all requests for one account while another account worked. The cause was not confirmed publicly. — [Forum thread 124079](https://discuss.ai.google.dev/t/gemini-api-returns-503-unavailable-for-all-requests-on-one-account-works-on-another-account/124079)

### Inferences
- Before deep debugging, check aistudio.google.com/status (official) and StatusGator. Given the Sep 2026 cluster on 3.x flash models and the forum reports, the user's run of consecutive 503s across nearly all flash models probably reflects that period of global capacity pressure plus their large video requests. It is unlikely to be a bug in their code.

### Gaps
- I did not fetch aistudio.google.com/status directly to read its incident history for Sep–Oct 2026. Google Cloud's status page covers Vertex AI, not the Developer API.
