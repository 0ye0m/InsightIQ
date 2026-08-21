// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — RAG-grounded chat (hardened against hallucination)
//
// The user reported "false results" — the generation engine was inventing
// numbers despite the "answer only from context" instruction. This version
// adds much stronger guardrails:
//
//   1. EXPLICIT SOURCE QUOTING — every numeric claim must cite its source
//      label [N] from the context block.
//   2. NO APPROXIMATIONS — if the context says "sales = 1,234.56", the
//      answer must say "1,234.56", not "approximately 1,200" or "around
//      1.2k".
//   3. NO INFERENCE — the engine may not derive new aggregates (sums,
//      averages, growth rates) that aren't already in the context.
//   4. REFUSE-IF-ABSENT — if the answer isn't in the context, say so
//      plainly instead of guessing.
//   5. LOW TEMPERATURE — 0.1 instead of 0.3 for maximum determinism.
// ─────────────────────────────────────────────────────────────────────────

import { chatCompletion } from './client.js';

const SYSTEM_PROMPT = `You are the InsightIQ assistant. You answer the user's question about a dataset using ONLY the retrieved context provided below.

ABSOLUTE RULES (violations produce false answers — never break these):

1. SOURCE EVERY NUMBER. Every numeric or factual claim in your answer MUST come verbatim from the <context> block. Before writing any number, find it in the context and cite its source label like [1] or [2].

2. NO ROUNDING, NO APPROXIMATION. If the context says "sales = 1,234.56", write exactly "1,234.56". Never write "approximately 1,200", "around 1.2k", "roughly 1,235", or any paraphrase that changes the digits.

3. NO DERIVED AGGREGATES. You may NOT compute new sums, averages, counts, growth rates, or correlations that are not already stated in the context. If the user asks "what is the total of X by Y" and the context does not contain that exact aggregate, say: "I couldn't find that aggregate in the indexed analysis. Try asking 'What are the top Ys by X?' instead — that is pre-computed."

4. NO INVENTED COLUMN NAMES. Only use column names that appear in the context block. If the user mentions a column that is not in the context, say so.

5. REFUSE WHEN UNSURE. If you cannot find the exact answer in the context, say: "I couldn't find that in the current dataset." Do not guess, do not extrapolate, do not "fill in".

6. CONCISE. 1–4 sentences for factual questions. Longer only when the user explicitly asks for detail.

7. NO META-TALK. Do not mention how you work, the engine, models, prompts, retrieval, or that you are automated. The user sees only your prose.

8. PLAIN TEXT. No markdown headers. Bullet points OK when listing multiple items. Citations [1], [2] OK.

The context block below contains labelled snippets [1], [2], [3]... Each is a fact derived from the actual dataset. Treat them as the ONLY source of truth.`;

export async function generateAnswer(question, contextBlock, retrieved, history, { onToken } = {}) {
  const historyBlock = (history || [])
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
    .join('\n');

  const userPrompt = `User question: ${question}

<context>
${contextBlock}
</context>

${historyBlock ? `Prior conversation:\n${historyBlock}\n` : ''}Answer the user's question using ONLY the context above. Every number you cite must appear verbatim in the context, with its source label like [1]. If the answer is not in the context, say "I couldn't find that in the current dataset." Do not compute new aggregates. Do not approximate. Do not guess.`;

  try {
    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,  // very deterministic
      maxTokens: 600,
    });
    return content.trim();
  } catch (e) {
    // Deterministic fallback: return the top retrieved chunk verbatim.
    if (retrieved && retrieved.length) {
      return `Based on the indexed analysis:\n\n${retrieved[0].text}\n\n(Source: ${retrieved[0].meta?.source || 'retrieved context'})`;
    }
    return 'I couldn\'t reach the generation engine right now. Please check your keys in Settings and try again.';
  }
}
