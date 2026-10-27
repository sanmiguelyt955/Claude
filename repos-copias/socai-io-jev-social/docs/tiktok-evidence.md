# Recorded TikTok CLI evidence

This is a real, dated socai CLI trace preserved as supporting evidence for the TikTok operations that Jev Social can choose. It is **not** a Jev end-to-end benchmark and it is **not** a claim that live TikTok results will remain the same.

## Search

| Field | Recorded value |
| --- | --- |
| Recorded at | 2026-09-05 02:40 CST |
| Operation | `tiktok.search` |
| Query | `OpenAI GPT-5` |
| Requested results | 5 |
| Captured results | 5 |
| CLI-reported duration | 7.570 seconds |
| Result status | Completed |

The five returned source cards were:

| # | Author | Captured topic | Source |
| ---: | --- | --- | --- |
| 1 | `@calebwritescode` | GPT-5 and its implications for the AI industry | [Open on TikTok](https://www.tiktok.com/@calebwritescode/video/7536463931590642958) |
| 2 | `@aitalks.ph` | GPT-5 launch overview | [Open on TikTok](https://www.tiktok.com/@aitalks.ph/video/7608878481535028498) |
| 3 | `@practicalyai` | AI creation workflows and model-assisted building | [Open on TikTok](https://www.tiktok.com/@practicalyai/video/7681468114441178388) |
| 4 | `@ofoxaidaily` | GPT model availability in Microsoft 365 Copilot | [Open on TikTok](https://www.tiktok.com/@ofoxaidaily/video/7681242689513278750) |
| 5 | `@roger.chappel` | A software developer's GPT-5 recap | [Open on TikTok](https://www.tiktok.com/@roger.chappel/video/7536079582953409810) |

These are retrieval results, not endorsements or independently verified claims. Search ranking, captions, engagement, availability, and access gates can change between runs.

## Video detail and media download

A separate recorded `tiktok.get-videos` operation opened this public source:

- [TechCrunch — Sam Altman reveals GPT-5](https://www.tiktok.com/@techcrunch/video/7535894874122358071)
- Captured author: `TechCrunch`
- Captured duration: 142 seconds
- Captured engagement at run time: 547,700 views, 22,500 likes, 996 comments, 3,682 shares, and 3,634 favorites
- Saved media: one 7,988,959-byte MP4 and one 95,592-byte poster image
- CLI-reported duration: 38.263 seconds

The operation was deliberately **not** reported as fully successful. Post metadata and media download completed, but comments were missing, so socai returned `video_detail_incomplete`. Jev Social preserves that kind of partial result instead of turning it into a success claim.

No downloaded third-party media, expiring CDN URL, browser snapshot, cookie, local filesystem path, or raw JSON is published here. The source post remains the verification surface.

## What this proves—and what it does not

This trace proves that the recorded CLI run returned five TikTok source cards and that a recorded detail operation downloaded a selected video's media while retaining an explicit missing-comments failure. It does not prove current availability, repeatable latency, claim accuracy, or an end-to-end Jev research result.

For an actual Jev-directed multi-step run, see the [recorded Instagram evidence report](example-report.md).
