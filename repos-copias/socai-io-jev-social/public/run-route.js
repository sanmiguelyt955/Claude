const RUN_ID = /^[A-Za-z0-9_.-]+$/;

export function parseRunRoute(hash = "") {
  if (hash === "#results") return { view: "results", id: "" };
  const match = hash.match(/^#results\/([^/]+)$/);
  if (!match || !RUN_ID.test(match[1])) return null;
  return { view: "results", id: match[1] };
}

export function resultHash(id = "") {
  return id && RUN_ID.test(id) ? `#results/${id}` : "#results";
}
