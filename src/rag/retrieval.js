// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — enhanced retrieval pipeline
//
// Adds two layers on top of the basic vector store:
//   • query expansion — rewrites the user's question into 2-3 paraphrases
//      so lexical variants are captured (e.g. "top region" → "best region"
//      → "highest performing region")
//   • re-ranking      — combines cosine similarity with a small keyword
//      overlap score and a source-family priority (column_stats > insights
//      > row_group) to surface the most authoritative chunk first
// ─────────────────────────────────────────────────────────────────────────

import { VectorStore } from './vectorStore.js';
import { chunkAnalysis } from './chunker.js';
import { generateAnswer } from '../engine/chat.js';

const TOP_K = 6;
const FAMILY_PRIORITY = {
  column_stats: 0.10,
  insights: 0.08,
  correlations: 0.06,
  summary: 0.04,
  row_group: 0.02,
};

// ── query expansion (deterministic — no LLM call) ───────────────────────────

const EXPANSION_TEMPLATES = [
  (q) => q,
  (q) => q.replace(/\b(top|highest|best|max|largest|biggest)\b/i, 'maximum'),
  (q) => q.replace(/\b(bottom|lowest|worst|min|smallest)\b/i, 'minimum'),
  (q) => q.replace(/\bhow many\b/i, 'count of'),
  (q) => q.replace(/\baverage\b/i, 'mean'),
];

function expandQuery(query) {
  const variants = new Set([query]);
  for (const tpl of EXPANSION_TEMPLATES) {
    const v = tpl(query);
    if (v && v !== query) variants.add(v);
  }
  return Array.from(variants);
}

// ── re-ranking ─────────────────────────────────────────────────────────────

function rerank(query, retrieved) {
  const qTokens = new Set(query.toLowerCase().split(/[^a-z0-9_]+/i).filter((t) => t.length > 1));
  return retrieved
    .map((c) => {
      const familyBoost = FAMILY_PRIORITY[c.family] || 0;
      const textLower = c.text.toLowerCase();
      let keywordOverlap = 0;
      for (const t of qTokens) {
        if (textLower.includes(t)) keywordOverlap += 0.04;
      }
      return { ...c, score: c.score + familyBoost + keywordOverlap };
    })
    .sort((a, b) => b.score - a.score);
}

// ── pipeline ────────────────────────────────────────────────────────────────

export class RetrievalPipeline {
  constructor() {
    this.store = new VectorStore();
    this.analysis = null;
    this.ready = false;
  }

  index(analysis) {
    this.analysis = analysis;
    const chunks = chunkAnalysis(analysis);
    this.store.build(chunks);
    this.ready = true;
    return this.store.size;
  }

  async ask(question, { history = [], onToken } = {}) {
    if (!this.ready) {
      return {
        answer: 'No dataset has been analysed yet. Upload a file and run an analysis first.',
        sources: [],
      };
    }

    // 1. Query expansion
    const variants = expandQuery(question);

    // 2. Retrieve per variant, merge by chunk id (max score wins)
    const byId = new Map();
    for (const v of variants) {
      const retrieved = this.store.retrieve(v, TOP_K);
      for (const r of retrieved) {
        const prev = byId.get(r.id);
        if (!prev || r.score > prev.score) byId.set(r.id, r);
      }
    }
    const merged = Array.from(byId.values());

    // 3. Re-rank
    const reranked = rerank(question, merged).slice(0, TOP_K);
    if (!reranked.length) {
      return {
        answer: "I couldn't find any relevant context in the current dataset for that question.",
        sources: [],
      };
    }

    // 4. Build grounded context
    const contextBlock = reranked
      .map((c, i) => `[${i + 1}] ${c.text}`)
      .join('\n\n');

    // 5. Generate answer
    const answer = await generateAnswer(question, contextBlock, reranked, history, { onToken });

    return {
      answer,
      sources: reranked.map((c) => ({
        id: c.id,
        family: c.family,
        source: c.meta?.source || c.family,
        score: c.score,
        snippet: c.text.slice(0, 160) + (c.text.length > 160 ? '…' : ''),
      })),
    };
  }
}
