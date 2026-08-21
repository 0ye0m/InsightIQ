// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — narrative generation
//
// The deterministic insight module produces the hard facts. This layer
// asks the generation engine to weave those facts into a polished,
// flowing executive narrative WITHOUT inventing new numbers.
//
// The system prompt enforces: "You may only use the numbers we give you."
// ─────────────────────────────────────────────────────────────────────────

import { chatCompletion } from './client.js';

const SYSTEM_PROMPT = `You are the InsightIQ narrative engine. You write crisp, professional analytical prose for business users.

ABSOLUTE RULES (violations produce false narratives — never break these):

1. USE ONLY PROVIDED NUMBERS. Every number, percentage, and column name in your narrative MUST come verbatim from the user message. You may rephrase the surrounding prose, but you may NEVER change the digits, the units, or the comparison direction.

2. NO ROUNDING, NO APPROXIMATION. If the input says "sales = 1,234.56", your narrative must say "1,234.56", not "approximately 1,200", "around 1.2k", "roughly 1,235". Rounding changes meaning.

3. NO NEW DERIVED FACTS. You may NOT compute, infer, or imply any aggregate that is not explicitly stated in the input. If the input says "top 3 = 64.2%", you may not say "the top 5 likely account for around 80%" — that is a guess.

4. PRESERVE COMPARISON DIRECTION. If the input says "grew 18%", do not write "declined" or "remained flat". If it says "high concentration", do not write "well-distributed".

5. NEVER MENTION COLUMNS THAT AREN'T IN THE INPUT. If the user message lists columns A, B, C, your narrative may only mention A, B, or C — never D.

6. SECOND PERSON, ACTIVE VOICE, PRESENT TENSE. Write "Your dataset contains..." not "The dataset was found to contain...".

7. NO HEDGING FILLER. Avoid "it is worth noting that", "in conclusion", "interestingly".

8. NO META-TALK. Never mention how you work, models, automation, prompts, or generation.

9. PLAIN PARAGRAPHS. No markdown headers. 3–5 sentences total.

10. REFUSE IF EMPTY. If the input has no insights to narrate, return: "Insufficient data for a narrative — try uploading a richer dataset."`;

function buildContext(analysis) {
  const { stats, insights, cleaned, meta, quality } = analysis;
  const olap = insights?.olap;
  const classified = insights?.classified;
  const lines = [];
  lines.push(`Dataset: ${meta.fileName}`);
  lines.push(`Rows: ${stats.totalRows}, Columns: ${stats.totalColumns}`);

  // Semantic classification — tell the LLM what's a measure/dimension/time
  if (classified) {
    if (classified.measures.length) {
      lines.push(`Measures (numeric, aggregatable): ${classified.measures.map((m) => m.column).join(', ')}.`);
    }
    if (classified.dimensions.length + classified.geoDimensions.length > 0) {
      lines.push(`Dimensions (categorical, slicable): ${[...classified.dimensions, ...classified.geoDimensions].map((d) => d.column).join(', ')}.`);
    }
    if (classified.timeDimensions.length) {
      lines.push(`Time dimensions: ${classified.timeDimensions.map((t) => t.column).join(', ')}.`);
    }
  }

  lines.push(`Quality score: ${quality.score}/100.`);
  lines.push(`Data health: ${insights?.dataHealth || 'no issues noted'}.`);

  // OLAP facts — the heart of the business narrative
  if (olap) {
    lines.push(``);
    lines.push(`OLAP ANALYSIS (verbatim facts — use these exact numbers in your narrative):`);

    // Top performers
    if (olap.primaryMeasure && olap.primaryDimension) {
      const topKey = `${olap.primaryMeasure}__${olap.primaryDimension}__sum`;
      const top = olap.olap.topN[topKey];
      if (top && top.length > 0) {
        lines.push(`- Top ${olap.primaryDimension}s by ${olap.primaryMeasure}:`);
        for (const t of top.slice(0, 5)) {
          lines.push(`  · "${t.value}": sum=${t.sum}, count=${t.count}, mean=${t.mean}, share=${t.share}%`);
        }
        const top3Share = top.slice(0, 3).reduce((s, x) => s + x.share, 0);
        lines.push(`- Top 3 ${olap.primaryDimension}s combined share = ${top3Share.toFixed(2)}%.`);
      }
    }

    // Pareto
    if (olap.primaryMeasure && olap.primaryDimension) {
      const pareto = olap.olap.paretos[`${olap.primaryMeasure}__${olap.primaryDimension}`];
      if (pareto) {
        lines.push(`- Pareto: top ${pareto.paretoCount} of ${pareto.totalContributors} ${olap.primaryDimension}s (${pareto.concentrationIndex}% of categories) drive ${pareto.cumulativeAt80}% of total ${olap.primaryMeasure}.`);
      }
    }

    // Period-over-period
    if (olap.primaryMeasure && olap.primaryTimeDimension) {
      const popKey = `${olap.primaryMeasure}__${olap.primaryTimeDimension}__month`;
      const pop = olap.olap.periodOverPeriod[popKey];
      if (pop && pop.length >= 2) {
        const last = pop[pop.length - 1];
        const first = pop[0];
        const totalGrowth = first.value !== 0 ? +(((last.value - first.value) / Math.abs(first.value)) * 100).toFixed(2) : null;
        lines.push(`- Time trend: ${olap.primaryMeasure} from ${first.period} (${first.value}) to ${last.period} (${last.value}).`);
        if (totalGrowth !== null) {
          lines.push(`  · Total growth = ${totalGrowth}% (${totalGrowth >= 0 ? 'increase' : 'decrease'}).`);
        }
        if (last.growthPct !== null) {
          lines.push(`  · Most recent MoM change = ${last.growthPct}% (vs previous period ${pop[pop.length - 2].value}).`);
        }
        const peak = pop.reduce((a, b) => b.value > a.value ? b : a);
        const trough = pop.reduce((a, b) => b.value < a.value ? b : a);
        lines.push(`  · Peak period = ${peak.period} (${peak.value}); lowest period = ${trough.period} (${trough.value}).`);
      }
    }

    // Anomalies
    if (olap.olap.anomalyCount > 0) {
      lines.push(`- Statistical anomalies: ${olap.olap.anomalyCount} outlier values detected.`);
      for (const a of olap.olap.anomalies.slice(0, 3)) {
        lines.push(`  · ${a.column}: ${a.count} outliers (${a.severity}), values ${a.range} vs typical ${a.threshold}.`);
      }
    }

    // Pre-built business insights (verbatim — these are already correct)
    if (insights.insights.length) {
      lines.push(``);
      lines.push(`BUSINESS INSIGHTS (verbatim — you may quote these directly):`);
      for (const i of insights.insights) lines.push(`- ${i}`);
    }
  }

  // Correlation facts
  if (stats.strongPairs.length) {
    lines.push(``);
    lines.push(`Correlations:`);
    for (const p of stats.strongPairs.slice(0, 5)) {
      lines.push(`- ${p.a} ↔ ${p.b}: r=${p.r} (${p.strength}).`);
    }
  }

  return lines.join('\n');
}

/**
 * Produce a polished executive narrative grounded in real stats.
 */
export async function generateNarrative(analysis, { signal } = {}) {
  const context = buildContext(analysis);
  const userPrompt = `Here is the deterministic analysis of the dataset. Write a 3–5 sentence executive narrative that a business stakeholder would find immediately useful. Lead with the single most important takeaway.

CRITICAL: Every number in your narrative must appear verbatim in the facts below. Do not round, do not approximate, do not invent. Pick the 3–5 most important facts and weave them into prose.

${context}`;

  try {
    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,  // very deterministic for accuracy
      maxTokens: 600,
      signal,
    });
    return content.trim();
  } catch (e) {
    // Deterministic fallback — we still return something useful.
    return analysis.insights.executiveSummary || analysis.insights.insights.slice(0, 3).join(' ');
  }
}

/**
 * Optional: produce a "deep dive" on a chosen column (grounded).
 */
export async function generateColumnDeepDive(analysis, columnName, { signal } = {}) {
  const context = buildContext(analysis);
  const profile = analysis.cleaned.columnProfiles[columnName];
  const c = analysis.stats.columnStats[columnName];
  if (!profile || !c) {
    return `No profile is available for "${columnName}".`;
  }
  const userPrompt = `Write a focused 2–3 sentence deep-dive on the column "${columnName}" using ONLY the facts below.

Column profile:
- type: ${profile.type}
- ${['number', 'integer'].includes(profile.type)
  ? `mean ${c.mean}, median ${c.median}, std dev ${c.stddev}, min ${c.min}, max ${c.max}, outliers ${c.outliers}`
  : profile.type === 'date'
    ? `range ${c.min} → ${c.max}, span ${c.spanDays} days`
    : `cardinality ${c.cardinality}, top values ${(c.topValues || []).slice(0, 5).map((t) => `${t.value} (${t.count})`).join(', ')}`}
- nulls: ${c.nullCount} (${c.nullPercentage}%)

Full dataset context:
${context}`;
  try {
    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.4,
      maxTokens: 400,
      signal,
    });
    return content.trim();
  } catch {
    return `Column "${columnName}" (${profile.type}) has ${c.nullCount} nulls and ${c.uniqueCount ?? c.cardinality ?? 'several'} distinct values.`;
  }
}
