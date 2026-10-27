import assert from "node:assert/strict";
import test from "node:test";

import {
  mediaPreviewCandidates,
  nextPreviewCandidate,
  previewTier,
  selectSummaryCards,
} from "../public/evidence-preview.js";

test("summary cards prefer previewable evidence, cap at four, and do not mutate the full evidence order", () => {
  const items = [
    { id: "text", title: "Text evidence" },
    { id: "image-a", thumbnail_url: "https://cdn.example/a.jpg" },
    { id: "remote", video: { url: "https://cdn.example/video.mp4" } },
    { id: "local", video: { browser_url: "/media/verified-token" } },
    { id: "image-b", cover_url: "https://cdn.example/b.jpg" },
  ];
  const originalOrder = items.map((item) => item.id);

  const selected = selectSummaryCards(items, 4);

  assert.deepEqual(selected.map((item) => item.id), ["local", "remote", "image-a", "image-b"]);
  assert.deepEqual(items.map((item) => item.id), originalOrder);
});

test("summary cards retain text-only evidence when fewer than four previews exist", () => {
  const items = [
    { id: "text-a", title: "A" },
    { id: "image", image_url: "https://cdn.example/image.jpg" },
    { id: "text-b", title: "B" },
  ];

  assert.deepEqual(selectSummaryCards(items, 4).map((item) => item.id), ["image", "text-a", "text-b"]);
  assert.equal(previewTier(items[0]), 3);
  assert.equal(previewTier(items[1]), 2);
});

test("media candidates fall through local video, remote video, images, and compact text fallback", () => {
  const item = {
    video: {
      browser_url: "/media/verified-token",
      url: "https://cdn.example/video.mp4",
      poster_url: "https://cdn.example/poster.jpg",
    },
    thumbnail_url: "https://cdn.example/thumbnail.jpg",
  };
  const candidates = mediaPreviewCandidates(item);
  assert.deepEqual(candidates.map(({ kind, src }) => [kind, src]), [
    ["local-video", "/media/verified-token"],
    ["remote-video", "https://cdn.example/video.mp4"],
    ["image", "https://cdn.example/poster.jpg"],
    ["image", "https://cdn.example/thumbnail.jpg"],
  ]);

  const failed = new Set(["/media/verified-token"]);
  assert.equal(nextPreviewCandidate(item, failed).kind, "remote-video");
  failed.add("https://cdn.example/video.mp4");
  assert.equal(nextPreviewCandidate(item, failed).kind, "image");
  failed.add("https://cdn.example/poster.jpg");
  failed.add("https://cdn.example/thumbnail.jpg");
  assert.deepEqual(nextPreviewCandidate(item, failed), { kind: "fallback", src: "" });
});

test("an expired or unplayable remote URL can fail without leaving an empty preview", () => {
  const expired = "https://cdn.example/expired.mp4";
  const item = { video_url: expired, title: "Still valid evidence" };

  assert.equal(nextPreviewCandidate(item).src, expired);
  assert.deepEqual(nextPreviewCandidate(item, new Set([expired])), { kind: "fallback", src: "" });
  assert.deepEqual(mediaPreviewCandidates({ video_url: "javascript:alert(1)" }), []);
});

test("an HTTPS media browser URL remains a remote video preview", () => {
  const source = "https://cdn.example/browser-video.mp4";
  const candidates = mediaPreviewCandidates({ media: [{ type: "video", browser_url: source }] });

  assert.deepEqual(candidates, [{ kind: "remote-video", src: source }]);
  assert.equal(previewTier({ media: [{ type: "video", browser_url: source }] }), 1);
});

test("HTTP media blocked by the page CSP cannot displace an HTTPS preview", () => {
  const items = [
    { id: "blocked", video_url: "http://cdn.example/blocked.mp4" },
    { id: "https-a", image_url: "https://cdn.example/a.jpg" },
    { id: "https-b", image_url: "https://cdn.example/b.jpg" },
    { id: "https-c", image_url: "https://cdn.example/c.jpg" },
    { id: "https-d", image_url: "https://cdn.example/d.jpg" },
  ];

  assert.deepEqual(mediaPreviewCandidates(items[0]), []);
  assert.deepEqual(selectSummaryCards(items, 4).map((item) => item.id), ["https-a", "https-b", "https-c", "https-d"]);
});
