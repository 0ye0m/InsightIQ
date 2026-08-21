// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — data helpers shared by chart builder + statistics
// ─────────────────────────────────────────────────────────────────────────

export function numericValues(rows, col) {
  const out = [];
  for (const r of rows) {
    const v = r[col];
    if (typeof v === 'number' && !isNaN(v) && isFinite(v)) out.push(v);
  }
  return out;
}

export function getCategoryDistribution(rows, col, limit = 10) {
  const counts = {};
  for (const r of rows) {
    const v = r[col];
    if (v === null || v === undefined || v === '') continue;
    const k = String(v);
    counts[k] = (counts[k] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
  return { labels: sorted.map((e) => e[0]), values: sorted.map((e) => e[1]) };
}

export function getTopByAggregate(rows, categoryCol, numericCol, agg = 'sum', limit = 10) {
  const groups = {};
  for (const r of rows) {
    const cat = r[categoryCol];
    const val = Number(r[numericCol]);
    if (cat === null || cat === undefined || cat === '' || isNaN(val)) continue;
    (groups[String(cat)] ||= []).push(val);
  }
  const entries = Object.entries(groups).map(([cat, vals]) => {
    let v;
    if (agg === 'sum') v = vals.reduce((a, b) => a + b, 0);
    else if (agg === 'mean') v = vals.reduce((a, b) => a + b, 0) / vals.length;
    else if (agg === 'max') v = Math.max(...vals);
    else if (agg === 'min') v = Math.min(...vals);
    else v = vals.length;
    return [cat, +v.toFixed(4)];
  });
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries.slice(0, limit);
  return { labels: top.map((e) => e[0]), values: top.map((e) => e[1]) };
}

export function extractNumericColumns(rows, headers) {
  return headers.filter((h) => {
    const sample = rows.slice(0, 50).map((r) => r[h]);
    const numeric = sample.filter((v) => v !== '' && v != null && !isNaN(Number(v))).length;
    return numeric > sample.length * 0.6;
  });
}

export function extractCategoryColumns(rows, headers) {
  return headers.filter((h) => {
    const sample = rows.slice(0, 50).map((r) => r[h]).filter((v) => v !== '' && v != null);
    const unique = new Set(sample.map((v) => String(v)));
    return unique.size > 1 && unique.size <= 30 && sample.some((v) => isNaN(Number(v)));
  });
}
