// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — intelligence provider configuration
//
// The application talks to generation providers with automatic failover.
// Each provider speaks the OpenAI-compatible chat-completions dialect.
// Provider names exist ONLY here and in .env variable names — never in
// the user-facing UI.
// ─────────────────────────────────────────────────────────────────────────

const env = import.meta.env || {};

export const PROVIDERS = {
  // Primary: OpenRouter (verified working from this build environment).
  primary: {
    id: 'primary',
    label: 'Primary Engine',
    baseURL: 'https://openrouter.ai/api/v1',
    key: env.VITE_OPENROUTER_API_KEY || '',
    // Ordered list of models to try. Mix of paid (cheap) and free tiers.
    // The first model that succeeds is used; subsequent ones are fallbacks.
    models: [
      env.VITE_OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
      'openai/gpt-oss-20b:free',
      'google/gemma-4-26b-a4b-it:free',
      'nvidia/nemotron-3-super-120b-a12b:free',
      'openai/gpt-oss-120b:free',
      'z-ai/glm-5.2:free',
      'meta-llama/llama-3.3-70b-instruct:free',
    ],
    headers: (key) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://insightiq.app',
      'X-Title': 'InsightIQ',
    }),
  },
  // Secondary: Groq (very fast when reachable; may be geo-restricted).
  secondary: {
    id: 'secondary',
    label: 'Secondary Engine',
    baseURL: 'https://api.groq.com/openai/v1',
    key: env.VITE_GROQ_API_KEY || '',
    models: [
      env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b',
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
    ],
    headers: (key) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    }),
  },
};

// Order of preference for failover. Walk this list; on each provider, try
// every model in order. Stop at the first success.
export const FAILOVER_ORDER = ['primary', 'secondary'];

// localStorage key for runtime-entered credentials (Settings modal).
const LS_KEY = 'insightiq.keys';

export function getEffectiveKeys() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    stored = {};
  }
  return {
    primary: stored.primary || PROVIDERS.primary.key,
    secondary: stored.secondary || PROVIDERS.secondary.key,
  };
}

export function setStoredKey(providerId, value) {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    stored = {};
  }
  stored[providerId] = value;
  localStorage.setItem(LS_KEY, JSON.stringify(stored));
}

export function hasAnyKey() {
  const k = getEffectiveKeys();
  return Boolean(k.primary || k.secondary);
}
