// // ─────────────────────────────────────────────────────────────────────────
// // InsightIQ — intelligence provider configuration
// //
// // The application talks to generation providers with automatic failover.
// // Each provider speaks the OpenAI-compatible chat-completions dialect.
// // Provider names exist ONLY here and in .env variable names — never in
// // the user-facing UI.
// // ─────────────────────────────────────────────────────────────────────────

// const env = import.meta.env || {};

// export const PROVIDERS = {
//   // Primary: OpenRouter (verified working from this build environment).
//   primary: {
//     id: 'primary',
//     label: 'Primary Engine',
//     baseURL: 'https://openrouter.ai/api/v1',
//     key: env.VITE_OPENROUTER_API_KEY || '',
//     // Ordered list of models to try. Mix of paid (cheap) and free tiers.
//     // The first model that succeeds is used; subsequent ones are fallbacks.
//     models: [
//       env.VITE_OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
//       'openai/gpt-oss-20b:free',
//       'google/gemma-4-26b-a4b-it:free',
//       'nvidia/nemotron-3-super-120b-a12b:free',
//       'openai/gpt-oss-120b:free',
//       'z-ai/glm-5.2:free',
//       'meta-llama/llama-3.3-70b-instruct:free',
//     ],
//     headers: (key) => ({
//       'Content-Type': 'application/json',
//       Authorization: `Bearer ${key}`,
//       'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://insightiq.app',
//       'X-Title': 'InsightIQ',
//     }),
//   },
//   // Secondary: Groq (very fast when reachable; may be geo-restricted).
//   secondary: {
//     id: 'secondary',
//     label: 'Secondary Engine',
//     baseURL: 'https://api.groq.com/openai/v1',
//     key: env.VITE_GROQ_API_KEY || '',
//     models: [
//       env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b',
//       'llama-3.3-70b-versatile',
//       'llama-3.1-8b-instant',
//     ],
//     headers: (key) => ({
//       'Content-Type': 'application/json',
//       Authorization: `Bearer ${key}`,
//     }),
//   },
// };

// // Order of preference for failover. Walk this list; on each provider, try
// // every model in order. Stop at the first success.
// export const FAILOVER_ORDER = ['primary', 'secondary'];

// // localStorage key for runtime-entered credentials (Settings modal).
// const LS_KEY = 'insightiq.keys';

// export function getEffectiveKeys() {
//   let stored = {};
//   try {
//     stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
//   } catch {
//     stored = {};
//   }
//   return {
//     primary: stored.primary || PROVIDERS.primary.key,
//     secondary: stored.secondary || PROVIDERS.secondary.key,
//   };
// }

// export function setStoredKey(providerId, value) {
//   let stored = {};
//   try {
//     stored = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
//   } catch {
//     stored = {};
//   }
//   stored[providerId] = value;
//   localStorage.setItem(LS_KEY, JSON.stringify(stored));
// }

// export function hasAnyKey() {
//   const k = getEffectiveKeys();
//   return Boolean(k.primary || k.secondary);
// }


// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — intelligence provider configuration
//
// The application talks to generation providers with automatic failover.
// Each provider speaks the OpenAI-compatible chat-completions dialect.
// Provider names exist ONLY here and in .env variable names — never in
// the user-facing UI.
//
// ADDED: Groq now has TWO independent API keys. Rather than restructure
// client.js's failover loop (which iterates provider.models, not keys),
// each Groq key is registered as its OWN provider entry — 'secondary' and
// 'secondaryB' — both pointing at the same baseURL and model list. This
// reuses 100% of the existing failover logic in client.js untouched: if
// every model on Groq key #1 fails (rate limit, key issue, etc.),
// FAILOVER_ORDER simply moves on to Groq key #2 next, then to whatever
// comes after. No changes to client.js are required.
// ─────────────────────────────────────────────────────────────────────────

const env = import.meta.env || {};

const GROQ_MODELS = [
  env.VITE_GROQ_MODEL || 'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
];

const groqHeaders = (key) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${key}`,
});

export const PROVIDERS = {
  // Primary: OpenRouter (verified working from this build environment).
  primary: {
    id: 'primary',
    label: 'Primary Engine',
    baseURL: 'https://openrouter.ai/api/v1',
    key: env.VITE_OPENROUTER_API_KEY || '',
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
  // Secondary: Groq, key #1 (very fast when reachable; may be geo-restricted
  // or rate-limited on a single key — that's what key #2 below is for).
  secondary: {
    id: 'secondary',
    label: 'Secondary Engine',
    baseURL: 'https://api.groq.com/openai/v1',
    key: env.VITE_GROQ_API_KEY || '',
    models: GROQ_MODELS,
    headers: groqHeaders,
  },
  // Secondary: Groq, key #2 — same models, same base URL, different key.
  // Only used if every model on key #1 fails. Lets you spread usage across
  // two Groq accounts/keys without touching client.js's failover logic.
  secondaryB: {
    id: 'secondaryB',
    label: 'Secondary Engine (backup key)',
    baseURL: 'https://api.groq.com/openai/v1',
    key: env.VITE_GROQ_API_KEY_2 || '',
    models: GROQ_MODELS,
    headers: groqHeaders,
  },
};

// Order of preference for failover. Walk this list; on each provider, try
// every model in order. Stop at the first success.
// OpenRouter first, then Groq key #1, then Groq key #2.
export const FAILOVER_ORDER = ['primary', 'secondary', 'secondaryB'];

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
    secondaryB: stored.secondaryB || PROVIDERS.secondaryB.key,
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
  return Boolean(k.primary || k.secondary || k.secondaryB);
}