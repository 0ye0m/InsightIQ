// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — dynamic suggestion generator (OLAP-aware)
//
// Generates Power BI / Tableau-style questions tailored to the actual
// dataset or document. Two layers:
//
//   1. Deterministic (instant) — built from the OLAP analysis: real
//      column names, real top performers, real correlations, real time
//      periods, real document topics/entities.
//
//   2. LLM-powered (async) — calls the generation engine to produce
//      fresh, varied, natural-language questions when the user clicks
//      "Suggest more".
//
// Questions mirror what a senior Power BI analyst would ask:
//   • "What are the top 5 products by revenue?"
//   • "How does sales trend month-over-month by region?"
//   • "Which customers drive 80% of revenue?"
//   • "Compare Q1 vs Q2 performance by category"
//   • "What's the year-over-year growth rate?"
// ─────────────────────────────────────────────────────────────────────────

import { chatCompletion } from './client.js';

/**
 * Deterministic suggestions — instant, no API call.
 * @param {object} analysis  the assembled analysis object
 * @returns {string[]}  6 question suggestions
 */
export function buildSuggestions(analysis) {
  const { stats, insights, documentAnalysis, meta, tables } = analysis;
  const olap = insights?.olap;
  const classified = insights?.classified;
  const suggestions = [];

  // ── Document mode (PDF / Word / large text) ──────────────────────────
  if (documentAnalysis && (!stats || stats.totalRows <= 5 || meta.kind === 'document')) {
    const da = documentAnalysis;
    suggestions.push('Summarise this document in 3–4 sentences.');
    if (da.keywords?.length) {
      const top3 = da.keywords.slice(0, 3).map((k) => k.term).join(', ');
      suggestions.push(`Tell me more about ${top3}.`);
    }
    if (da.topics?.length) {
      const t = da.topics[0];
      suggestions.push(`What does topic ${t.topic} cover? List its keywords.`);
    }
    if (da.entities?.total > 0) {
      const kinds = Object.keys(da.entities.entities);
      if (kinds.includes('date')) suggestions.push('What are the key dates mentioned in the document?');
      if (kinds.includes('currency')) suggestions.push('What monetary values appear, and in what context?');
      if (kinds.includes('email') || kinds.includes('phone')) suggestions.push('Who are the key contacts mentioned?');
      if (kinds.includes('url')) suggestions.push('What external references or URLs are cited?');
    }
    if (da.keyPassages?.length) {
      suggestions.push('Show me the most information-dense passage in the document.');
    }
    suggestions.push('What is the readability level and who is the target audience?');
    if (da.sentiment) {
      suggestions.push(`Why is the document ${da.sentiment.label}? Cite evidence.`);
    }
    if (tables?.length) {
      suggestions.push(`Summarise the data in the extracted table.`);
    }
    return dedupe(suggestions).slice(0, 6);
  }

  // ── Tabular mode — Power BI / OLAP-style questions ──────────────────
  if (!olap || !classified) {
    // Fallback if OLAP didn't run
    suggestions.push('Summarise this dataset in one paragraph.');
    return suggestions.slice(0, 6);
  }

  const primaryMeasure = olap.primaryMeasure;
  const primaryDimension = olap.primaryDimension;
  const primaryTime = olap.primaryTimeDimension;
  const measures = classified.measures;
  const dimensions = [...classified.dimensions, ...classified.geoDimensions];

  // 1. Top-N question
  if (primaryMeasure && primaryDimension) {
    const top = olap.olap.topN[`${primaryMeasure}__${primaryDimension}__sum`];
    if (top && top.length > 0) {
      suggestions.push(`What are the top 5 ${primaryDimension}s by ${primaryMeasure}, and what share do they represent?`);
    }
  }

  // 2. Bottom-N question
  if (primaryMeasure && primaryDimension) {
    suggestions.push(`Which ${primaryDimension}s have the lowest ${primaryMeasure}, and should we investigate why?`);
  }

  // 3. Pareto / concentration question
  if (primaryMeasure && primaryDimension) {
    const pareto = olap.olap.paretos[`${primaryMeasure}__${primaryDimension}`];
    if (pareto && pareto.paretoCount > 0) {
      suggestions.push(`Do the top ${pareto.paretoCount} ${primaryDimension}s really drive ${Math.round(pareto.cumulativeAt80)}% of ${primaryMeasure}? (Pareto check)`);
    }
  }

  // 4. Time trend question
  if (primaryMeasure && primaryTime) {
    const pop = olap.olap.periodOverPeriod[`${primaryMeasure}__${primaryTime}__month`];
    if (pop && pop.length >= 2) {
      const last = pop[pop.length - 1];
      if (last.growthPct !== null) {
        suggestions.push(`How has ${primaryMeasure} trended over time, and what was the most recent month-over-month change (${last.growthPct >= 0 ? '+' : ''}${last.growthPct}%?`);
      } else {
        suggestions.push(`How does ${primaryMeasure} trend over time by ${primaryTime}?`);
      }
    }
  }

  // 5. Period-over-period comparison
  if (primaryMeasure && primaryTime && dimensions.length > 0) {
    suggestions.push(`Compare ${primaryMeasure} across periods broken down by ${dimensions[0].column}.`);
  }

  // 6. Decomposition question
  if (primaryMeasure && dimensions.length > 0) {
    const d = dimensions[0];
    suggestions.push(`Break down ${primaryMeasure} by ${d.column} — which segment is the biggest contributor?`);
  }

  // 7. Correlation question (if 2+ measures exist)
  if (measures.length >= 2) {
    if (stats.strongPairs && stats.strongPairs.length > 0) {
      const p = stats.strongPairs[0];
      suggestions.push(`Is there a correlation between ${p.a} and ${p.b} (r = ${p.r})? What does it mean business-wise?`);
    } else {
      suggestions.push(`Is there any relationship between ${measures[0].column} and ${measures[1].column}?`);
    }
  }

  // 8. Anomaly question
  if (olap.olap.anomalyCount > 0) {
    suggestions.push(`Which ${olap.olap.anomalyCount} records are statistical outliers, and what might explain them?`);
  }

  // 9. Average / benchmark question
  if (primaryMeasure) {
    suggestions.push(`What's the average ${primaryMeasure}, and which records are above the average?`);
  }

  // 10. Geographic question
  if (classified.geoDimensions.length > 0 && primaryMeasure) {
    const g = classified.geoDimensions[0];
    suggestions.push(`How is ${primaryMeasure} distributed geographically across ${g.column}?`);
  }

  // 11. Cross-dimension question
  if (dimensions.length >= 2 && primaryMeasure) {
    suggestions.push(`How does ${primaryMeasure} compare across ${dimensions[0].column} × ${dimensions[1].column}?`);
  }

  // 12. Forecast question
  if (primaryMeasure && primaryTime) {
    suggestions.push(`Based on the recent trend, what's the projected ${primaryMeasure} for the next period?`);
  }

  return dedupe(suggestions).slice(0, 6);
}

function dedupe(arr) {
  return Array.from(new Set(arr.map((s) => s.trim())));
}

// ── LLM-powered suggestions ────────────────────────────────────────────────

const SUGGESTION_SYSTEM_PROMPT = `You are the InsightIQ suggestion engine. You generate insightful, varied question suggestions for a senior business analyst or Power BI analyst looking at a dataset or document.

RULES:
1. Generate 5 questions that a senior business / Power BI analyst would actually ask.
2. Questions must be specific to the data context provided — use real column names, real top performers, real time periods, real entities.
3. Mix question types: top-N performers, trends, period-over-period comparisons, Pareto/concentration, decomposition, anomalies, forecasts.
4. Vary the phrasing — don't repeat the structure of the example questions.
5. Each question on its own line, no numbering, no quotes, no markdown.
6. Frame questions in business language — talk about "revenue", "growth", "top performers", "concentration", not "rows", "columns", "nulls".
7. Do not mention how you work or that you are automated.`;

/**
 * LLM-powered suggestion refresh.
 */
export async function generateLLMSuggestions(analysis, existing = []) {
  const { stats, insights, documentAnalysis, meta } = analysis;
  const olap = insights?.olap;
  const classified = insights?.classified;
  const contextLines = [];

  contextLines.push(`File: ${meta.fileName} (${meta.fileType}, kind: ${meta.kind || 'tabular'})`);

  if (documentAnalysis && (!stats || stats.totalRows <= 5 || meta.kind === 'document')) {
    const da = documentAnalysis;
    contextLines.push(`Document analysis: ${da.structural.paragraphs} paragraphs, ${da.structural.words} words, readability ${da.readability.fleschScore} (${da.readability.label}), sentiment ${da.sentiment.label}.`);
    if (da.keywords?.length) {
      contextLines.push(`Top keywords: ${da.keywords.slice(0, 12).map((k) => k.term).join(', ')}.`);
    }
    if (da.topics?.length) {
      contextLines.push(`Topics detected: ${da.topics.map((t) => `(${t.keywords.slice(0, 4).join('/')})`).join('  ')}.`);
    }
    if (da.entities?.total > 0) {
      const ents = Object.entries(da.entities.entities).map(([k, v]) => `${k} (${v.count})`).join(', ');
      contextLines.push(`Entities: ${ents}.`);
    }
  } else if (olap && classified) {
    contextLines.push(`Dataset: ${stats.totalRows} rows × ${stats.totalColumns} columns.`);
    contextLines.push(`Measures (numeric, aggregatable): ${classified.measures.map((m) => m.column).join(', ') || 'none'}.`);
    contextLines.push(`Dimensions (categorical, slicable): ${[...classified.dimensions, ...classified.geoDimensions].map((d) => d.column).join(', ') || 'none'}.`);
    if (classified.timeDimensions.length) contextLines.push(`Time dimensions: ${classified.timeDimensions.map((d) => d.column).join(', ')}.`);
    if (classified.geoDimensions.length) contextLines.push(`Geographic dimensions: ${classified.geoDimensions.map((d) => d.column).join(', ')}.`);

    // Top performers
    if (olap.primaryMeasure && olap.primaryDimension) {
      const top = olap.olap.topN[`${olap.primaryMeasure}__${olap.primaryDimension}__sum`];
      if (top && top.length > 0) {
        const topList = top.slice(0, 3).map((t) => `${t.value} (${t.share}%)`).join(', ');
        contextLines.push(`Top ${olap.primaryDimension}s by ${olap.primaryMeasure}: ${topList}.`);
      }
      const pareto = olap.olap.paretos[`${olap.primaryMeasure}__${olap.primaryDimension}`];
      if (pareto) {
        contextLines.push(`Pareto: top ${pareto.paretoCount} ${olap.primaryDimension}s drive ${pareto.cumulativeAt80.toFixed(1)}% of ${olap.primaryMeasure}.`);
      }
    }

    // Time trend
    if (olap.primaryMeasure && olap.primaryTimeDimension) {
      const pop = olap.olap.periodOverPeriod[`${olap.primaryMeasure}__${olap.primaryTimeDimension}__month`];
      if (pop && pop.length >= 2) {
        const last = pop[pop.length - 1];
        const first = pop[0];
        const totalGrowth = first.value !== 0 ? +(((last.value - first.value) / Math.abs(first.value)) * 100).toFixed(2) : null;
        contextLines.push(`Time trend: ${olap.primaryMeasure} from ${first.period} (${first.value}) to ${last.period} (${last.value}), ${totalGrowth !== null ? (totalGrowth >= 0 ? '+' : '') + totalGrowth + '%' : 'N/A'} growth.`);
      }
    }

    // Anomalies
    if (olap.olap.anomalyCount > 0) {
      contextLines.push(`Anomalies: ${olap.olap.anomalyCount} statistical outliers detected.`);
    }
  }

  contextLines.push('Example existing questions (do not repeat these — generate different ones):');
  existing.slice(0, 4).forEach((q) => contextLines.push(`- ${q}`));

  const userPrompt = `Based on this context, suggest 5 specific, varied questions a senior business / Power BI analyst would ask. Be concrete — reference real column names, top performers, time periods, or entities. Mix top-N, trends, comparisons, Pareto, decomposition, anomalies, and forecasts.\n\n${contextLines.join('\n')}`;

  try {
    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: SUGGESTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 500,
    });
    const lines = content
      .split('\n')
      .map((l) => l.replace(/^[\d.•\-\*\s]+/, '').replace(/^["']|["']$/g, '').trim())
      .filter((l) => l.length > 5 && l.length < 200 && l.endsWith('?'));
    return dedupe(lines).slice(0, 5);
  } catch (e) {
    return [];
  }
}
