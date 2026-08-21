// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — in-memory vector store
//
// Holds the embedded chunks and answers top-k retrieval by cosine
// similarity. Also exposes keyword fallback (any token match) so that
// questions containing exact column names always surface the right chunk.
// ─────────────────────────────────────────────────────────────────────────

import { Embedder, cosine } from './embeddings.js';

export class VectorStore {
  constructor() {
    this.embedder = new Embedder();
    this.chunks = [];          // [{ id, family, text, meta, vector }]
    this.fitted = false;
  }

  /** Build the index from an array of chunks. */
  build(chunks) {
    // Two-pass: first fit the embedder (so IDF + vocab are ready), then embed.
    this.embedder.fit(chunks);
    this.chunks = chunks.map((c) => ({
      ...c,
      vector: this.embedder.embed(c.text),
    }));
    this.fitted = true;
    return this;
  }

  /** Retrieve top-k chunks for a query, with a small keyword boost. */
  retrieve(query, k = 5) {
    if (!this.fitted || !this.chunks.length) return [];
    const qVec = this.embedder.embed(query);
    const qTokens = new Set(query.toLowerCase().split(/[^a-z0-9_]+/i).filter((t) => t.length > 1));

    const scored = this.chunks.map((c) => {
      const sim = cosine(qVec, c.vector);
      // keyword boost: +0.05 per matched header-ish token in chunk text
      const textLower = c.text.toLowerCase();
      let boost = 0;
      for (const t of qTokens) {
        if (textLower.includes(t)) boost += 0.03;
      }
      return { ...c, score: sim + boost };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map(({ vector, ...rest }) => rest);
  }

  get size() {
    return this.chunks.length;
  }
}
