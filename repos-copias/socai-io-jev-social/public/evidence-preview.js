const HTTPS_URL = /^https:\/\//i;

export function mediaPreviewCandidates(item = {}) {
  const media = Array.isArray(item?.media) ? item.media : [];
  const candidates = [];
  const seen = new Set();
  const add = (kind, value) => {
    const src = typeof value === "string" ? value.trim() : "";
    if (!src || seen.has(src)) return;
    const local = src.startsWith("/media/");
    if (kind === "local-video" && !local) return;
    if (kind === "remote-video" && !HTTPS_URL.test(src)) return;
    if (kind === "image" && !local && !HTTPS_URL.test(src)) return;
    seen.add(src);
    candidates.push({ kind, src });
  };

  for (const source of [
    item?.video?.browser_url,
    item?.video?.local_url,
    item?.video_browser_url,
    item?.browser_url,
    ...media.filter((entry) => entry?.type === "video").flatMap((entry) => [entry?.browser_url, entry?.local_url]),
  ]) add("local-video", source);

  for (const source of [
    item?.video?.url,
    item?.video?.play_url,
    item?.video?.play_addr,
    item?.video?.download_url,
    item?.video_url,
    item?.play_url,
    item?.play_addr,
    ...media.filter((entry) => entry?.type === "video").flatMap((entry) => [entry?.browser_url, entry?.url, entry?.play_url]),
  ]) add("remote-video", source);

  for (const source of [
    item?.video?.poster_browser_url,
    item?.video?.poster_url,
    item?.cover_url,
    item?.cover,
    item?.thumbnail_url,
    item?.thumbnail,
    item?.image_url,
    item?.image,
    ...media.flatMap((entry) => [
      entry?.poster_browser_url,
      entry?.poster_url,
      entry?.thumbnail_url,
      entry?.type === "video" ? undefined : entry?.browser_url,
      entry?.type === "video" ? undefined : entry?.url,
    ]),
  ]) add("image", source);

  return candidates;
}

export function nextPreviewCandidate(item, failedSources = new Set()) {
  const failed = failedSources instanceof Set ? failedSources : new Set(failedSources || []);
  return mediaPreviewCandidates(item).find((candidate) => !failed.has(candidate.src)) || { kind: "fallback", src: "" };
}

export function previewTier(item) {
  const kind = mediaPreviewCandidates(item)[0]?.kind;
  if (kind === "local-video") return 0;
  if (kind === "remote-video") return 1;
  if (kind === "image") return 2;
  return 3;
}

export function selectSummaryCards(items, limit = 4) {
  const count = Number.isInteger(limit) && limit > 0 ? limit : 4;
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item, index) => ({ item, index, tier: previewTier(item) }))
    .sort((left, right) => left.tier - right.tier || left.index - right.index)
    .slice(0, count)
    .map(({ item }) => item);
}
