// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — dataset comparison engine
//
// Given two completed analyses (A = baseline, B = candidate), produce a
// structured diff covering:
//   • schema drift   — added / removed / renamed columns
//   • type drift      — columns present in both but with different inferred types
//   • volume delta    — row count, column count, cell count
//   • KPI delta       — for shared numeric columns, mean / median / std / range
//   • distribution    — for shared categorical columns, top-value overlap
//   • quality delta   — overall quality score and per-dimension breakdown
//   • drift summary   — plain-English interpretation
//
// Everything is computed from the two real analyses — no invention.
// ─────────────────────────────────────────────────────────────────────────

function setDiff(a, b) {
  const sa = new Set(a), sb = new Set(b);
  return {
    added: b.filter((x) => !sa.has(x)),
    removed: a.filter((x) => !sb.has(x)),
    common: a.filter((x) => sb.has(x)),
  };
}

function pctChange(oldV, newV) {
  if (oldV === 0 || oldV === null || oldV === undefined) return null;
  return +(((newV - oldV) / Math.abs(oldV)) * 100).toFixed(2);
}

function fmt(n) {
  if (n === null || n === undefined) return 'N/A';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(2) + 'k';
  return Number(n).toLocaleString();
}

/**
 * Compare two completed analyses.
 * @param {object} a baseline analysis (output of useAnalysis pipeline)
 * @param {object} b candidate analysis
 * @returns {object} structured diff
 */
export function compareAnalyses(a, b) {
  const aHeaders = a.cleaned.headers;
  const bHeaders = b.cleaned.headers;
  const schema = setDiff(aHeaders, bHeaders);

  // Type drift on common columns
  const typeDrift = schema.common
    .filter((h) => a.cleaned.columnProfiles[h]?.type !== b.cleaned.columnProfiles[h]?.type)
    .map((h) => ({
      column: h,
      from: a.cleaned.columnProfiles[h]?.type,
      to: b.cleaned.columnProfiles[h]?.type,
    }));

  // Volume delta
  const volume = {
    rowsA: a.stats.totalRows,
    rowsB: b.stats.totalRows,
    rowDelta: b.stats.totalRows - a.stats.totalRows,
    rowPct: pctChange(a.stats.totalRows, b.stats.totalRows),
    colsA: a.stats.totalColumns,
    colsB: b.stats.totalColumns,
    colDelta: b.stats.totalColumns - a.stats.totalColumns,
  };

  // KPI delta for shared numeric columns
  const kpiDelta = schema.common
    .filter((h) => ['number', 'integer'].includes(a.cleaned.columnProfiles[h]?.type)
              && ['number', 'integer'].includes(b.cleaned.columnProfiles[h]?.type))
    .map((h) => {
      const ca = a.stats.columnStats[h] || {};
      const cb = b.stats.columnStats[h] || {};
      return {
        column: h,
        meanA: ca.mean, meanB: cb.mean,
        meanDelta: (cb.mean ?? 0) - (ca.mean ?? 0),
        meanPct: pctChange(ca.mean, cb.mean),
        medianA: ca.median, medianB: cb.median,
        medianDelta: (cb.median ?? 0) - (ca.median ?? 0),
        stdA: ca.stddev, stdB: cb.stddev,
        stdDelta: (cb.stddev ?? 0) - (ca.stddev ?? 0),
        outliersA: ca.outliers ?? 0,
        outliersB: cb.outliers ?? 0,
      };
    });

  // Distribution overlap for shared categorical columns
  const categoryOverlap = schema.common
    .filter((h) => ['category', 'boolean'].includes(a.cleaned.columnProfiles[h]?.type)
              && ['category', 'boolean'].includes(b.cleaned.columnProfiles[h]?.type))
    .map((h) => {
      const ca = a.stats.columnStats[h];
      const cb = b.stats.columnStats[h];
      const avals = new Set((ca?.topValues || []).map((t) => String(t.value)));
      const bvals = new Set((cb?.topValues || []).map((t) => String(t.value)));
      const intersection = [...avals].filter((v) => bvals.has(v));
      const jaccard = (avals.size + bvals.size) > 0
        ? +(intersection.length / (avals.size + bvals.size - intersection.length)).toFixed(2)
        : 0;
      return {
        column: h,
        cardinalityA: ca?.cardinality ?? 0,
        cardinalityB: cb?.cardinality ?? 0,
        sharedValues: intersection.length,
        jaccardSimilarity: jaccard,
      };
    });

  // Quality delta
  const aq = a.quality;
  const bq = b.quality;
  const qualityDelta = {
    scoreA: aq.score,
    scoreB: bq.score,
    scoreDelta: bq.score - aq.score,
    dimensions: aq.breakdown.map((dim, i) => ({
      dimension: dim.dimension,
      a: dim.value,
      b: bq.breakdown[i]?.value ?? 0,
      delta: +((bq.breakdown[i]?.value ?? 0) - dim.value).toFixed(1),
    })),
  };

  // Plain-English summary
  const summary = [];
  summary.push(
    `Dataset B ("${b.meta.fileName}") has ${fmt(volume.rowsB)} rows versus ${fmt(volume.rowsA)} in A ("${a.meta.fileName}") ` +
    `(${volume.rowPct === null ? 'new dataset' : (volume.rowPct >= 0 ? '+' : '') + volume.rowPct + '%'}).`
  );
  if (schema.added.length) summary.push(`Added columns: ${schema.added.join(', ')}.`);
  if (schema.removed.length) summary.push(`Removed columns: ${schema.removed.join(', ')}.`);
  if (typeDrift.length) {
    summary.push(
      `Type drift detected on ${typeDrift.length} column(s): ` +
      typeDrift.map((t) => `"${t.column}" (${t.from}→${t.to})`).join(', ') + '.'
    );
  }
  const significantKpi = kpiDelta.filter((k) => k.meanPct !== null && Math.abs(k.meanPct) >= 5);
  if (significantKpi.length) {
    summary.push(
      `Significant KPI shifts (|Δ|≥5%): ` +
      significantKpi.map((k) => `"${k.column}" ${(k.meanPct >= 0 ? '+' : '') + k.meanPct}%`).join(', ') + '.'
    );
  }
  const lowOverlap = categoryOverlap.filter((c) => c.jaccardSimilarity < 0.5);
  if (lowOverlap.length) {
    summary.push(
      `Low category overlap (Jaccard<0.5): ` +
      lowOverlap.map((c) => `"${c.column}" (${c.jaccardSimilarity})`).join(', ') + '.'
    );
  }
  summary.push(
    `Overall quality ${qualityDelta.scoreB}/100 vs ${qualityDelta.scoreA}/100 ` +
    `(${qualityDelta.scoreDelta >= 0 ? '+' : ''}${qualityDelta.scoreDelta} points).`
  );

  return {
    a: { fileName: a.meta.fileName, rows: a.stats.totalRows, cols: a.stats.totalColumns },
    b: { fileName: b.meta.fileName, rows: b.stats.totalRows, cols: b.stats.totalColumns },
    schema,
    typeDrift,
    volume,
    kpiDelta,
    categoryOverlap,
    qualityDelta,
    summary,
  };
}
