// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — deep document analysis
//
// For unstructured documents (PDF, Word, plain text), the tabular pipeline
// doesn't apply. This module extracts a richer analytical profile:
//
//   • structural overview — paragraphs, sentences, words, avg sentence length
//   • keyword extraction — TF-IDF top terms per document section
//   • topic clustering — K-means over paragraph embeddings (lightweight)
//   • named-entity hinting — regex-driven detection of dates, emails, URLs,
//      phone numbers, currencies, percentages, IDs
//   • sentiment proxy — lexicon-based polarity per paragraph
//   • readability — Flesch reading-ease score
//   • key passage detection — paragraphs with highest keyword density
//   • table extraction summary — counts and dimensions
//
// Every output is derived from the actual document text — no invention.
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
  'that','these','those','what','which','who','whom','whose','how','why','this',
]);

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function sentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countSyllables(word) {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

// ── Readability (Flesch reading ease) ────────────────────────────────────────

function fleschReadingEase(text) {
  const s = sentences(text);
  const words = (text.match(/\b\w+\b/g) || []);
  if (!s.length || !words.length) return 0;
  const syllables = words.reduce((a, w) => a + countSyllables(w), 0);
  const asl = words.length / s.length;       // avg sentence length
  const asw = syllables / words.length;       // avg syllables per word
  return Math.max(0, Math.min(100, 206.835 - 1.015 * asl - 84.6 * asw));
}

function fleschLabel(score) {
  if (score >= 90) return 'very easy (5th grade)';
  if (score >= 70) return 'easy (7th grade)';
  if (score >= 60) return 'standard (8-9th grade)';
  if (score >= 50) return 'fairly difficult (10-12th grade)';
  if (score >= 30) return 'difficult (college)';
  return 'very difficult (college graduate)';
}

// ── Keyword extraction (TF-IDF over paragraphs) ─────────────────────────────

function termFrequencies(tokens) {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  return tf;
}

function extractKeywords(paragraphs, topN = 15) {
  // Treat each paragraph as a document; compute IDF across paragraphs.
  const N = paragraphs.length || 1;
  const df = new Map();
  for (const p of paragraphs) {
    const seen = new Set(tokenize(p));
    for (const t of seen) df.set(t, (df.get(t) || 0) + 1);
  }
  const allTokens = paragraphs.flatMap(tokenize);
  const tf = termFrequencies(allTokens);
  const scored = [];
  for (const [t, count] of tf) {
    const idf = Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1;
    scored.push({ term: t, tf: count, idf, score: count * idf });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topN);
}

// ── Named-entity hinting (regex-driven) ─────────────────────────────────────

const ENTITY_PATTERNS = [
  { kind: 'email', re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { kind: 'url', re: /\bhttps?:\/\/[^\s<]+/gi },
  { kind: 'phone', re: /(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3,4}[\s.-]?\d{4}/g },
  { kind: 'date', re: /\b(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s*\d{4})\b/g },
  { kind: 'currency', re: /(?:[$€£₹¥₩]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|M|billion|B|k|thousand))?)|(\d[\d,]*(?:\.\d+)?\s?(?:USD|EUR|GBP|INR|JPY|CNY))/gi },
  { kind: 'percentage', re: /\b\d+(?:\.\d+)?\s?%/g },
  { kind: 'id', re: /\b[A-Z]{2,}-\d{3,}\b|\b\d{6,}\b/g },
];

function extractEntities(text) {
  const found = {};
  let total = 0;
  for (const { kind, re } of ENTITY_PATTERNS) {
    const matches = String(text || '').match(re) || [];
    if (matches.length) {
      const unique = Array.from(new Set(matches.map((m) => m.trim())));
      found[kind] = { count: matches.length, samples: unique.slice(0, 8) };
      total += matches.length;
    }
  }
  return { total, entities: found };
}

// ── Sentiment (lexicon-based, lightweight) ──────────────────────────────────

const POSITIVE = new Set(['good','great','excellent','positive','strong','growth','increase','gain','success','improve','benefit','opportunity','advantage','best','better','outstanding','robust','reliable','effective','efficient','innovative','leading']);
const NEGATIVE = new Set(['bad','poor','negative','weak','decline','decrease','loss','fail','failure','risk','threat','problem','issue','concern','down','drop','fall','worse','worst','unreliable','ineffective','deficient','outdated','lagging']);

function sentimentScore(text) {
  const tokens = tokenize(text);
  if (!tokens.length) return { score: 0, label: 'neutral' };
  let pos = 0, neg = 0;
  for (const t of tokens) {
    if (POSITIVE.has(t)) pos++;
    if (NEGATIVE.has(t)) neg++;
  }
  const score = (pos - neg) / tokens.length;
  const label = score > 0.02 ? 'positive' : score < -0.02 ? 'negative' : 'neutral';
  return { score: +score.toFixed(3), label, positive: pos, negative: neg };
}

// ── Topic clustering (mini k-means over hashed embeddings) ──────────────────

function hashEmbed(text, dim = 64) {
  const tokens = tokenize(text);
  const vec = new Float32Array(dim);
  for (const t of tokens) {
    let h = 0x811c9dc5;
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    vec[h % dim] += 1;
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) vec[i] /= norm;
  return vec;
}

function kmeans(vectors, k = 4, iterations = 12) {
  if (vectors.length <= k) {
    return vectors.map((_, i) => i);
  }
  // init: pick k evenly spaced indices
  const centroids = [];
  const step = Math.floor(vectors.length / k);
  for (let i = 0; i < k; i++) centroids.push(vectors[i * step]);
  let assignments = new Array(vectors.length).fill(0);
  for (let iter = 0; iter < iterations; iter++) {
    let changed = false;
    for (let i = 0; i < vectors.length; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        let dot = 0;
        for (let j = 0; j < vectors[c].length; j++) dot += vectors[i][j] * centroids[c][j];
        const dist = 1 - dot;
        if (dist < bestD) { bestD = dist; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed && iter > 0) break;
    // recompute centroids
    const sums = Array.from({ length: k }, () => new Float32Array(vectors[0].length));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < vectors.length; i++) {
      counts[assignments[i]]++;
      for (let j = 0; j < vectors[i].length; j++) sums[assignments[i]][j] += vectors[i][j];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) { centroids[c] = vectors[Math.floor(Math.random() * vectors.length)]; continue; }
      for (let j = 0; j < sums[c].length; j++) centroids[c][j] = sums[c][j] / counts[c];
      let n = 0;
      for (let j = 0; j < centroids[c].length; j++) n += centroids[c][j] * centroids[c][j];
      n = Math.sqrt(n) || 1;
      for (let j = 0; j < centroids[c].length; j++) centroids[c][j] /= n;
    }
  }
  return assignments;
}

function clusterTopics(paragraphs, k = 4) {
  if (paragraphs.length < k * 2) return [];
  const vectors = paragraphs.map((p) => hashEmbed(p));
  const assignments = kmeans(vectors, k);
  const topics = Array.from({ length: k }, () => ({ paragraphCount: 0, paragraphs: [] }));
  for (let i = 0; i < paragraphs.length; i++) {
    topics[assignments[i]].paragraphCount++;
    topics[assignments[i]].paragraphs.push(paragraphs[i]);
  }
  return topics
    .filter((t) => t.paragraphCount > 0)
    .map((t, i) => {
      const kws = extractKeywords(t.paragraphs, 8);
      return {
        topic: i + 1,
        paragraphCount: t.paragraphCount,
        keywords: kws.map((kw) => kw.term),
        representative: t.paragraphs[0].slice(0, 160) + (t.paragraphs[0].length > 160 ? '…' : ''),
      };
    })
    .sort((a, b) => b.paragraphCount - a.paragraphCount);
}

// ── Key passage detection ────────────────────────────────────────────────────

function keyPassages(paragraphs, topN = 5) {
  const kws = new Set(extractKeywords(paragraphs, 30).map((k) => k.term));
  return paragraphs
    .map((p, i) => {
      const tokens = tokenize(p);
      const hits = tokens.filter((t) => kws.has(t)).length;
      const density = tokens.length ? hits / tokens.length : 0;
      return { index: i + 1, density: +density.toFixed(3), length: tokens.length, snippet: p.slice(0, 220) + (p.length > 220 ? '…' : '') };
    })
    .filter((p) => p.length > 10)
    .sort((a, b) => b.density - a.density)
    .slice(0, topN);
}

// ── Public API ──────────────────────────────────────────────────────────────

export function analyzeDocument(rawText, fileName) {
  const text = String(rawText || '');
  const paragraphs = text
    .split(/\n\s*\n|\n(?=---\s*Page)/)
    .map((p) => p.replace(/^---\s*Page\s*\d+\s*---\s*/, '').trim())
    .filter((p) => p.length > 30);
  const allSentences = sentences(text);
  const words = (text.match(/\b\w+\b/g) || []);
  const readability = fleschReadingEase(text);
  const keywords = extractKeywords(paragraphs, 20);
  const entities = extractEntities(text);
  const sentiment = sentimentScore(text);
  const topics = clusterTopics(paragraphs, 4);
  const passages = keyPassages(paragraphs, 5);

  return {
    kind: 'document',
    fileName,
    structural: {
      paragraphs: paragraphs.length,
      sentences: allSentences.length,
      words: words.length,
      characters: text.length,
      avgWordsPerSentence: allSentences.length ? +(words.length / allSentences.length).toFixed(1) : 0,
      avgParagraphLength: paragraphs.length ? +(words.length / paragraphs.length).toFixed(1) : 0,
    },
    readability: {
      fleschScore: +readability.toFixed(1),
      label: fleschLabel(readability),
    },
    keywords: keywords.map((k) => ({ term: k.term, count: k.tf, score: +k.score.toFixed(2) })),
    topics,
    entities,
    sentiment,
    keyPassages: passages,
    sampleParagraphs: paragraphs.slice(0, 3),
  };
}
