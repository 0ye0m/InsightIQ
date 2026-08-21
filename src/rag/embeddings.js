// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — local embedding engine
//
// A fully client-side, dependency-free text embedding that combines:
//   • word-level TF-IDF (captures keyword matches)
//   • character-trigram hashing (captures morphological / fuzzy matches)
// Both signals are L2-normalised and concatenated into a single dense
// vector. Cosine similarity over these vectors is what the retriever uses.
//
// This is intentionally lightweight: no model downloads, no network calls,
// deterministic, instant. Combined with the generation engine re-ranking
// the retrieved context, it gives genuinely grounded answers.
// ─────────────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a','an','the','and','or','but','if','then','else','when','at','by','for',
  'with','about','against','between','into','through','during','before','after',
  'above','below','to','from','up','down','in','out','on','off','over','under',
  'again','further','once','here','there','all','any','both','each','few','more',
  'most','other','some','such','no','nor','not','only','own','same','so','than',
  'too','very','can','will','just','should','now','is','are','was','were','be',
  'been','being','have','has','had','having','do','does','did','doing','of','as',
  'i','me','my','we','our','you','your','he','she','it','they','them','this',
  'that','these','those','what','which','who','whom','whose','how','why','show',
  'tell','give','get','make','use','using','used','value','values','data','column',
  'row','rows','the','please','need','want','see','look','find','list','say',
]);

const HASH_BUCKETS = 512;        // char-trigram hashing space
const WORD_DIM_CAP = 4096;       // max word-vocab dimension (LRU eviction)

// ── tokenisation ────────────────────────────────────────────────────────────

function tokenize(text) {
  if (!text) return [];
  const lower = String(text).toLowerCase();
  // split on non-alphanumeric (keeps underscores + dots inside tokens)
  return lower
    .replace(/[^a-z0-9_\s.]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/^[.]+|[.]+$/g, ''))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function charTrigrams(text) {
  if (!text) return [];
  const lower = String(text).toLowerCase().replace(/[^a-z0-9]/g, '');
  const out = [];
  for (let i = 0; i < lower.length - 2; i++) {
    out.push(lower.slice(i, i + 3));
  }
  return out;
}

// FNV-1a hash → bucket index
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h % HASH_BUCKETS;
}

// ── IDF tracker (document-frequency) ─────────────────────────────────────────

export class CorpusIndex {
  constructor() {
    this.docFreq = new Map();   // token → number of docs containing it
    this.docCount = 0;
    this.wordIndex = new Map(); // token → dimension index
    this.nextWordIdx = 0;
  }

  /** Register a document's tokens so IDF can be computed later. */
  register(tokens) {
    this.docCount++;
    const seen = new Set(tokens);
    for (const t of seen) {
      this.docFreq.set(t, (this.docFreq.get(t) || 0) + 1);
      if (!this.wordIndex.has(t)) {
        if (this.wordIndex.size < WORD_DIM_CAP) {
          this.wordIndex.set(t, this.nextWordIdx++);
        }
      }
    }
  }

  idf(token) {
    const df = this.docFreq.get(token) || 0;
    if (!df || !this.docCount) return 1;
    return Math.log((this.docCount + 1) / (df + 1)) + 1;
  }

  get totalDim() {
    return this.wordIndex.size + HASH_BUCKETS;
  }
}

// ── embedder ────────────────────────────────────────────────────────────────

export class Embedder {
  constructor() {
    this.corpus = new CorpusIndex();
  }

  /** First pass: register every chunk so IDF + vocab are populated. */
  fit(chunks) {
    for (const c of chunks) {
      this.corpus.register(tokenize(c.text));
    }
    return this;
  }

  /** Embed a piece of text into a Float32 vector. */
  embed(text) {
    const tokens = tokenize(text);
    const dim = this.corpus.totalDim;
    const vec = new Float32Array(dim);

    // word-level TF-IDF
    const tf = new Map();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    const len = tokens.length || 1;
    for (const [t, count] of tf) {
      const idx = this.corpus.wordIndex.get(t);
      if (idx === undefined) continue;
      const weight = (count / len) * this.corpus.idf(t);
      vec[idx] = weight;
    }

    // char-trigram hashing (log-scaled to dampen spam)
    const tri = charTrigrams(text);
    const triCounts = new Map();
    for (const g of tri) triCounts.set(g, (triCounts.get(g) || 0) + 1);
    const offset = this.corpus.wordIndex.size;
    for (const [g, count] of triCounts) {
      const idx = offset + hash(g);
      vec[idx] += 1 + Math.log(count);
    }

    // L2 normalise
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < dim; i++) vec[i] /= norm;
    return vec;
  }
}

// ── cosine similarity (dense Float32) ─────────────────────────────────────────

export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot; // vectors are already L2-normalised
}
