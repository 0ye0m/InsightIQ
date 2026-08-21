# InsightIQ

> **From raw data to real intelligence.** Upload any dataset and InsightIQ
> cleans it, profiles it, computes real statistics, builds interactive
> visualisations, and answers your questions — all grounded in your actual
> data, never invented.

InsightIQ is a RAG-based intelligent data analytics platform. It runs
end-to-end in the browser — there is no separate backend to deploy.

---

## Why this is different

Most "AI data analysis" demos send a tiny sample of your data to a
generation endpoint and let it invent every statistic, KPI, and chart
value. The numbers look authoritative but they are fabricated.

InsightIQ does the opposite:

| Layer | How it works |
|-------|--------------|
| **Parsing** | Robust CSV / TSV / JSON / Excel parsing with PapaParse + SheetJS. |
| **Cleaning** | Deterministic type inference, value coercion, duplicate removal, imputation — all reproducible. |
| **Statistics** | Real Pandas-style `describe()`: mean, median, std dev, quartiles, IQR outliers, Pearson correlation matrix. Nothing invented. |
| **Quality score** | A weighted 0–100 score with a transparent breakdown across completeness, uniqueness, consistency, type richness, and volume. |
| **Insights** | Plain-English insights, anomalies, KPIs, and forward signals derived directly from the computed statistics. |
| **Visualisations** | Every chart (bar, line, doughnut, histogram, scatter, area, radar, correlation heatmap) is built from real aggregated data. |
| **RAG chat** | A genuine retrieval-augmented pipeline: the dataset + insights + stats are chunked, embedded in-browser (TF-IDF + char-n-gram hashing), indexed in an in-memory vector store, and retrieved per question. The generation engine then answers using only the retrieved context — with source citations. |

---

## Architecture

```
src/
├── config/providers.js      # Failover chain + .env key wiring
├── lib/                     # Deterministic data layer
│   ├── parseFile.js         # CSV / TSV / JSON / Excel parsing
│   ├── dataCleaner.js       # Type inference + coercion + dedup + imputation
│   ├── dataHelpers.js       # Shared numeric / categorical helpers
│   ├── statistics.js        # Pandas-style describe() + correlation
│   ├── insights.js          # Deterministic insight / KPI / anomaly generation
│   ├── chartData.js         # Real chart datasets from cleaned data
│   ├── qualityScore.js      # Weighted 0-100 quality score
│   └── exportReport.js      # Excel / CSV / JSON / PDF export
├── rag/                     # Retrieval-Augmented Generation layer
│   ├── embeddings.js        # Local TF-IDF + char-n-gram embedder (no downloads)
│   ├── chunker.js           # Chunks dataset + insights + stats into a corpus
│   ├── vectorStore.js       # In-memory vector index + top-k cosine retrieval
│   └── retrieval.js         # RetrievalPipeline orchestration
├── engine/                  # Generation client (provider-agnostic, failover)
│   ├── client.js            # Unified chatCompletion with auto-failover
│   ├── generate.js          # Narrative generation (grounded in real stats)
│   └── chat.js              # RAG-grounded Q&A
├── components/              # React UI
│   ├── Sidebar.jsx / Topbar.jsx / UploadZone.jsx
│   ├── OverviewTab.jsx / ChartsTab.jsx / DataTableTab.jsx / ChatTab.jsx
│   ├── QualityRing.jsx / KpiCard.jsx / SettingsModal.jsx
│   ├── Charts.jsx           # Chart.js wrappers (bar/line/doughnut/histogram/scatter/radar/area/heatmap)
│   └── ChartErrorBoundary.jsx
├── hooks/
│   ├── useAnalysis.js       # parse -> clean -> stats -> quality -> insights -> charts -> RAG index -> narrative
│   └── useTheme.js
├── App.jsx                  # Application shell
├── main.jsx
└── index.css                # Design system (dark glassmorphism + light theme)
```

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure engine keys

Copy the example and fill in your keys:

```bash
cp .env.example .env
```

```env
# Primary engine (fast, generous free tier)
VITE_GROQ_API_KEY=...

# Secondary engine (fallback when the primary is rate-limited)
VITE_OPENROUTER_API_KEY=...
```

Keys can also be entered at runtime via the **Settings** modal (gear icon
in the sidebar) — they are stored in `localStorage` and take precedence
over `.env`. This lets you run the deployed build without rebuild access.

### 3. Run

```bash
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
npm run preview  # preview the production build
```

---

## How the RAG pipeline works

This is genuine retrieval-augmented generation, not prompt-stuffing:

1. **Chunking** — After analysis, the dataset is split into a retrieval
   corpus of self-contained chunks:
   - an executive summary chunk
   - one chunk per column (with its real statistics)
   - one chunk per insight / anomaly / prediction / KPI
   - correlation-pair chunks
   - row-group windows (25 rows each, sampled) so "show me…" questions
     can surface actual records.

2. **Embedding** — Each chunk is embedded in-browser using a hybrid
   local embedder:
   - word-level TF-IDF (captures keyword matches)
   - character-trigram hashing into 512 buckets (captures morphological
     and fuzzy matches)
   Both signals are L2-normalised and concatenated. No model download,
   no network call, fully deterministic.

3. **Indexing** — Vectors are stored in an in-memory `VectorStore`.

4. **Retrieval** — On each question, the query is embedded with the same
   embedder and the top-k (k=6) chunks are returned by cosine similarity,
   with a small keyword-boost for exact header token matches.

5. **Generation** — The retrieved chunks are passed as a strict context
   block to the generation engine with the system instruction
   *"Answer using ONLY the context provided."* The answer is returned
   alongside the source chunks, which the UI renders as citation chips.

---

## Export formats

From the dashboard toolbar, export the full analysis to:

- **Excel** (`.xlsx`) — 6 sheets: Clean Data, Statistics, Quality,
  Insights, Correlations, KPIs.
- **CSV** (`.csv`) — clean data only.
- **JSON** (`.json`) — full analysis bundle (stats + insights + profiles).
- **PDF** (`.pdf`) — printable executive summary with quality breakdown,
  statistics table, insights, and anomalies.

---

## Supported file formats

| Format | Library | Notes |
|--------|---------|-------|
| `.csv` / `.tsv` | PapaParse | Delimiter auto-detection, quoted-field aware. |
| `.json` | native | Array of records or single object; nested objects are flattened one level. |
| `.xlsx` / `.xls` | SheetJS | First sheet is read; dates are parsed. |
| `.pdf` | pdf.js | Text + heuristic table extraction. Falls back to per-paragraph records when no table is found. Deep document analysis runs automatically. |
| `.docx` | mammoth | Tables extracted first; otherwise paragraphs/headings become records. Deep document analysis runs automatically. |
| `.txt` | PapaParse | Delimiter sniffed from the first line. |

Maximum practical size: ~25 MB (browser memory dependent).

---

## Deep document analysis

When you upload a PDF or Word document, InsightIQ runs an additional
document-analysis pass that produces:

- **Structural overview** — paragraphs, sentences, words, characters, average lengths.
- **Readability** — Flesch reading-ease score with a grade-level label.
- **Sentiment** — lexicon-based polarity (positive/negative/neutral with score).
- **Keywords** — TF-IDF top terms across paragraphs.
- **Entities** — regex-detected emails, URLs, phones, dates, currencies, percentages, IDs.
- **Topic clusters** — mini k-means over hashed paragraph embeddings.
- **Key passages** — paragraphs with the highest keyword density.

These appear in a dedicated **Document** tab.

---

## Comparison & history

- **Compare tab** — pick any two past analyses (or one past + the current
  one) and see a structured diff: schema drift (added/removed/renamed
  columns), type drift, volume delta, KPI delta for shared numeric columns,
  categorical overlap (Jaccard similarity), and quality delta. A
  plain-English drift summary ties it together.
- **History tab** — every completed analysis is automatically saved to
  localStorage (up to 20 entries). View the full history table, track
  per-file quality/metric trends over time, and remove individual entries.

---

## Export

From the dashboard toolbar, export to:

- **Excel** (`.xlsx`) — 6 sheets: Clean Data, Statistics, Quality, Insights, Correlations, KPIs.
- **CSV** (`.csv`) — clean data only.
- **JSON** (`.json`) — full analysis bundle.
- **PDF** (`.pdf`) — printable executive report.
- **Dashboard PNG** (`.png`) — full dashboard screenshot.

Per-chart PNG download buttons appear on every chart in the Charts tab.

---

## Design principles

1. **Determinism first** — Every number shown in the UI is computed from
   the actual dataset. The generation engine only narrates; it never
   invents statistics.
2. **Grounded generation** — Chat answers are constrained to retrieved
   context. If the answer isn't in the dataset, the engine says so.
3. **Provider-agnostic** — The generation layer swaps between providers
   with automatic failover. Provider names exist only in `.env` variable
   names and internal config — never in the user-facing UI.
4. **Offline-safe core** — Parsing, cleaning, statistics, insights, charts,
   and RAG indexing all work with zero network calls. Only the narrative
   polish and chat answers require the generation engine.
5. **Transparent quality** — The data-quality score is a weighted blend of
   five dimensions, each visible in the UI breakdown.

---

## Tech stack

- **React 19** + **Vite 6** — fast, modern frontend toolchain.
- **Chart.js** + **react-chartjs-2** — interactive, theme-aware charts.
- **PapaParse** — robust CSV / TSV parsing.
- **SheetJS (xlsx)** — Excel read + multi-sheet export.
- **jsPDF** + **jspdf-autotable** — PDF report generation.
- **lucide-react** — clean icon set.
- **Inter** + **JetBrains Mono** — typography.

---

## Project status

This implementation covers the full functional specification:
multi-format upload, automated cleaning, descriptive statistics and KPIs,
interactive dashboards, grounded insight narration, a RAG-based chatbot
with source citations, multi-format export, and a responsive light/dark UI.
