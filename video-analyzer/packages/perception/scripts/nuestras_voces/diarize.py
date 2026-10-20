"""Who speaks each transcript segment.

The recipe follows WeSpeaker's diarization (read in wespeaker/cli/speaker.py):

1. The speech in the transcript segments is cut into 1.5 s windows every
   0.75 s; windows that are mostly silence are dropped.
2. Each window becomes a 256-number voice print (WeSpeaker ResNet34), after
   subtracting the window's mean filterbank (CMN).
3. The prints are grouped by spectral clustering: a graph that links each
   window to its most similar 20 %, whose eigenvalue gap gives the number of
   speakers, then k-means on its eigenvectors. Groups whose voices are
   still alike (or that hold a single window) are merged afterwards, so one
   person is not split in two.
4. Each segment takes the speaker of most of its windows; a segment with no
   window takes the speaker of the nearest one.

Window-level clustering matters: a Whisper segment often spans the end of
one turn and the start of the next, and a single print per segment would
mix both voices. Speakers are numbered by first appearance: "Hablante 1"...
"""
import os

import numpy as np

from .fbank import FRAME_SHIFT, SAMPLE_RATE, kaldi_fbank

MODEL_REPO = "Wespeaker/wespeaker-voxceleb-resnet34-LM"
MODEL_FILE = "voxceleb_resnet34_LM.onnx"
MIN_SECONDS = 0.255
WINDOW_FRAMES = 150  # 1.5 s of 10 ms frames
PERIOD_FRAMES = 75  # 0.75 s
FRAMES_PER_SECOND = SAMPLE_RATE // FRAME_SHIFT
PRUNE = 0.2  # each window keeps links to its most similar 20 %...
# ...but never more than this many. Uncapped, 15 min of audio (827 windows)
# kept 166 links each, so any voice with fewer windows than that was tied to
# the others: six real voices of a documentary came out as two. WeSpeaker
# itself keeps about 10 neighbours below 1000 windows.
MAX_NEIGHBOURS = 20
MAX_SPEAKERS = 10
# Groups whose mean prints are closer than this (cosine) are one voice. The
# eigengap already finds a single group on 130 s of one LibriSpeech reader;
# on pyannote's two-speaker sample the two voices' groups score 0.51, so the
# bar sits well above that.
DEFAULT_MERGE_SIMILARITY = 0.7
MAX_WINDOWS = 4000  # about 50 min of speech; longer audio widens the step

_session = None


def _model():
    global _session
    if _session is None:
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download

        path = os.environ.get("DIARIZATION_MODEL_PATH") or hf_hub_download(MODEL_REPO, MODEL_FILE)
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        _session = ort.InferenceSession(path, opts, providers=["CPUExecutionProvider"])
    return _session


def _windows(begin: int, end: int, period: int = PERIOD_FRAMES) -> list[tuple[int, int]]:
    if end - begin <= WINDOW_FRAMES:
        return [(begin, end)]
    out = [(s, s + WINDOW_FRAMES) for s in range(begin, end - WINDOW_FRAMES + 1, period)]
    if out[-1][1] < end:
        out.append((end - WINDOW_FRAMES, end))
    return out


def embed_windows(feats: np.ndarray, windows: list[tuple[int, int]], batch: int = 32) -> np.ndarray:
    """L2-normalised voice prints, one per (begin, end) frame window."""
    session = _model()
    out = np.zeros((len(windows), 256), np.float32)
    by_len: dict[int, list[int]] = {}
    for i, (b, e) in enumerate(windows):
        by_len.setdefault(e - b, []).append(i)
    for idxs in by_len.values():  # equal lengths batch without padding
        for k in range(0, len(idxs), batch):
            chunk = idxs[k : k + batch]
            x = np.stack([feats[windows[i][0] : windows[i][1]] for i in chunk])
            x = x - x.mean(axis=1, keepdims=True)
            out[chunk] = session.run(None, {"feats": x.astype(np.float32)})[0]
    norms = np.linalg.norm(out, axis=1, keepdims=True)
    return out / np.maximum(norms, 1e-9)


def _kmeans(x: np.ndarray, k: int, seed: int = 0, restarts: int = 10) -> np.ndarray:
    rng = np.random.default_rng(seed)
    best, best_labels = np.inf, np.zeros(len(x), np.int64)
    for _ in range(restarts):
        centers = x[rng.choice(len(x), k, replace=False)]
        for _ in range(100):
            labels = np.argmin(((x[:, None, :] - centers[None]) ** 2).sum(-1), axis=1)
            new = np.stack([x[labels == j].mean(0) if (labels == j).any() else centers[j] for j in range(k)])
            if np.allclose(new, centers):
                break
            centers = new
        inertia = ((x - centers[labels]) ** 2).sum()
        if inertia < best:
            best, best_labels = inertia, labels
    return best_labels


def spectral_cluster(prints: np.ndarray, max_speakers: int = MAX_SPEAKERS) -> np.ndarray:
    """Labels for L2-normalised prints; the number of groups comes from the eigengap."""
    n = len(prints)
    if n < 4:
        return np.zeros(n, np.int64)
    sim = prints @ prints.T
    keep = max(2, min(int(np.ceil(PRUNE * n)), MAX_NEIGHBOURS))
    affinity = np.zeros_like(sim)
    top = np.argpartition(-sim, keep - 1, axis=1)[:, :keep]
    rows = np.arange(n)[:, None]
    affinity[rows, top] = sim[rows, top]
    affinity = np.maximum((affinity + affinity.T) / 2, 0)
    np.fill_diagonal(affinity, 0)
    laplacian = np.diag(affinity.sum(axis=1)) - affinity
    values, vectors = np.linalg.eigh(laplacian)
    m = min(max_speakers, n - 1)
    k = int(np.argmax(np.diff(values[: m + 1]))) + 1
    return np.zeros(n, np.int64) if k <= 1 else _kmeans(vectors[:, :k], k)


def merge_alike(prints: np.ndarray, labels: np.ndarray, min_similarity: float) -> np.ndarray:
    """Joins groups that sound like the same person, and single-window groups."""
    labels = labels.copy()
    while True:
        groups = sorted(set(labels.tolist()))
        if len(groups) < 2:
            return labels
        cents = np.stack([prints[labels == g].mean(axis=0) for g in groups])
        cents /= np.maximum(np.linalg.norm(cents, axis=1, keepdims=True), 1e-9)
        sim = cents @ cents.T
        np.fill_diagonal(sim, -np.inf)
        sizes = np.array([(labels == g).sum() for g in groups])
        lone = np.flatnonzero(sizes < 2)
        if len(lone):
            a = int(lone[0])
            b = int(np.argmax(sim[a]))
        else:
            a, b = np.unravel_index(np.argmax(sim), sim.shape)
            if sim[a, b] < min_similarity:
                return labels
        labels[labels == groups[a]] = groups[b]


def diarize_segments(audio: np.ndarray, segments: list[dict], min_similarity: float | None = None) -> list[str | None]:
    """A speaker name per segment ({"start", "end"} in seconds); all None when there is no speech to print."""
    from nuestro_whisper.transcribe import voiced_frames

    if min_similarity is None:
        min_similarity = float(os.environ.get("DIARIZATION_MERGE_SIMILARITY", DEFAULT_MERGE_SIMILARITY))
    feats = kaldi_fbank(audio)
    voiced = np.zeros(len(feats) + WINDOW_FRAMES, bool)
    loud = voiced_frames(audio)
    voiced[loud[loud < len(voiced)]] = True

    spans = []
    for i, s in enumerate(segments):
        b = int(round(s["start"] * FRAMES_PER_SECOND))
        e = min(int(round(s["end"] * FRAMES_PER_SECOND)), len(feats))
        if (e - b) / FRAMES_PER_SECOND >= MIN_SECONDS:
            spans.append((i, b, e))
    speech = sum(e - b for _, b, e in spans)
    period = max(PERIOD_FRAMES, int(np.ceil(speech / MAX_WINDOWS)))

    windows, owner = [], []
    for i, b, e in spans:
        for w in _windows(b, e, period):
            if voiced[w[0] : w[1]].mean() >= 0.5:  # mostly sound, not a pause
                windows.append(w)
                owner.append(i)
    if not windows:
        return [None] * len(segments)

    prints = embed_windows(feats, windows)
    labels = merge_alike(prints, spectral_cluster(prints), min_similarity)

    # Each segment: the label covering most of its windows' frames.
    votes: dict[int, dict[int, int]] = {}
    for (b, e), i, label in zip(windows, owner, labels):
        votes.setdefault(i, {}).setdefault(int(label), 0)
        votes[i][int(label)] += e - b
    order: dict[int, int] = {}
    named: dict[int, str] = {}
    for i in sorted(votes):
        label = max(votes[i], key=votes[i].get)
        order.setdefault(label, len(order) + 1)
        named[i] = f"Hablante {order[label]}"
    mids = {i: (segments[i]["start"] + segments[i]["end"]) / 2 for i in named}
    out = []
    for i, s in enumerate(segments):
        if i in named:
            out.append(named[i])
        else:
            mid = (s["start"] + s["end"]) / 2
            out.append(named[min(named, key=lambda j: abs(mids[j] - mid))])
    return out
