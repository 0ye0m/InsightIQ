// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — dataset chunker
//
// Builds the retrieval corpus from a finished analysis. Chunks are
// self-contained text snippets each carrying metadata so the chat UI can
// cite sources. Four chunk families:
//   • summary       — executive narrative
//   • column_stats  — one chunk per numeric/categorical column
//   • insights      — one chunk per insight/anomaly/prediction
//   • row_group     — windows of actual rows (for "show me ..." questions)
//   • correlations  — top correlated pairs
// ─────────────────────────────────────────────────────────────────────────

const ROW_GROUP_SIZE = 25;

function fmtVal(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

export function chunkAnalysis(analysis) {
  const { cleaned, stats, insights, meta } = analysis;
  const chunks = [];

  // 1. Summary
  chunks.push({
    id: 'summary',
    family: 'summary',
    text:
      `Dataset: ${meta.fileName}. ${insights.executiveSummary} ` +
      `Records: ${stats.totalRows}. Columns: ${stats.totalColumns}. ` +
      `Numeric: ${stats.numericColumnCount}, Categorical: ${stats.categoryColumnCount}, ` +
      `Date: ${stats.dateColumnCount}. Null coverage: ${stats.nullPercentage}%. ` +
      `Duplicates removed: ${stats.duplicateRows}.`,
    meta: { source: 'executive summary' },
  });

  // 2. Cleaning log
  const cleaningText = (cleaned.cleaningLog || [])
    .map((l) => `${l.action}: ${l.detail}`)
    .join(' ');
  if (cleaningText) {
    chunks.push({
      id: 'cleaning_log',
      family: 'summary',
      text: `Cleaning operations applied to ${meta.fileName}: ${cleaningText}`,
      meta: { source: 'cleaning log' },
    });
  }

  // 3. Per-column stats
  for (const h of cleaned.headers) {
    const profile = cleaned.columnProfiles[h];
    const c = stats.columnStats[h];
    if (!c) continue;
    let text = `Column "${h}" (type: ${profile.type}). `;
    if (['number', 'integer'].includes(profile.type)) {
      text += `Mean: ${fmtVal(c.mean)}, median: ${fmtVal(c.median)}, std dev: ${fmtVal(c.stddev)}. `;
      text += `Min: ${fmtVal(c.min)}, max: ${fmtVal(c.max)}, range: ${fmtVal(c.range)}. `;
      text += `Quartiles Q1 ${fmtVal(c.q1)}, Q3 ${fmtVal(c.q3)}. `;
      text += `Outliers (IQR): ${c.outliers}. `;
      text += `Nulls: ${c.nullCount} (${c.nullPercentage}%). Unique values: ${c.uniqueCount}.`;
    } else if (profile.type === 'date') {
      text += `Range: ${c.min} to ${c.max} (${c.spanDays} days). `;
      text += `Nulls: ${c.nullCount} (${c.nullPercentage}%).`;
    } else {
      const top = (c.topValues || []).slice(0, 5).map((t) => `"${t.value}" (${t.count})`).join(', ');
      text += `Cardinality: ${c.cardinality}. Top values: ${top}. `;
      text += `Nulls: ${c.nullCount} (${c.nullPercentage}%).`;
    }
    chunks.push({
      id: `col_${h}`,
      family: 'column_stats',
      text,
      meta: { source: `column "${h}"`, column: h, type: profile.type },
    });
  }

  // 4. Insights / anomalies / predictions
  insights.insights.forEach((ins, i) => {
    chunks.push({
      id: `insight_${i}`,
      family: 'insights',
      text: `Insight: ${ins}`,
      meta: { source: 'insight', index: i },
    });
  });
  insights.anomalies.forEach((a, i) => {
    chunks.push({
      id: `anomaly_${i}`,
      family: 'insights',
      text: `Anomaly: ${a}`,
      meta: { source: 'anomaly', index: i },
    });
  });
  insights.predictions.forEach((p, i) => {
    chunks.push({
      id: `prediction_${i}`,
      family: 'insights',
      text: `Prediction: ${p}`,
      meta: { source: 'prediction', index: i },
    });
  });

  // 5. KPIs
  const kpiText = insights.kpis
    .map((k) => `${k.label}: ${k.value} (${k.trend}, ${k.sub})`)
    .join('; ');
  chunks.push({
    id: 'kpis',
    family: 'summary',
    text: `Key metrics for ${meta.fileName}: ${kpiText}.`,
    meta: { source: 'KPIs' },
  });

  // 6. Correlations
  if (stats.strongPairs.length) {
    const corrText = stats.strongPairs
      .map((p) => `"${p.a}" and "${p.b}" correlation r=${p.r} (${p.strength})`)
      .join('; ');
    chunks.push({
      id: 'correlations',
      family: 'correlations',
      text: `Strongest correlations in ${meta.fileName}: ${corrText}.`,
      meta: { source: 'correlation matrix' },
    });
  }

  // 6b. OLAP chunks — Top-N, Pareto, period-over-period, decomposition.
  // These let the chat answer business questions ("What are the top 5 by X?",
  // "How has Y trended over time?") with real grounded data.
  if (insights.olap) {
    const olap = insights.olap;
    // Top-N per (measure × dimension)
    for (const [key, top] of Object.entries(olap.olap.topN || {})) {
      const [measure, dimension] = key.split('__');
      const topList = top.slice(0, 5).map((t) => `"${t.value}" (${t.sum}, ${t.share}% share)`).join(', ');
      chunks.push({
        id: `topN_${key}`,
        family: 'column_stats',
        text: `Top ${dimension}s by ${measure}: ${topList}.`,
        meta: { source: `top ${dimension} by ${measure}`, kind: 'olap' },
      });
    }
    // Pareto
    for (const [key, p] of Object.entries(olap.olap.paretos || {})) {
      const [measure, dimension] = key.split('__');
      chunks.push({
        id: `pareto_${key}`,
        family: 'insights',
        text: `Pareto analysis on ${measure} by ${dimension}: top ${p.paretoCount} of ${p.totalContributors} ${dimension}s (${p.concentrationIndex}% of categories) drive ${p.cumulativeAt80}% of total ${measure}.`,
        meta: { source: `pareto ${measure} by ${dimension}`, kind: 'olap' },
      });
    }
    // Period-over-period
    for (const [key, pop] of Object.entries(olap.olap.periodOverPeriod || {})) {
      const [measure, time] = key.split('__');
      if (pop.length < 2) continue;
      const trendText = pop.slice(-5).map((p) => `${p.period}=${p.value}${p.growthPct !== null ? ` (${p.growthPct >= 0 ? '+' : ''}${p.growthPct}%)` : ''}`).join(' → ');
      chunks.push({
        id: `pop_${key}`,
        family: 'column_stats',
        text: `Time trend for ${measure} by ${time} (last 5 periods): ${trendText}.`,
        meta: { source: `trend ${measure} by ${time}`, kind: 'olap' },
      });
    }
    // Business summary
    if (olap.businessSummary) {
      chunks.push({
        id: 'olap_summary',
        family: 'summary',
        text: `Business summary: ${olap.businessSummary}`,
        meta: { source: 'OLAP business summary', kind: 'olap' },
      });
    }
  }

  // 7. Row groups (sample of actual data, for "show me X" questions)
  const sampleRows = cleaned.rows.slice(0, Math.min(200, cleaned.rows.length));
  for (let i = 0; i < sampleRows.length; i += ROW_GROUP_SIZE) {
    const slice = sampleRows.slice(i, i + ROW_GROUP_SIZE);
    const csv = slice
      .map((r) => cleaned.headers.map((h) => fmtVal(r[h])).join(', '))
      .join(' | ');
    chunks.push({
      id: `rows_${i}`,
      family: 'row_group',
      text: `Records ${i + 1}–${i + slice.length} of ${meta.fileName}. Columns: ${cleaned.headers.join(', ')}. Rows: ${csv}`,
      meta: { source: `rows ${i + 1}–${i + slice.length}`, startRow: i + 1, endRow: i + slice.length },
    });
  }

  // 8. Document-specific chunks (if a PDF/Word was uploaded)
  if (meta.kind === 'document' && analysis.rawText) {
    const paras = analysis.rawText
      .split(/\n\s*\n/)
      .map((p) => p.replace(/^---\s*Page\s*\d+\s*---\s*/, '').trim())
      .filter((p) => p.length > 80);
    // index paragraphs in groups of 3
    for (let i = 0; i < paras.length; i += 3) {
      const slice = paras.slice(i, i + 3);
      chunks.push({
        id: `doc_${i}`,
        family: 'row_group',
        text: `Document passage from ${meta.fileName} (section ${i + 1}–${i + slice.length}): ${slice.join(' ')}`,
        meta: { source: `document section ${i + 1}–${i + slice.length}`, kind: 'document' },
      });
    }
    // Document structure summary
    if (analysis.documentAnalysis) {
      const da = analysis.documentAnalysis;
      chunks.push({
        id: 'doc_structure',
        family: 'summary',
        text: `Document structure: ${da.structural.paragraphs} paragraphs, ${da.structural.sentences} sentences, ${da.structural.words} words. Readability: ${da.readability.fleschScore} (${da.readability.label}). Sentiment: ${da.sentiment.label}. Top keywords: ${da.keywords.slice(0, 10).map((k) => k.term).join(', ')}.`,
        meta: { source: 'document overview' },
      });
      // Topic chunks
      for (const t of da.topics || []) {
        chunks.push({
          id: `doc_topic_${t.topic}`,
          family: 'insights',
          text: `Topic ${t.topic} (${t.paragraphCount} paragraphs): keywords ${t.keywords.join(', ')}. Representative passage: ${t.representative}`,
          meta: { source: `topic ${t.topic}`, kind: 'document' },
        });
      }
      // Entity chunks
      if (da.entities.total > 0) {
        const entText = Object.entries(da.entities.entities)
          .map(([k, v]) => `${k}: ${v.count} found (e.g. ${v.samples.slice(0, 4).join(', ')})`)
          .join('; ');
        chunks.push({
          id: 'doc_entities',
          family: 'insights',
          text: `Entities detected in ${meta.fileName}: ${entText}.`,
          meta: { source: 'entity extraction' },
        });
      }
    }
  }

  return chunks;
}
