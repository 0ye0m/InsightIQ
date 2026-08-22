// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — LLM Analysis Planner
//
// Runs AFTER file parsing but BEFORE the deterministic analysis. Looks at
// the headers + a sample of rows, asks the generation engine to:
//
//   1. Identify the domain ("E-commerce sales", "HR data", "Titanic
//      survivor data", "Netflix catalog", etc.)
//   2. Decide which column is the primary measure (the main business
//      metric — revenue, sales, fare, score, etc.)
//   3. Decide which column is the primary dimension (the most useful
//      slicing axis — product, region, genre, class, etc.)
//   4. Suggest domain-specific KPIs (Total Revenue, Average Order Value,
//      Survival Rate, Headcount, Attrition Rate, etc.)
//   5. Suggest which charts to prioritize
//   6. Suggest which insights to compute
//
// The deterministic engine then EXECUTES this plan — computes the specific
// KPIs the LLM suggested, builds the specific charts the LLM prioritized,
// runs the specific insights the LLM requested.
//
// If the LLM is unavailable, falls back to a deterministic plan based on
// the static keyword rules in olap.js.
// ─────────────────────────────────────────────────────────────────────────

import { chatCompletion } from './client.js';
import { classifyColumns } from '../lib/olap.js';

const PLANNER_SYSTEM_PROMPT = `You are the InsightIQ analysis planner. You look at a dataset's headers and a small sample of rows, then decide HOW to analyze it.

Your job: produce a JSON analysis plan that tells the deterministic engine what to compute. You do NOT compute numbers yourself — you only decide WHAT to compute.

OUTPUT FORMAT (strict JSON, no markdown, no commentary):
{
  "domain": "short label for the dataset's domain (e.g. 'E-commerce sales', 'HR / employee data', 'Titanic survival data', 'Netflix content catalog', 'IMDB movie scores')",
  "domainDescription": "one sentence explaining what this dataset represents",
  "primaryMeasure": "the column name that is the main business metric (e.g. 'sales', 'revenue', 'Fare', 'Score'). Pick a real column from the headers.",
  "primaryDimension": "the column name that is the most useful slicing axis (e.g. 'product', 'region', 'Pclass', 'Genre'). Pick a real column from the headers. Avoid ID columns and booleans.",
  "primaryTimeDimension": "the column name that represents time (e.g. 'date', 'release_year', 'Year'). Pick a real column, or null if there is no time column.",
  "kpis": [
    {
      "name": "human-readable KPI name (e.g. 'Total Revenue', 'Average Order Value', 'Survival Rate', 'Headcount')",
      "type": "total | average | count | ratio | topN | growth",
      "measure": "column name to aggregate, or null for count-based KPIs",
      "dimension": "column name to slice by, or null for overall KPIs",
      "agg": "sum | mean | count | max | min",
      "description": "one sentence explaining what this KPI tells the user"
    }
  ],
  "charts": [
    {
      "type": "bar | line | doughnut | histogram | scatter | area",
      "measure": "column name for the y-axis (or null for distribution charts)",
      "dimension": "column name for the x-axis / segments",
      "title": "suggested chart title"
    }
  ],
  "insights": [
    "specific insight to compute and surface (e.g. 'Top 5 products by total revenue', 'Survival rate by passenger class', 'Monthly revenue trend')"
  ]
}

RULES:
1. Only use column names that appear in the provided headers.
2. Pick a primaryMeasure that is numeric and aggregatable — NOT an ID column.
3. Pick a primaryDimension that has 3-20 distinct values — NOT a boolean, NOT an ID.
4. Suggest 4-6 KPIs that a business analyst would find useful for this domain.
5. Suggest 4-6 charts that visualise the most important patterns.
6. Suggest 3-5 specific insights to compute.
7. Return ONLY valid JSON — no markdown, no commentary, no code blocks.`;

const PLANNER_USER_TEMPLATE = `Analyze this dataset and produce an analysis plan.

File: {fileName}
Headers: {headers}
Column types: {columnTypes}
Sample rows (first 5):
{sampleRows}

Produce the JSON analysis plan now. Remember: only use column names from the headers above.`;

/**
 * Generate an analysis plan for a parsed dataset.
 * @param {object} parsed — output of parseFile(): { headers, rows, meta }
 * @returns {Promise<object>} the analysis plan
 */
export async function generateAnalysisPlan(parsed) {
  const { headers, rows, meta } = parsed;

  // Build a deterministic fallback first (in case the LLM fails)
  const fallbackPlan = buildDeterministicPlan(parsed);

  // If no keys configured, return the fallback
  try {
    // Build the sample (first 5 rows, all columns)
    const sample = rows.slice(0, 5).map((r) => {
      const obj = {};
      for (const h of headers) {
        const v = r[h];
        obj[h] = v === null || v === undefined ? '' : String(v).slice(0, 50);
      }
      return obj;
    });

    // Build column types from a quick scan
    const columnTypes = {};
    for (const h of headers) {
      const vals = rows.slice(0, 20).map((r) => r[h]).filter((v) => v !== null && v !== undefined && v !== '');
      if (!vals.length) { columnTypes[h] = 'empty'; continue; }
      const numericCount = vals.filter((v) => !isNaN(Number(v))).length;
      if (numericCount / vals.length > 0.8) columnTypes[h] = 'numeric';
      else columnTypes[h] = 'text';
    }

    const userPrompt = PLANNER_USER_TEMPLATE
      .replace('{fileName}', meta.fileName)
      .replace('{headers}', headers.join(', '))
      .replace('{columnTypes}', Object.entries(columnTypes).map(([k, v]) => `${k}: ${v}`).join(', '))
      .replace('{sampleRows}', JSON.stringify(sample, null, 2));

    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      maxTokens: 1500,
    });

    // Parse the JSON response (with fallback for markdown wrapping)
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }
    const plan = JSON.parse(cleaned);

    // Validate: ensure primaryMeasure and primaryDimension are real columns
    if (!headers.includes(plan.primaryMeasure)) {
      plan.primaryMeasure = fallbackPlan.primaryMeasure;
    }
    if (!headers.includes(plan.primaryDimension)) {
      plan.primaryDimension = fallbackPlan.primaryDimension;
    }
    if (plan.primaryTimeDimension && !headers.includes(plan.primaryTimeDimension)) {
      plan.primaryTimeDimension = fallbackPlan.primaryTimeDimension;
    }

    return {
      source: 'llm',
      ...plan,
      fallbackUsed: false,
    };
  } catch (e) {
    // LLM failed — use the deterministic fallback
    return {
      source: 'deterministic-fallback',
      ...fallbackPlan,
      fallbackUsed: true,
      error: e.message,
    };
  }
}

/**
 * Build a deterministic fallback plan based on the static keyword rules.
 * This is what runs if the LLM is unavailable or returns invalid JSON.
 */
function buildDeterministicPlan(parsed) {
  const { headers, rows } = parsed;

  // Use the existing classifier to get column roles
  const fakeProfiles = {};
  for (const h of headers) {
    const vals = rows.slice(0, 50).map((r) => r[h]).filter((v) => v !== null && v !== undefined && v !== '');
    if (!vals.length) { fakeProfiles[h] = { type: 'empty' }; continue; }
    const numericCount = vals.filter((v) => !isNaN(Number(v))).length;
    if (numericCount / vals.length > 0.85) fakeProfiles[h] = { type: 'number' };
    else if (vals.every((v) => /^\d{4}-\d{2}-\d{2}/.test(String(v)))) fakeProfiles[h] = { type: 'date' };
    else {
      const unique = new Set(vals.map((v) => String(v).toLowerCase()));
      fakeProfiles[h] = { type: unique.size <= 20 ? 'category' : 'text' };
    }
  }

  const classified = classifyColumns(rows, headers, fakeProfiles);

  const primaryMeasure = classified.measures[0]?.column || null;
  const primaryDimension = classified.dimensions[0]?.column
    || classified.geoDimensions[0]?.column || null;
  const primaryTimeDimension = classified.timeDimensions[0]?.column || null;

  // Build default KPIs
  const kpis = [];
  if (primaryMeasure) {
    kpis.push({ name: `Total ${primaryMeasure}`, type: 'total', measure: primaryMeasure, dimension: null, agg: 'sum', description: `Sum of all ${primaryMeasure} values` });
    kpis.push({ name: `Average ${primaryMeasure}`, type: 'average', measure: primaryMeasure, dimension: null, agg: 'mean', description: `Mean ${primaryMeasure} per record` });
  }
  kpis.push({ name: 'Total records', type: 'count', measure: null, dimension: null, agg: 'count', description: 'Number of rows in the dataset' });
  if (primaryMeasure && primaryDimension) {
    kpis.push({ name: `Top ${primaryDimension}`, type: 'topN', measure: primaryMeasure, dimension: primaryDimension, agg: 'sum', description: `${primaryDimension} with highest ${primaryMeasure}` });
  }
  if (primaryMeasure && primaryTimeDimension) {
    kpis.push({ name: `${primaryMeasure} growth`, type: 'growth', measure: primaryMeasure, dimension: primaryTimeDimension, agg: 'sum', description: `Period-over-period growth in ${primaryMeasure}` });
  }

  // Build default charts
  const charts = [];
  if (primaryMeasure && primaryDimension) {
    charts.push({ type: 'bar', measure: primaryMeasure, dimension: primaryDimension, title: `${primaryMeasure} by ${primaryDimension}` });
  }
  if (primaryMeasure && primaryTimeDimension) {
    charts.push({ type: 'line', measure: primaryMeasure, dimension: primaryTimeDimension, title: `${primaryMeasure} trend over time` });
  }
  if (primaryDimension) {
    charts.push({ type: 'doughnut', measure: null, dimension: primaryDimension, title: `${primaryDimension} distribution` });
  }
  if (primaryMeasure) {
    charts.push({ type: 'histogram', measure: primaryMeasure, dimension: null, title: `${primaryMeasure} distribution` });
  }

  // Build default insights
  const insights = [];
  if (primaryMeasure && primaryDimension) {
    insights.push(`Top 5 ${primaryDimension}s by ${primaryMeasure}`);
    insights.push(`${primaryMeasure} concentration (Pareto) across ${primaryDimension}s`);
  }
  if (primaryMeasure && primaryTimeDimension) {
    insights.push(`${primaryMeasure} trend over time by ${primaryTimeDimension}`);
  }
  if (primaryMeasure) {
    insights.push(`Average ${primaryMeasure} and outliers`);
  }

  return {
    domain: 'Generic dataset',
    domainDescription: `Dataset with ${rows.length} records and ${headers.length} columns`,
    primaryMeasure,
    primaryDimension,
    primaryTimeDimension,
    kpis,
    charts,
    insights,
  };
}