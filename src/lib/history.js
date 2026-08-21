// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — analysis history tracker
//
// Stores completed analyses in localStorage so the user can:
//   • re-open a past analysis without re-uploading
//   • compare any two past analyses
//   • see a KPI-over-time trend for repeated uploads of the same source
//
// Each entry is a lightweight snapshot (no full row data) so storage
// stays small even with many runs.
// ─────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'insightiq.history';
const MAX_ENTRIES = 20;

export function listHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addHistoryEntry(analysis) {
  const list = listHistory();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    fileName: analysis.meta.fileName,
    fileType: analysis.meta.fileType,
    kind: analysis.meta.kind || 'tabular',
    rows: analysis.stats.totalRows,
    cols: analysis.stats.totalColumns,
    quality: analysis.quality.score,
    nullPercentage: analysis.stats.nullPercentage,
    duplicateRows: analysis.stats.duplicateRows,
    numericCols: analysis.stats.numericColumnCount,
    categoryCols: analysis.stats.categoryColumnCount,
    // store first numeric column mean for trend tracking
    firstMetric: analysis.stats.numericColumns[0]
      ? {
          column: analysis.stats.numericColumns[0],
          mean: analysis.stats.columnStats[analysis.stats.numericColumns[0]]?.mean,
          median: analysis.stats.columnStats[analysis.stats.numericColumns[0]]?.median,
        }
      : null,
    // store top category for distribution tracking
    topCategory: analysis.stats.categoryColumns[0]
      ? {
          column: analysis.stats.categoryColumns[0],
          topValue: analysis.stats.columnStats[analysis.stats.categoryColumns[0]]?.topValues?.[0]?.value,
          topCount: analysis.stats.columnStats[analysis.stats.categoryColumns[0]]?.topValues?.[0]?.count,
        }
      : null,
    headers: analysis.cleaned.headers,
    summary: analysis.insights.executiveSummary.slice(0, 200),
  };
  list.unshift(entry);
  if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    // storage full — drop oldest until it fits
    while (list.length > 1) {
      list.pop();
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        break;
      } catch {}
    }
  }
  return entry;
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}

export function removeHistoryEntry(id) {
  const list = listHistory().filter((e) => e.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  return list;
}

/**
 * Build a trend series for a specific fileName across all history entries.
 * Returns entries ordered by time ascending, with their KPIs.
 */
export function trendForFile(fileName) {
  return listHistory()
    .filter((e) => e.fileName === fileName)
    .reverse();
}

/**
 * Overall trend: rows analysed over time across all entries.
 */
export function overallTrend() {
  return listHistory().slice().reverse();
}
