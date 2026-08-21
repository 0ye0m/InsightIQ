// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — unified generation client
//
// A single chat-completion function that walks the failover chain
// (primary -> secondary). Each provider speaks the OpenAI-compatible
// chat-completions dialect, so we just swap the base URL, headers, and
// model list. Errors and rate limits automatically trigger the next
// provider in the chain.
//
// The caller never sees provider names — they are internal config kept
// in src/config/providers.js + .env variable names only.
// ─────────────────────────────────────────────────────────────────────────

import { PROVIDERS, FAILOVER_ORDER, getEffectiveKeys } from '../config/providers.js';

const TIMEOUT_MS = 45_000;

async function callProvider(provider, key, { messages, model, temperature = 0.4, maxTokens = 2048, signal }) {
  const url = `${provider.baseURL}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: provider.headers(key),
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = JSON.parse(errText);
      if (j.error?.message) msg = j.error.message;
    } catch {
      if (errText) msg = errText.slice(0, 200);
    }
    const e = new Error(`[${provider.id}] ${msg}`);
    e.status = res.status;
    e.provider = provider.id;
    throw e;
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    const e = new Error(`[${provider.id}] empty response`);
    e.provider = provider.id;
    throw e;
  }
  return { content, model: data.model || model, provider: provider.id };
}

/**
 * Try every provider in failover order, then every model on each provider.
 * Returns the first successful response.
 */
export async function chatCompletion({ messages, temperature = 0.4, maxTokens = 2048, signal }) {
  const keys = getEffectiveKeys();
  const errors = [];

  for (const providerId of FAILOVER_ORDER) {
    const provider = PROVIDERS[providerId];
    const key = keys[providerId];
    if (!key) {
      errors.push(`${provider.id}: no key configured`);
      continue;
    }
    for (const model of provider.models) {
      try {
        const result = await callProvider(provider, key, {
          messages, model, temperature, maxTokens, signal,
        });
        return result;
      } catch (e) {
        errors.push(`${provider.id}/${model}: ${e.message}`);
        if (signal?.aborted) {
          const ab = new Error('Request cancelled');
          ab.cancelled = true;
          throw ab;
        }
        // 4xx (auth/bad request) → skip to next provider; 5xx/rate-limit → try next model first
        if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429) {
          break; // try next provider, this key/model combo won't work
        }
        // otherwise continue to next model
      }
    }
  }

  const err = new Error(
    'All generation engines are unavailable. Check your keys in Settings. Details:\n' +
      errors.join('\n')
  );
  err.allFailed = true;
  err.details = errors;
  throw err;
}

/** Convenience: single-turn completion. */
export async function complete(prompt, { system, temperature = 0.4, maxTokens = 2048, signal } = {}) {
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  return chatCompletion({ messages, temperature, maxTokens, signal });
}

/** Light timeout wrapper. */
export function withTimeout(promiseOrFn, ms = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const p = typeof promiseOrFn === 'function' ? promiseOrFn(controller.signal) : promiseOrFn;
  return p.finally(() => clearTimeout(timer));
}
