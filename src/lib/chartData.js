// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — chart dataset builder
//
// Produces real chart-ready datasets derived from the cleaned data. Every
// label and value is computed from actual rows — never invented.
// ─────────────────────────────────────────────────────────────────────────

import { numericValues, getCategoryDistribution, getTopByAggregate } from './dataHelpers.js';

/**
 * Build the full chart bundle for the Charts tab.
 * @param {object[]} rows
 * @param {string[]} headers
 * @param {object} columnProfiles  from dataCleaner
 * @param {object} stats  from computeStatistics
 */
export function buildChartBundle(rows, headers, columnProfiles, stats) {
  const numericCols = stats.numericColumns;
  const categoryCols = stats.categoryColumns;
  const dateCols = stats.dateColumns;

  const bundle = {};

  // ── Bar: top categories by count (or by sum of first numeric if available) ──
  if (categoryCols.length) {
    const col = categoryCols[0];
    if (numericCols.length) {
      const agg = getTopByAggregate(rows, col, numericCols[0], 'sum', 10);
      bundle.bar = { labels: agg.labels, values: agg.values, title: `${numericCols[0]} by ${col}`, source: { category: col, metric: numericCols[0], agg: 'sum' } };
    } else {
      const dist = getCategoryDistribution(rows, col, 10);
      bundle.bar = { labels: dist.labels, values: dist.values, title: `${col} — Frequency`, source: { category: col, metric: 'count' } };
    }
  }

  // ── Line: trend over date column or row index ──
  if (dateCols.length && numericCols.length) {
    const d = dateCols[0];
    const n = numericCols[0];
    const series = rows
      .map((r) => ({ x: r[d], y: Number(r[n]) }))
      .filter((p) => p.x && !isNaN(p.y))
      .sort((a, b) => String(a.x).localeCompare(String(b.x)));
    // aggregate duplicates by mean per date
    const byDate = {};
    for (const p of series) (byDate[p.x] ||= []).push(p.y);
    const labels = Object.keys(byDate).sort();
    const values = labels.map((l) => +(byDate[l].reduce((a, b) => a + b, 0) / byDate[l].length).toFixed(4));
    bundle.line = { labels, values, title: `${n} over ${d}`, source: { date: d, metric: n, agg: 'mean' } };
  } else if (numericCols.length) {
    const n = numericCols[0];
    const take = rows.slice(0, 50);
    bundle.line = {
      labels: take.map((_, i) => `#${i + 1}`),
      values: take.map((r) => Number(r[n]) || 0),
      title: `${n} — first ${take.length} records`,
      source: { metric: n },
    };
  }

  // ── Doughnut: distribution of first categorical column ──
  if (categoryCols.length) {
    const col = categoryCols[0];
    const dist = getCategoryDistribution(rows, col, 7);
    bundle.pie = { labels: dist.labels, values: dist.values, title: `${col} — Share`, source: { category: col } };
  } else if (numericCols.length >= 2) {
    // fall back to a binary split using median of first numeric column
    const n = numericCols[0];
    const vals = numericValues(rows, n);
    const m = vals.sort((a, b) => a - b)[Math.floor(vals.length / 2)];
    const below = vals.filter((v) => v < m).length;
    const above = vals.length - below;
    bundle.pie = { labels: [`Below ${m.toFixed(2)}`, `Above ${m.toFixed(2)}`], values: [below, above], title: `${n} — median split`, source: { metric: n } };
  }

  // ── Histogram: distribution of first numeric column ──
  if (numericCols.length) {
    const n = numericCols[0];
    const vals = numericValues(rows, n);
    if (vals.length >= 4) {
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const bins = Math.min(15, Math.max(5, Math.ceil(Math.sqrt(vals.length))));
      const width = (max - min) / bins || 1;
      const counts = Array(bins).fill(0);
      const labels = [];
      for (const v of vals) {
        const idx = Math.min(bins - 1, Math.floor((v - min) / width));
        counts[idx]++;
      }
      for (let i = 0; i < bins; i++) {
        labels.push(`${(min + i * width).toFixed(1)}–${(min + (i + 1) * width).toFixed(1)}`);
      }
      bundle.histogram = { labels, values: counts, title: `${n} — distribution`, source: { metric: n, bins } };
    }
  }

  // ── Scatter: first two numeric columns ──
  if (numericCols.length >= 2) {
    const a = numericCols[0];
    const b = numericCols[1];
    const pts = rows
      .map((r) => ({ x: Number(r[a]), y: Number(r[b]) }))
      .filter((p) => !isNaN(p.x) && !isNaN(p.y))
      .slice(0, 400);
    if (pts.length >= 2) {
      bundle.scatter = { points: pts, xLabel: a, yLabel: b, title: `${a} vs ${b}`, source: { x: a, y: b } };
    }
  }

  // ── Horizontal bar: top categories by count ──
  if (categoryCols.length >= 2) {
    const col = categoryCols[1];
    const dist = getCategoryDistribution(rows, col, 10);
    bundle.hbar = { labels: dist.labels, values: dist.values, title: `${col} — top values`, source: { category: col } };
  } else if (categoryCols.length === 1) {
    const col = categoryCols[0];
    const dist = getCategoryDistribution(rows, col, 15);
    bundle.hbar = { labels: dist.labels, values: dist.values, title: `${col} — all values`, source: { category: col } };
  }

  // ── Area: first 30 rows × top 4 numeric columns ──
  if (numericCols.length >= 1) {
    const cols = numericCols.slice(0, 4);
    const take = rows.slice(0, 30);
    bundle.area = {
      labels: take.map((_, i) => `#${i + 1}`),
      datasets: cols.map((c) => ({ label: c, values: take.map((r) => Number(r[c]) || 0) })),
      title: `${cols.length} numeric series — first ${take.length} records`,
      source: { metrics: cols },
    };
  }

  // ── Quality radar: data-quality dimensions ──
  bundle.qualityRadar = buildQualityRadar(stats);

  // ── Correlation heatmap matrix (labels + matrix) ──
  if (numericCols.length >= 2) {
    bundle.correlation = {
      labels: numericCols,
      matrix: numericCols.map((a) => numericCols.map((b) => stats.correlation[a][b])),
      title: 'Correlation matrix',
    };
  }

  return bundle;
}

function buildQualityRadar(stats) {
  const completeness = Math.max(0, 100 - stats.nullPercentage);
  const uniqueness = stats.totalRows ? Math.max(0, 100 - (stats.duplicateRows / stats.totalRows) * 100) : 100;
  const numericity = stats.totalColumns ? (stats.numericColumnCount / stats.totalColumns) * 100 : 0;
  const quality = stats.dataQualityScore ?? 0;
  const coverage = Math.min(100, stats.totalRows ? Math.log10(stats.totalRows + 1) * 35 : 0);
  return {
    labels: ['Completeness', 'Uniqueness', 'Numericity', 'Quality', 'Coverage', 'Density'],
    values: [completeness, uniqueness, numericity, quality, coverage, Math.min(100, (stats.totalCells / Math.max(stats.totalRows, 1)) * 10)],
    title: 'Data quality radar',
  };
}
