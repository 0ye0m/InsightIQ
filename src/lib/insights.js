// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — business insight generator (OLAP-powered)
//
// Produces insights, KPIs, anomalies, and predictions that a Power BI
// analyst or business professional would actually use. Powered by the OLAP
// engine in ./olap.js — Top-N performers, Pareto concentration, period-
// over-period growth, decomposition, share-of-total.
//
// Technical data-quality facts (null %, duplicate count) are kept as a
// separate "data health" note — they're useful context, but they are NOT
// the primary insights a business user wants to see.
// ─────────────────────────────────────────────────────────────────────────

import { runOlapAnalysis } from './olap.js';
import { mean, median, stddev, quantile } from './statistics.js';

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

/**
 * Generate business-focused insights from the dataset.
 * @param {object} stats  output of computeStatistics (with rows, headers, columnProfiles)
 * @returns {object} { insights, anomalies, kpis, predictions, executiveSummary, olap }
 */
export function generateInsights(stats) {
  const { rows, headers, columnProfiles, _numericValues } = stats;

  // Run the OLAP analysis — this is where the business value comes from.
  const olap = runOlapAnalysis(rows || [], headers || [], columnProfiles || {}, stats);

  // Insights: business-meaningful, not technical.
  const insights = olap.businessInsights;

  // Anomalies: business-meaningful outliers.
  const anomalies = olap.businessAnomalies;

  // KPIs: business KPIs from OLAP.
  const kpis = olap.kpis;

  // Predictions: forward signals.
  const predictions = buildPredictions(stats, olap);

  // Executive summary: business narrative.
  const executiveSummary = olap.businessSummary;

  // Also expose olap + classified so the UI can render Top-N / Pareto / PoP charts.
  return {
    insights,
    anomalies,
    kpis,
    predictions,
    executiveSummary,
    olap,
    classified: olap.classified,
    // Legacy fields (still used by some UI components)
    dataHealth: buildDataHealthNote(stats),
  };
}

function buildPredictions(stats, olap) {
  const out = [];
  // Trend-based prediction
  if (olap.primaryMeasure && olap.primaryTimeDimension) {
    const pop = olap.olap.periodOverPeriod[`${olap.primaryMeasure}__${olap.primaryTimeDimension}__month`];
    if (pop && pop.length >= 3) {
      // Simple linear projection: average growth rate × last value
      const growthRates = pop.filter((p) => p.growthPct !== null).map((p) => p.growthPct);
      if (growthRates.length > 0) {
        const avgGrowth = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
        const last = pop[pop.length - 1];
        const projected = last.value * (1 + avgGrowth / 100);
        out.push(
          `At the recent average growth rate of ${avgGrowth.toFixed(1)}%, the next period is projected to reach ${fmt(projected)} ${olap.primaryMeasure} (directional only, not a forecast).`
        );
      }
    }
  }
  // Pareto-based prediction
  if (olap.primaryMeasure && olap.primaryDimension) {
    const pareto = olap.olap.paretos[`${olap.primaryMeasure}__${olap.primaryDimension}`];
    if (pareto && pareto.paretoCount > 0) {
      out.push(
        `Since the top ${pareto.paretoCount} ${olap.primaryDimension}s drive ${pct(pareto.cumulativeAt80)} of ${olap.primaryMeasure}, focusing retention / growth efforts on these top performers is likely to yield disproportionate returns.`
      );
    }
  }
  // Volatility prediction
  if (olap.classified.measures.length > 0) {
    const m = olap.classified.measures[0];
    const cv = m.mean ? (Math.sqrt(stats.columnStats[m.column]?.variance || 0)) / Math.abs(m.mean) : 0;
    if (cv > 0.5) {
      out.push(
        `${m.column} shows high volatility (coefficient of variation ${pct(cv * 100)}) — consider segmenting the analysis to find the source of variance.`
      );
    } else if (cv > 0.2 && cv <= 0.5) {
      out.push(
        `${m.column} shows moderate volatility (coefficient of variation ${pct(cv * 100)}) — variability is meaningful but not extreme.`
      );
    }
  }
  return out;
}

function buildDataHealthNote(stats) {
  const issues = [];
  if (stats.nullPercentage > 0) {
    issues.push(`${stats.nullPercentage}% missing values across ${stats.nullCells} cells`);
  }
  if (stats.duplicateRows > 0) {
    issues.push(`${stats.duplicateRows} duplicate ${stats.duplicateRows === 1 ? 'row' : 'rows'} removed during cleaning`);
  }
  const weakCols = Object.entries(stats.nullsPerColumn || {}).filter(([_, n]) => n / Math.max(stats.totalRows, 1) > 0.5);
  if (weakCols.length > 0) {
    issues.push(`${weakCols.length} ${weakCols.length === 1 ? 'column has' : 'columns have'} >50% missing data`);
  }
  return issues.length ? `Data health: ${issues.join('; ')}.` : 'Data health: no significant issues detected.';
}
