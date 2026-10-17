"""Whisper's transformer in NumPy.

Encoder: two 1-D convolutions (the second with stride 2, so 3000 mel frames
become 1500 positions), sinusoidal-equivalent learned positions, then
pre-LayerNorm self-attention blocks. Decoder: token + position embeddings,
blocks of masked self-attention, cross-attention over the encoder output
and an MLP; the output projection is tied to the token embedding.
"""
import numpy as np


def _erf(x: np.ndarray) -> np.ndarray:
    # Abramowitz & Stegun 7.1.26 (max error 1.5e-7): exact GELU without scipy.
    sign = np.sign(x)
    x = np.abs(x)
    t = 1.0 / (1.0 + 0.3275911 * x)
    y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * np.exp(-x * x)
    return sign * y


_INV_SQRT2 = 0.7071067811865476  # a Python float, so float32 stays float32 under NumPy 2


def gelu(x: np.ndarray) -> np.ndarray:
    return 0.5 * x * (1.0 + _erf(x * _INV_SQRT2))


def layer_norm(x: np.ndarray, w: np.ndarray, b: np.ndarray, eps: float = 1e-5) -> np.ndarray:
    mean = x.mean(-1, keepdims=True)
    var = ((x - mean) ** 2).mean(-1, keepdims=True)
    return (x - mean) / np.sqrt(var + eps) * w + b


def softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max(-1, keepdims=True)
    e = np.exp(x)
    return e / e.sum(-1, keepdims=True)


def conv1d(x: np.ndarray, w: np.ndarray, b: np.ndarray, stride: int = 1) -> np.ndarray:
    """x: (C_in, T); w: (C_out, C_in, 3) with padding 1, like nn.Conv1d."""
    k = w.shape[-1]
    xp = np.pad(x, ((0, 0), (1, 1)))
    t_out = (xp.shape[1] - k) // stride + 1
    cols = np.stack([xp[:, j : j + stride * (t_out - 1) + 1 : stride] for j in range(k)])  # (k, C_in, T_out)
    return np.einsum("ock,kct->ot", w, cols, optimize=True) + b[:, None]


class Attention:
    """Multi-head attention over batched inputs: x is (B, T, d_model)."""

    def __init__(self, p: dict, prefix: str, n_heads: int):
        self.wq, self.bq = p[f"{prefix}.q_proj.weight"], p[f"{prefix}.q_proj.bias"]
        self.wk = p[f"{prefix}.k_proj.weight"]  # Whisper's key projection has no bias
        self.wv, self.bv = p[f"{prefix}.v_proj.weight"], p[f"{prefix}.v_proj.bias"]
        self.wo, self.bo = p[f"{prefix}.out_proj.weight"], p[f"{prefix}.out_proj.bias"]
        self.n_heads = n_heads
        self.head_dim = self.wq.shape[0] // n_heads

    def split(self, x: np.ndarray) -> np.ndarray:
        b, t, _ = x.shape
        return x.reshape(b, t, self.n_heads, self.head_dim).transpose(0, 2, 1, 3)  # (B, H, T, D)

    def keys_values(self, x: np.ndarray):
        return self.split(x @ self.wk.T), self.split(x @ self.wv.T + self.bv)

    def __call__(self, x: np.ndarray, k: np.ndarray, v: np.ndarray, mask: np.ndarray | None = None) -> np.ndarray:
        # k/v may have batch 1 (cross-attention over one audio) and broadcast over beams.
        q = self.split((x @ self.wq.T + self.bq) * self.head_dim**-0.5)
        scores = q @ k.transpose(0, 1, 3, 2)
        if mask is not None:
            scores = scores + mask
        out = softmax(scores) @ v  # (B, H, T, D)
        b, _, t, _ = out.shape
        return out.transpose(0, 2, 1, 3).reshape(b, t, -1) @ self.wo.T + self.bo


class Whisper:
    def __init__(self, params: dict, config: dict):
        self.p = params
        self.n_enc = config["encoder_layers"]
        self.n_dec = config["decoder_layers"]
        self.enc_heads = config["encoder_attention_heads"]
        self.dec_heads = config["decoder_attention_heads"]
        self.n_ctx = config["max_target_positions"]
        e, d = "model.encoder", "model.decoder"
        self.enc_attn = [Attention(params, f"{e}.layers.{i}.self_attn", self.enc_heads) for i in range(self.n_enc)]
        self.dec_self = [Attention(params, f"{d}.layers.{i}.self_attn", self.dec_heads) for i in range(self.n_dec)]
        self.dec_cross = [Attention(params, f"{d}.layers.{i}.encoder_attn", self.dec_heads) for i in range(self.n_dec)]
        self.tok_emb = params[f"{d}.embed_tokens.weight"]
        self.dec_pos = params[f"{d}.embed_positions.weight"]

    def _mlp(self, x: np.ndarray, prefix: str) -> np.ndarray:
        p = self.p
        h = gelu(x @ p[f"{prefix}.fc1.weight"].T + p[f"{prefix}.fc1.bias"])
        return h @ p[f"{prefix}.fc2.weight"].T + p[f"{prefix}.fc2.bias"]

    def encode(self, mel: np.ndarray) -> np.ndarray:
        """mel: (80, 3000) -> audio features (1500, d_model)."""
        p, e = self.p, "model.encoder"
        x = gelu(conv1d(mel, p[f"{e}.conv1.weight"], p[f"{e}.conv1.bias"]))
        x = gelu(conv1d(x, p[f"{e}.conv2.weight"], p[f"{e}.conv2.bias"], stride=2))
        x = (x.T + p[f"{e}.embed_positions.weight"][: x.shape[1]])[None]  # batch of one
        for i, attn in enumerate(self.enc_attn):
            pre = f"{e}.layers.{i}"
            h = layer_norm(x, p[f"{pre}.self_attn_layer_norm.weight"], p[f"{pre}.self_attn_layer_norm.bias"])
            k, v = attn.keys_values(h)
            x = x + attn(h, k, v)
            h = layer_norm(x, p[f"{pre}.final_layer_norm.weight"], p[f"{pre}.final_layer_norm.bias"])
            x = x + self._mlp(h, pre)
        return layer_norm(x[0], p[f"{e}.layer_norm.weight"], p[f"{e}.layer_norm.bias"]).astype(np.float32)

    def new_cache(self, audio_features: np.ndarray) -> dict:
        """Cross-attention keys/values are computed once per window and shared by
        every beam; self-attention keys/values grow by one position per step and
        hold one row per beam."""
        return {
            "cross": [a.keys_values(audio_features[None]) for a in self.dec_cross],
            "self": [None] * self.n_dec,
            "length": 0,
        }

    @staticmethod
    def reorder_cache(cache: dict, source: list[int]) -> None:
        """Beam search: row j of the cache now continues beam `source[j]`."""
        idx = np.asarray(source)
        cache["self"] = [(k[idx], v[idx]) for k, v in cache["self"]]

    def decode(self, tokens, cache: dict) -> np.ndarray:
        """Feeds `tokens` (B, n) after what the cache already holds and returns the
        logits for the last position of each row, shape (B, vocab). A flat list
        is taken as a single row."""
        tokens = np.asarray(tokens, dtype=np.int64)
        if tokens.ndim == 1:
            tokens = tokens[None]
        p, d = self.p, "model.decoder"
        offset = cache["length"]
        n = tokens.shape[1]
        if offset + n > self.n_ctx:
            raise ValueError("Se excedió el contexto del decoder (448 tokens).")
        x = self.tok_emb[tokens] + self.dec_pos[offset : offset + n]
        # Causal mask over the new positions; earlier positions are all visible.
        mask = np.triu(np.full((n, offset + n), -np.inf, dtype=np.float32), k=offset + 1)
        for i in range(self.n_dec):
            pre = f"{d}.layers.{i}"
            h = layer_norm(x, p[f"{pre}.self_attn_layer_norm.weight"], p[f"{pre}.self_attn_layer_norm.bias"])
            k_new, v_new = self.dec_self[i].keys_values(h)
            if cache["self"][i] is not None:
                k_old, v_old = cache["self"][i]
                k_new = np.concatenate([k_old, k_new], axis=2)
                v_new = np.concatenate([v_old, v_new], axis=2)
            cache["self"][i] = (k_new, v_new)
            x = x + self.dec_self[i](h, k_new, v_new, mask)
            h = layer_norm(x, p[f"{pre}.encoder_attn_layer_norm.weight"], p[f"{pre}.encoder_attn_layer_norm.bias"])
            ck, cv = cache["cross"][i]
            x = x + self.dec_cross[i](h, ck, cv)
            h = layer_norm(x, p[f"{pre}.final_layer_norm.weight"], p[f"{pre}.final_layer_norm.bias"])
            x = x + self._mlp(h, pre)
        cache["length"] = offset + n
        x = layer_norm(x[:, -1], p[f"{d}.layer_norm.weight"], p[f"{d}.layer_norm.bias"])
        return x @ self.tok_emb.T  # output projection tied to the embedding
