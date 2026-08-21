// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — deterministic statistics engine
//
// Computes every statistic shown in the UI from the actual cleaned dataset.
// No value here is ever invented by a language model — these are the real,
// reproducible numbers a user would get from pandas.DataFrame.describe().
// ─────────────────────────────────────────────────────────────────────────

// ── univariate numeric helpers ───────────────────────────────────────────

function numericValues(rows, col) {
  const out = [];
  for (const r of rows) {
    const v = r[col];
    if (typeof v === 'number' && !isNaN(v) && isFinite(v)) out.push(v);
  }
  return out;
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function variance(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
}

function stddev(arr) { return Math.sqrt(variance(arr)); }

function quantile(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

function min(arr) { return arr.length ? Math.min(...arr) : 0; }
function max(arr) { return arr.length ? Math.max(...arr) : 0; }

function uniqueCount(arr) { return new Set(arr.map((v) => v)).size; }

// ── outlier detection (IQR rule) ───────────────────────────────────────────

function detectOutliersIQR(values) {
  if (values.length < 4) return [];
  const q1 = quantile(values, 0.25);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return values.filter((v) => v < lower || v > upper);
}

// ── correlation (Pearson) between two numeric columns ─────────────────────

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Compute the full statistical profile of a cleaned dataset.
 * @param {object[]} rows
 * @param {string[]} headers
 * @param {object} columnProfiles  output of dataCleaner.cleanDataset().columnProfiles
 * @returns {object} statistics bundle
 */
export function computeStatistics(rows, headers, columnProfiles) {
  const totalRows = rows.length;
  const totalColumns = headers.length;

  const numericCols = headers.filter((h) => ['number', 'integer'].includes(columnProfiles[h]?.type));
  const categoryCols = headers.filter((h) => ['category', 'boolean'].includes(columnProfiles[h]?.type));
  const dateCols = headers.filter((h) => columnProfiles[h]?.type === 'date');
  const textCols = headers.filter((h) => ['text', 'identifier'].includes(columnProfiles[h]?.type));

  // Null accounting.
  let totalCells = 0;
  let nullCells = 0;
  const nullsPerColumn = {};
  for (const h of headers) {
    let c = 0;
    for (const r of rows) {
      totalCells++;
      const v = r[h];
      if (v === null || v === undefined || v === '') c++;
    }
    nullsPerColumn[h] = c;
    nullCells += c;
  }
  const nullPercentage = totalCells ? +((nullCells / totalCells) * 100).toFixed(2) : 0;

  // Per-column describe().
  const columnStats = {};
  for (const h of headers) {
    const profile = columnProfiles[h];
    const base = {
      name: h,
      type: profile?.type || 'unknown',
      nullCount: nullsPerColumn[h],
      nullPercentage: totalRows ? +((nullsPerColumn[h] / totalRows) * 100).toFixed(2) : 0,
      uniqueCount: uniqueCount(rows.map((r) => r[h]).filter((v) => v !== null && v !== undefined && v !== '')),
    };
    if (['number', 'integer'].includes(profile?.type)) {
      const vals = numericValues(rows, h);
      const outliers = detectOutliersIQR(vals);
      columnStats[h] = {
        ...base,
        count: vals.length,
        mean: +mean(vals).toFixed(4),
        median: +median(vals).toFixed(4),
        stddev: +stddev(vals).toFixed(4),
        min: min(vals),
        max: max(vals),
        q1: +quantile(vals, 0.25).toFixed(4),
        q3: +quantile(vals, 0.75).toFixed(4),
        sum: +sum(vals).toFixed(4),
        range: +(max(vals) - min(vals)).toFixed(4),
        outliers: outliers.length,
        outlierValues: outliers.slice(0, 10),
      };
    } else if (profile?.type === 'date') {
      const dates = rows.map((r) => r[h]).filter(Boolean).sort();
      columnStats[h] = {
        ...base,
        min: dates[0] || null,
        max: dates[dates.length - 1] || null,
        spanDays: dates.length >= 2 ? Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000) : 0,
      };
    } else {
      // categorical / text
      const dist = {};
      for (const r of rows) {
        const v = r[h];
        if (v === null || v === undefined || v === '') continue;
        const k = String(v);
        dist[k] = (dist[k] || 0) + 1;
      }
      const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]);
      columnStats[h] = {
        ...base,
        topValues: sorted.slice(0, 10).map(([value, count]) => ({ value, count })),
        cardinality: sorted.length,
      };
    }
  }

  // Correlation matrix across numeric columns.
  const correlation = {};
  for (const a of numericCols) {
    correlation[a] = {};
    const va = numericValues(rows, a);
    for (const b of numericCols) {
      if (a === b) { correlation[a][b] = 1; continue; }
      const vb = numericValues(rows, b);
      correlation[a][b] = +pearson(va, vb).toFixed(3);
    }
  }

  // Strongest correlations (excluding self).
  const strongPairs = [];
  for (const a of numericCols) {
    for (const b of numericCols) {
      if (a >= b) continue;
      const r = correlation[a][b];
      if (Math.abs(r) >= 0.4) {
        strongPairs.push({ a, b, r, strength: Math.abs(r) >= 0.7 ? 'strong' : 'moderate' });
      }
    }
  }
  strongPairs.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

  // Duplicate detection is done in dataCleaner; we surface the number here
  // from columnProfiles-less context by recomputing lightly if needed.
  const duplicateRows = columnProfiles?._duplicateRows ?? 0;

  return {
    totalRows,
    totalColumns,
    numericColumnCount: numericCols.length,
    categoryColumnCount: categoryCols.length,
    dateColumnCount: dateCols.length,
    textColumnCount: textCols.length,
    nullCells,
    nullPercentage,
    nullsPerColumn,
    columnStats,
    correlation,
    strongPairs: strongPairs.slice(0, 8),
    numericColumns: numericCols,
    categoryColumns: categoryCols,
    dateColumns: dateCols,
    duplicateRows,
    memoryCells: totalCells,
  };
}

export { mean, median, stddev, quantile, numericValues };
