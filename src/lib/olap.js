// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — OLAP analysis engine
//
// This module brings Power BI / Tableau-style multidimensional analysis to
// InsightIQ. It performs:
//
//   1. SEMANTIC CLASSIFICATION — detects each column's business role:
//      • measure (numeric, aggregatable — sales, revenue, count)
//      • dimension (categorical — region, product, customer)
//      • time dimension (date columns, with derived hierarchy)
//      • identifier (high-cardinality key — order_id, customer_id)
//      • geographic dimension (city/state/country detected by name)
//
//   2. TIME HIERARCHY DERIVATION — from any date column, derives year,
//      quarter, month, week, day, day-of-week attributes for drill-down.
//
//   3. OLAP AGGREGATIONS — the bread-and-butter of business analytics:
//      • Top-N / Bottom-N by measure (per dimension)
//      • Pareto analysis (80/20 concentration)
//      • Period-over-period (MoM, QoQ, YoY) when a time dimension exists
//      • Decomposition (measure broken down by a dimension)
//      • Share-of-total (each category's % contribution)
//      • Growth rate (period-over-period delta)
//      • Distribution skew (concentration index)
//
//   4. KPI GENERATION — business-meaningful KPIs, not technical stats:
//      • Total revenue / volume
//      • Average order value
//      • Top performer + share
//      • Growth rate (when time dimension exists)
//      • Concentration (Pareto) index
//
// Everything is computed from the actual dataset — no invention.
// ─────────────────────────────────────────────────────────────────────────

import { numericValues, getCategoryDistribution } from './dataHelpers.js';

// ── helpers ────────────────────────────────────────────────────────────────

function fmt(n, digits = 2) {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(digits) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(digits) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(digits) + 'k';
  return Number(n).toFixed(digits);
}

function pct(n, digits = 1) {
  if (n === null || n === undefined || isNaN(n)) return 'N/A';
  return Number(n).toFixed(digits) + '%';
}

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

// Geographic keywords — helps classify dimensions as geographic so we can
// suggest map-style breakdowns.
const GEOGRAPHIC_KEYWORDS = [
  'country','region','state','province','city','territory','zone','area',
  'continent','district','county','postcode','zip','postal','latitude',
  'longitude','address','location','market','branch','office','territory',
];

// Common measure names — helps pick the "primary measure" for the dashboard.
const MEASURE_KEYWORDS = [
  'revenue','sales','amount','total','sum','profit','cost','price','value',
  'quantity','qty','count','volume','units','orders','transactions','income',
  'expense','spend','budget','forecast','target','salary','wage','rate','fee',
  'discount','margin','commission','ebitda','gpv','gmv','arpu','ltv','cac',
];

// Common identifier names.
const IDENTIFIER_KEYWORDS = [
  'id','uuid','guid','code','key','sku','sku_id','isbn','asin','serial',
  'reference','ref','order_id','customer_id','product_id','user_id','txn_id',
  'transaction_id','invoice','receipt','token','hash',
];

// ── 1. SEMANTIC CLASSIFICATION ─────────────────────────────────────────────

/**
 * Classify each column into a business role.
 * @param {object[]} rows
 * @param {string[]} headers
 * @param {object} columnProfiles  output of dataCleaner
 * @returns {object} { measures: [], dimensions: [], timeDimensions: [], identifiers: [], geoDimensions: [] }
 */
export function classifyColumns(rows, headers, columnProfiles) {
  const result = {
    measures: [],
    dimensions: [],
    timeDimensions: [],
    identifiers: [],
    geoDimensions: [],
  };

  // ── TYPE-BASED CLASSIFICATION (deterministic, ordered) ─────────────
  // The previous heuristic used `uniqueRatio >= 0.9` to detect identifiers,
  // which MIS-CLASSIFIED every numeric measure with all-unique values
  // (sales amounts are almost always all different) and every date column
  // (timestamps are almost always all different) as identifiers. That made
  // the entire OLAP layer (Top-N, Pareto, period-over-period) produce
  // nothing — the root cause of "false results".
  //
  // The fix: classification is now TYPE-FIRST.
  //   1. date    → timeDimension (always — dates are unique by nature)
  //   2. number  → measure (unless name screams identifier AND cardinality
  //               is suspiciously high, e.g. an ID column encoded as int)
  //   3. boolean → dimension
  //   4. category/text → dimension (with geo sub-classification)
  //
  // The cleaner's `identifier` type is honoured, but we no longer override
  // numeric/date types based on cardinality alone.

  for (const h of headers) {
    const profile = columnProfiles[h];
    if (!profile) continue;
    const type = profile.type;
    const nameLower = h.toLowerCase();
    const stat = getColStats(rows, h, type);

    // Skip all-null columns
    if (stat.nonNullCount === 0) continue;

    // 1. TIME DIMENSION — always honoured for date types.
    // Dates are unique by nature; that does NOT make them identifiers.
    if (type === 'date') {
      result.timeDimensions.push({ column: h, ...stat });
      continue;
    }

    // 2. MEASURE — numeric columns are measures unless the name explicitly
    // identifies them as an ID/key/code AND cardinality is suspiciously
    // high relative to row count.
    if (type === 'number' || type === 'integer') {
      // Year-as-int detection: if every value is a 4-digit year, treat as
      // a time dimension (will be derived from existing date if present).
      const looksLikeYear = rows.every((r) => r[h] !== null && r[h] !== undefined && r[h] !== '' && /^\d{4}$/.test(String(r[h])));
      if (looksLikeYear) {
        // Treat as a low-cardinality dimension (year)
        result.dimensions.push({ column: h, type: 'category', ...stat });
        continue;
      }

      // Explicit ID/key/code columns — only then do we promote a numeric
      // column to identifier.
      const explicitId = /\b(id|uuid|guid|code|key|sku|isbn|asin|serial|hash|token)\b/.test(nameLower)
        || /^(order|customer|product|user|txn|transaction|invoice|receipt)_?id$/i.test(nameLower);
      if (explicitId && stat.uniqueRatio >= 0.95) {
        result.identifiers.push({ column: h, ...stat });
        continue;
      }

      // Low-cardinality numeric → categorical dimension encoded as int
      // (e.g. region_id, status_code with only 3-5 distinct values).
      if (stat.uniqueCount <= Math.max(15, Math.ceil(rows.length * 0.1)) && rows.length > 20) {
        // But if the name screams measure, keep it as a measure
        const measureName = MEASURE_KEYWORDS.some((kw) => nameLower.includes(kw));
        if (!measureName) {
          result.dimensions.push({ column: h, type: 'category', ...stat });
          continue;
        }
      }

      // Otherwise: it's a measure.
      result.measures.push({ column: h, ...stat });
      continue;
    }

    // 3. BOOLEAN → dimension
    if (type === 'boolean') {
      result.dimensions.push({ column: h, type: 'boolean', ...stat });
      continue;
    }

    // 4. CATEGORY / TEXT → dimension (check identifier first, then geo)
    // For text columns, identifier detection IS valid — high cardinality
    // strings (UUIDs, emails, names) are usually identifiers.
    if (type === 'identifier') {
      result.identifiers.push({ column: h, ...stat });
      continue;
    }
    // High-cardinality free-text columns (uniqueRatio near 1.0 with many rows)
    // are usually identifiers even if the cleaner didn't tag them as such.
    if (stat.uniqueRatio >= 0.95 && rows.length >= 20 && stat.uniqueCount > 20) {
      const measureName = MEASURE_KEYWORDS.some((kw) => nameLower.includes(kw));
      if (!measureName) {
        result.identifiers.push({ column: h, ...stat });
        continue;
      }
    }

    // Otherwise it's a dimension — check for geographic keywords.
    const isGeo = GEOGRAPHIC_KEYWORDS.some((kw) => nameLower.includes(kw));
    if (isGeo) {
      result.geoDimensions.push({ column: h, type: 'category', ...stat });
    } else {
      result.dimensions.push({ column: h, type: 'category', ...stat });
    }
  }

  return result;
}

function getColStats(rows, col, type) {
  const nonNullValues = rows.map((r) => r[col]).filter((v) => v !== null && v !== undefined && v !== '');
  const uniqueValues = new Set(nonNullValues.map((v) => String(v).toLowerCase()));
  const stat = {
    nonNullCount: nonNullValues.length,
    nullCount: rows.length - nonNullValues.length,
    nullPercentage: rows.length ? +(((rows.length - nonNullValues.length) / rows.length) * 100).toFixed(2) : 0,
    uniqueCount: uniqueValues.size,
    uniqueRatio: nonNullValues.length ? uniqueValues.size / nonNullValues.length : 0,
  };
  if (type === 'number' || type === 'integer') {
    const nums = nonNullValues.map((v) => Number(v)).filter((v) => !isNaN(v));
    stat.sum = sum(nums);
    stat.mean = mean(nums);
    stat.min = nums.length ? Math.min(...nums) : null;
    stat.max = nums.length ? Math.max(...nums) : null;
  }
  return stat;
}

// ── 2. TIME HIERARCHY DERIVATION ───────────────────────────────────────────

/**
 * Derive year/quarter/month/week/day/dayOfWeek from a date column.
 * Returns an enriched array of rows with new derived attributes.
 */
export function deriveTimeHierarchy(rows, dateColumn) {
  return rows.map((r) => {
    const v = r[dateColumn];
    if (!v) return r;
    let d;
    if (v instanceof Date) d = v;
    else d = new Date(v);
    if (isNaN(d.getTime())) return r;
    return {
      ...r,
      [`${dateColumn}_year`]: d.getFullYear(),
      [`${dateColumn}_quarter`]: `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`,
      [`${dateColumn}_month`]: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      [`${dateColumn}_month_name`]: d.toLocaleString('en', { month: 'long' }) + ' ' + d.getFullYear(),
      [`${dateColumn}_week`]: getISOWeek(d),
      [`${dateColumn}_day_of_week`]: d.toLocaleString('en', { weekday: 'long' }),
    };
  });
}

function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

// ── 3. OLAP AGGREGATIONS ───────────────────────────────────────────────────

/**
 * Aggregate a measure by a dimension.
 * @returns { dimension: {value, sum, count, mean, share }[] }
 */
export function aggregateByDimension(rows, measureCol, dimensionCol, agg = 'sum', topN = 10) {
  const groups = new Map();
  for (const r of rows) {
    const dim = r[dimensionCol];
    const val = Number(r[measureCol]);
    if (dim === null || dim === undefined || dim === '' || isNaN(val)) continue;
    const key = String(dim);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(val);
  }
  const total = sum(Array.from(groups.values()).map((g) => sum(g)));
  const result = Array.from(groups.entries()).map(([value, vals]) => {
    let aggVal;
    if (agg === 'sum') aggVal = sum(vals);
    else if (agg === 'mean') aggVal = mean(vals);
    else if (agg === 'count') aggVal = vals.length;
    else if (agg === 'max') aggVal = Math.max(...vals);
    else if (agg === 'min') aggVal = Math.min(...vals);
    else aggVal = sum(vals);
    return {
      value,
      sum: +sum(vals).toFixed(4),
      count: vals.length,
      mean: +mean(vals).toFixed(4),
      share: total ? +((aggVal / total) * 100).toFixed(2) : 0,
      aggValue: +aggVal.toFixed(4),
    };
  });
  result.sort((a, b) => b.aggValue - a.aggValue);
  return result.slice(0, topN);
}

/**
 * Top-N performers by a measure.
 */
export function topNByMeasure(rows, measureCol, dimensionCol, n = 5, agg = 'sum') {
  return aggregateByDimension(rows, measureCol, dimensionCol, agg, n);
}

/**
 * Pareto analysis — find how many top items account for X% of the total.
 * Returns { topContributors: [...], cumulativeAt80: number }
 */
export function paretoAnalysis(rows, measureCol, dimensionCol, threshold = 80) {
  const agg = aggregateByDimension(rows, measureCol, dimensionCol, 'sum', 1000);
  if (!agg.length) return { topContributors: [], cumulativeAt80: 0, paretoCount: 0 };
  const total = sum(agg.map((a) => a.sum));
  let cumulative = 0;
  let cumulativeAt80 = 0;
  let paretoCount = 0;
  const enriched = agg.map((a) => {
    cumulative += a.sum;
    const cumulativeShare = total ? +((cumulative / total) * 100).toFixed(2) : 0;
    if (cumulativeShare <= threshold) paretoCount++;
    if (cumulativeAt80 === 0 && cumulativeShare >= threshold) cumulativeAt80 = cumulativeShare;
    return { ...a, cumulativeShare };
  });
  return {
    topContributors: enriched.slice(0, Math.max(paretoCount, 5)),
    cumulativeAt80,
    paretoCount,
    total,
    totalContributors: agg.length,
    concentrationIndex: agg.length ? +((paretoCount / agg.length) * 100).toFixed(1) : 0,
  };
}

/**
 * Period-over-period analysis.
 * For each period (year, quarter, month), compute the measure and the
 * delta vs the previous period.
 */
export function periodOverPeriod(rows, measureCol, dateCol, granularity = 'month', agg = 'sum') {
  // Group rows into periods
  const periods = new Map();
  for (const r of rows) {
    const v = r[dateCol];
    const val = Number(r[measureCol]);
    if (!v || isNaN(val)) continue;
    let d;
    if (v instanceof Date) d = v;
    else d = new Date(v);
    if (isNaN(d.getTime())) continue;
    let key;
    if (granularity === 'year') key = String(d.getFullYear());
    else if (granularity === 'quarter') key = `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
    else if (granularity === 'week') key = `${d.getFullYear()}-W${String(getISOWeek(d)).padStart(2, '0')}`;
    else key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;  // month
    if (!periods.has(key)) periods.set(key, []);
    periods.get(key).push(val);
  }
  const sorted = Array.from(periods.keys()).sort();
  const result = [];
  let prev = null;
  for (const key of sorted) {
    const vals = periods.get(key);
    let aggVal;
    if (agg === 'sum') aggVal = sum(vals);
    else if (agg === 'mean') aggVal = mean(vals);
    else if (agg === 'count') aggVal = vals.length;
    else aggVal = sum(vals);
    const delta = prev !== null ? aggVal - prev : null;
    const growthPct = prev !== null && prev !== 0 ? +(((aggVal - prev) / Math.abs(prev)) * 100).toFixed(2) : null;
    result.push({
      period: key,
      value: +aggVal.toFixed(4),
      count: vals.length,
      prevValue: prev,
      delta: delta !== null ? +delta.toFixed(4) : null,
      growthPct,
    });
    prev = aggVal;
  }
  return result;
}

/**
 * Decomposition — break a measure down by a dimension.
 * Returns { dimension, measure, breakdown: [{ value, sum, mean, share }] }
 */
export function decompose(rows, measureCol, dimensionCol) {
  const agg = aggregateByDimension(rows, measureCol, dimensionCol, 'sum', 50);
  const total = sum(agg.map((a) => a.sum));
  return {
    dimension: dimensionCol,
    measure: measureCol,
    total: +total.toFixed(4),
    breakdown: agg,
    topShare: agg[0]?.share || 0,
    concentrationIndex: agg.length ? +((agg.slice(0, Math.ceil(agg.length * 0.2)).reduce((s, a) => s + a.share, 0))).toFixed(1) : 0,
  };
}

/**
 * Share-of-total — for each value in a dimension, what % of the measure does it own?
 */
export function shareOfTotal(rows, measureCol, dimensionCol) {
  return aggregateByDimension(rows, measureCol, dimensionCol, 'sum', 50).map((a) => ({
    value: a.value,
    sum: a.sum,
    share: a.share,
  }));
}

// ── 4. KPI GENERATION ──────────────────────────────────────────────────────

/**
 * Generate business KPIs from the OLAP analysis.
 */
export function generateBusinessKpis(rows, classified, olap) {
  const kpis = [];

  // Total records
  kpis.push({
    label: 'Total records',
    value: rows.length.toLocaleString(),
    trend: 'neutral',
    sub: `${classified.dimensions.length + classified.geoDimensions.length} dimensions · ${classified.measures.length} measures`,
  });

  // Total of primary measure
  if (classified.measures.length > 0) {
    const m = classified.measures[0];
    kpis.push({
      label: `Total ${m.column}`,
      value: fmt(m.sum),
      trend: m.sum >= m.mean * rows.length ? 'up' : 'down',
      sub: `avg ${fmt(m.mean)}`,
    });

    // Average per record (e.g., average order value)
    kpis.push({
      label: `Avg ${m.column}`,
      value: fmt(m.mean),
      trend: m.mean >= (m.min + m.max) / 2 ? 'up' : 'down',
      sub: `range ${fmt(m.min)} – ${fmt(m.max)}`,
    });
  }

  // Time-based KPIs: growth rate
  if (classified.timeDimensions.length > 0 && classified.measures.length > 0) {
    const td = classified.timeDimensions[0];
    const m = classified.measures[0];
    const pop = olap.periodOverPeriod[`${m.column}__${td.column}__month`];
    if (pop && pop.length >= 2) {
      const last = pop[pop.length - 1];
      const prev = pop[pop.length - 2];
      if (last.growthPct !== null) {
        kpis.push({
          label: `${m.column} MoM growth`,
          value: (last.growthPct > 0 ? '+' : '') + last.growthPct + '%',
          trend: last.growthPct > 0 ? 'up' : last.growthPct < 0 ? 'down' : 'neutral',
          sub: `${fmt(prev.value)} → ${fmt(last.value)}`,
        });
      }
      // YTD total
      const ytd = sum(pop.map((p) => p.value));
      kpis.push({
        label: `${m.column} (period total)`,
        value: fmt(ytd),
        trend: 'up',
        sub: `${pop.length} periods`,
      });
    }
  }

  // Top performer KPI
  if (classified.measures.length > 0 && (classified.dimensions.length > 0 || classified.geoDimensions.length > 0)) {
    const m = classified.measures[0];
    const d = classified.dimensions[0] || classified.geoDimensions[0];
    const top = olap.topN[`${m.column}__${d.column}__sum`];
    if (top && top.length > 0) {
      kpis.push({
        label: `Top ${d.column}`,
        value: String(top[0].value).slice(0, 14),
        trend: 'up',
        sub: `${fmt(top[0].sum)} (${pct(top[0].share)} share)`,
      });
    }
  }

  // Pareto KPI
  if (classified.measures.length > 0 && (classified.dimensions.length > 0 || classified.geoDimensions.length > 0)) {
    const m = classified.measures[0];
    const d = classified.dimensions[0] || classified.geoDimensions[0];
    const pareto = olap.paretos[`${m.column}__${d.column}`];
    if (pareto && pareto.paretoCount > 0) {
      kpis.push({
        label: 'Pareto concentration',
        value: `${pareto.paretoCount} / ${pareto.totalContributors}`,
        trend: pareto.concentrationIndex < 30 ? 'up' : 'neutral',
        sub: `top ${pareto.paretoCount} = ${pct(pareto.cumulativeAt80)} of total`,
      });
    }
  }

  // Anomaly count KPI
  if (olap.anomalyCount > 0) {
    kpis.push({
      label: 'Anomalies',
      value: olap.anomalyCount,
      trend: 'down',
      sub: 'statistical outliers',
    });
  }

  return kpis.slice(0, 8);
}

// ── MASTER ORCHESTRATOR ────────────────────────────────────────────────────

/**
 * Run the full OLAP analysis on a dataset.
 * @param {object[]} rows
 * @param {string[]} headers
 * @param {object} columnProfiles
 * @param {object} stats  from computeStatistics
 * @returns {object} { classified, olap, businessSummary, businessInsights, businessAnomalies }
 */
export function runOlapAnalysis(rows, headers, columnProfiles, stats) {
  // 1. Classify columns
  const classified = classifyColumns(rows, headers, columnProfiles);

  // 2. Pick the primary measure and primary dimension for default views
  const primaryMeasure = classified.measures[0]?.column || null;
  const primaryDimension = classified.dimensions[0]?.column || classified.geoDimensions[0]?.column || null;
  const primaryTimeDimension = classified.timeDimensions[0]?.column || null;

  // 3. Run aggregations
  const olap = {
    topN: {},
    paretos: {},
    periodOverPeriod: {},
    decompositions: {},
    anomalies: [],
    anomalyCount: 0,
  };

  // Top-N for each (measure × dimension) pair
  for (const m of classified.measures) {
    for (const d of [...classified.dimensions, ...classified.geoDimensions]) {
      const key = `${m.column}__${d.column}__sum`;
      try {
        olap.topN[key] = topNByMeasure(rows, m.column, d.column, 10, 'sum');
      } catch { /* skip */ }
      try {
        olap.paretos[`${m.column}__${d.column}`] = paretoAnalysis(rows, m.column, d.column);
      } catch { /* skip */ }
    }
    // Period-over-period
    if (primaryTimeDimension) {
      const key = `${m.column}__${primaryTimeDimension}__month`;
      try {
        olap.periodOverPeriod[key] = periodOverPeriod(rows, m.column, primaryTimeDimension, 'month', 'sum');
      } catch { /* skip */ }
    }
  }

  // Decomposition: primary measure by each dimension
  if (primaryMeasure) {
    for (const d of [...classified.dimensions, ...classified.geoDimensions]) {
      try {
        olap.decompositions[`${primaryMeasure}__${d.column}`] = decompose(rows, primaryMeasure, d.column);
      } catch { /* skip */ }
    }
  }

  // Anomalies from stats (IQR outliers) — re-surface as business anomalies
  if (stats && stats.columnStats) {
    for (const h of stats.numericColumns || []) {
      const c = stats.columnStats[h];
      if (c && c.outliers > 0) {
        // Find actual outlier records
        const vals = numericValues(rows, h);
        const q1 = c.q1, q3 = c.q3;
        const iqr = q3 - q1;
        const lower = q1 - 1.5 * iqr;
        const upper = q3 + 1.5 * iqr;
        const outlierVals = vals.filter((v) => v < lower || v > upper);
        const max = Math.max(...outlierVals, 0);
        const min = Math.min(...outlierVals, 0);
        olap.anomalies.push({
          column: h,
          count: c.outliers,
          range: `${fmt(min)} – ${fmt(max)}`,
          threshold: `outside ${fmt(lower)} – ${fmt(upper)}`,
          severity: c.outliers > 10 ? 'high' : c.outliers > 3 ? 'medium' : 'low',
        });
        olap.anomalyCount += c.outliers;
      }
    }
  }

  // 4. Build business insights
  const businessInsights = [];
  const businessAnomalies = [];

  // Insight: top performer
  if (primaryMeasure && primaryDimension) {
    const top = olap.topN[`${primaryMeasure}__${primaryDimension}__sum`];
    if (top && top.length > 0) {
      const t = top[0];
      businessInsights.push(
        `"${t.value}" is the top ${primaryDimension} by ${primaryMeasure}, contributing ${fmt(t.sum)} (${pct(t.share)} of total).`
      );
      if (top.length >= 3) {
        const top3Share = top.slice(0, 3).reduce((s, x) => s + x.share, 0);
        businessInsights.push(
          `The top 3 ${primaryDimension}s account for ${pct(top3Share)} of all ${primaryMeasure}, indicating ${top3Share > 60 ? 'high' : 'moderate'} concentration.`
        );
      }
    }
  }

  // Insight: Pareto concentration
  if (primaryMeasure && primaryDimension) {
    const pareto = olap.paretos[`${primaryMeasure}__${primaryDimension}`];
    if (pareto && pareto.paretoCount > 0) {
      businessInsights.push(
        `Pareto analysis: the top ${pareto.paretoCount} ${primaryDimension}s (${pct(pareto.concentrationIndex)} of all) drive ${pct(pareto.cumulativeAt80)} of total ${primaryMeasure}.`
      );
    }
  }

  // Insight: time trend
  if (primaryMeasure && primaryTimeDimension) {
    const pop = olap.periodOverPeriod[`${primaryMeasure}__${primaryTimeDimension}__month`];
    if (pop && pop.length >= 2) {
      const last = pop[pop.length - 1];
      const first = pop[0];
      const totalGrowth = first.value !== 0 ? +(((last.value - first.value) / Math.abs(first.value)) * 100).toFixed(2) : null;
      if (totalGrowth !== null) {
        businessInsights.push(
          `${primaryMeasure} ${totalGrowth >= 0 ? 'grew' : 'declined'} ${Math.abs(totalGrowth)}% from ${first.period} to ${last.period} (${fmt(first.value)} → ${fmt(last.value)}).`
        );
      }
      if (last.growthPct !== null && pop.length >= 2) {
        const prev = pop[pop.length - 2];
        businessInsights.push(
          `Most recent period (${last.period}) showed ${last.growthPct >= 0 ? '+' : ''}${last.growthPct}% change vs ${prev.period}.`
        );
      }
      // Peak period
      const peak = pop.reduce((a, b) => b.value > a.value ? b : a);
      const trough = pop.reduce((a, b) => b.value < a.value ? b : a);
      businessInsights.push(
        `Peak ${primaryMeasure} period: ${peak.period} (${fmt(peak.value)}); lowest: ${trough.period} (${fmt(trough.value)}).`
      );
    }
  }

  // Insight: averages
  if (classified.measures.length > 0) {
    const m = classified.measures[0];
    businessInsights.push(
      `Average ${m.column} per record is ${fmt(m.mean)}, ranging from ${fmt(m.min)} to ${fmt(m.max)}.`
    );
  }

  // Insight: dataset composition
  const dimCount = classified.dimensions.length + classified.geoDimensions.length;
  const measureCount = classified.measures.length;
  businessInsights.push(
    `Dataset contains ${rows.length.toLocaleString()} records with ${dimCount} ${dimCount === 1 ? 'dimension' : 'dimensions'} and ${measureCount} ${measureCount === 1 ? 'measure' : 'measures'}${classified.timeDimensions.length ? `, including a time dimension (${classified.timeDimensions[0].column})` : ''}.`
  );

  // Insight: geographic
  if (classified.geoDimensions.length > 0) {
    const g = classified.geoDimensions[0];
    businessInsights.push(
      `Geographic dimension "${g.column}" has ${g.uniqueCount} distinct values across the dataset.`
    );
  }

  // Anomalies as business insights
  for (const a of olap.anomalies) {
    businessAnomalies.push(
      `${a.count} outlier${a.count === 1 ? '' : 's'} in "${a.column}" (${a.severity} severity) — values ${a.range} vs typical range ${a.threshold}.`
    );
  }

  // 5. Build business summary (the executive narrative)
  const businessSummary = buildBusinessSummary(rows, classified, olap, primaryMeasure, primaryDimension, primaryTimeDimension);

  // 6. Generate business KPIs
  const kpis = generateBusinessKpis(rows, classified, olap);

  return {
    classified,
    olap,
    primaryMeasure,
    primaryDimension,
    primaryTimeDimension,
    businessSummary,
    businessInsights,
    businessAnomalies,
    kpis,
  };
}

function buildBusinessSummary(rows, classified, olap, primaryMeasure, primaryDimension, primaryTimeDimension) {
  const parts = [];
  parts.push(`This dataset has ${rows.length.toLocaleString()} records`);

  if (primaryMeasure) {
    const m = classified.measures[0];
    parts.push(`totalling ${fmt(m.sum)} in ${m.column}`);
  }

  if (primaryDimension) {
    const top = olap.topN[`${primaryMeasure}__${primaryDimension}__sum`];
    if (top && top.length > 0) {
      parts.push(`led by "${top[0].value}" (${pct(top[0].share)} share)`);
    }
  }

  if (primaryTimeDimension) {
    const pop = olap.periodOverPeriod[`${primaryMeasure}__${primaryTimeDimension}__month`];
    if (pop && pop.length >= 2) {
      const last = pop[pop.length - 1];
      const first = pop[0];
      const totalGrowth = first.value !== 0 ? +(((last.value - first.value) / Math.abs(first.value)) * 100).toFixed(2) : null;
      if (totalGrowth !== null) {
        parts.push(`${totalGrowth >= 0 ? 'up' : 'down'} ${Math.abs(totalGrowth)}% over ${first.period} → ${last.period}`);
      }
    }
  }

  if (primaryMeasure && primaryDimension) {
    const pareto = olap.paretos[`${primaryMeasure}__${primaryDimension}`];
    if (pareto && pareto.paretoCount > 0) {
      parts.push(`with the top ${pareto.paretoCount} ${primaryDimension}s driving ${pct(pareto.cumulativeAt80)} of total`);
    }
  }

  return parts.join(', ') + '.';
}
