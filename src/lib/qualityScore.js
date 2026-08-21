// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — data quality score
//
// A deterministic 0–100 score with a transparent breakdown. Each dimension
// is weighted; the final score is the weighted average.
// ─────────────────────────────────────────────────────────────────────────

/**
 * @param {object} stats  output of computeStatistics
 * @returns {object} { score, breakdown: [{ dimension, weight, value, contribution }] }
 */
export function computeQualityScore(stats) {
  const totalRows = stats.totalRows || 1;
  const totalCells = stats.memoryCells || 1;

  // Completeness: share of cells that are populated.
  const completeness = Math.max(0, 100 - (stats.nullCells / totalCells) * 100);

  // Uniqueness: share of rows that are not duplicates.
  const uniqueness = Math.max(0, 100 - (stats.duplicateRows / totalRows) * 100);

  // Type richness: does the dataset have a healthy mix of typed columns?
  const typedCols = stats.numericColumnCount + stats.categoryColumnCount + stats.dateColumnCount;
  const richness = stats.totalColumns ? Math.min(100, (typedCols / stats.totalColumns) * 100) : 0;

  // Volume: log-scaled — small datasets aren't penalised harshly but larger is better.
  const volume = Math.min(100, (Math.log10(totalRows + 1) / Math.log10(100000)) * 100);

  // Consistency: penalise columns with very high null rates (>50%).
  const weakCols = Object.values(stats.nullsPerColumn).filter((n) => n / totalRows > 0.5).length;
  const consistency = stats.totalColumns ? Math.max(0, 100 - (weakCols / stats.totalColumns) * 100) : 100;

  const dimensions = [
    { dimension: 'Completeness', weight: 0.35, value: completeness },
    { dimension: 'Uniqueness', weight: 0.25, value: uniqueness },
    { dimension: 'Consistency', weight: 0.20, value: consistency },
    { dimension: 'Type Richness', weight: 0.10, value: richness },
    { dimension: 'Volume', weight: 0.10, value: volume },
  ];

  const score = Math.round(
    dimensions.reduce((acc, d) => acc + d.weight * d.value, 0)
  );

  const breakdown = dimensions.map((d) => ({
    dimension: d.dimension,
    weight: d.weight,
    value: +d.value.toFixed(1),
    contribution: +(d.weight * d.value).toFixed(1),
  }));

  return { score, breakdown };
}
