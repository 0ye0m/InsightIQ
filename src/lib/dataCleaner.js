// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — deterministic data cleaning engine
//
// This module does NOT call any external service. It performs real,
// reproducible cleaning operations on the dataset:
//   • whitespace + case normalisation for headers
//   • type inference per column (number, integer, boolean, date, category,
//     identifier, freeText)
//   • numeric coercion (strip currency symbols, thousands separators,
//     percent signs, convert "1,234.56" → 1234.56)
//   • date normalisation to ISO yyyy-mm-dd where detectable
//   • duplicate-row detection (exact + on a normalised key)
//   • null / empty-cell accounting
//   • light imputation options (mean for numeric, mode for categorical)
//
// Everything it returns is computed from the actual rows — never invented.
// ─────────────────────────────────────────────────────────────────────────

const NULL_TOKENS = new Set(['', 'na', 'n/a', 'null', 'none', '-', '--', 'nil', 'nan', 'undefined']);

// ── helpers ───────────────────────────────────────────────────────────────

function isNullish(value) {
  if (value === null || value === undefined) return true;
  const s = String(value).trim().toLowerCase();
  return NULL_TOKENS.has(s);
}

function normalizeHeader(h) {
  return String(h).trim().replace(/\s+/g, ' ');
}

// Aggressive numeric coercion. Handles currency, thousands separators,
// scientific notation, percentages, and parenthesised negatives (accounting).
const CURRENCY_RE = /[$€£₹¥₩]/g;
const PAREN_NEG = /^\((.*)\)$/;

function coerceNumber(raw) {
  if (raw === null || raw === undefined) return { ok: false, value: null };
  if (typeof raw === 'number') return { ok: !isNaN(raw), value: raw };
  let s = String(raw).trim();
  if (!s) return { ok: false, value: null };
  let negative = false;
  const paren = s.match(PAREN_NEG);
  if (paren) {
    negative = true;
    s = paren[1];
  }
  // strip currency
  s = s.replace(CURRENCY_RE, '');
  // detect percentage
  const isPercent = s.includes('%');
  s = s.replace(/%/g, '');
  // strip thousands separators. We assume the decimal point is '.' and
  // thousands separator is ',' — handle the inverse (1.234,56) too.
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // whichever appears LAST is the decimal separator.
    if (s.lastIndexOf(',') < s.lastIndexOf('.')) {
      s = s.split(',').join('');
    } else {
      s = s.split('.').join('').replace(',', '.');
    }
  } else if (hasComma && /,\d{2}$/.test(s)) {
    // "1234,56" → "1234.56"
    s = s.replace(',', '.');
  } else if (hasComma) {
    s = s.split(',').join('');
  }
  s = s.trim();
  const n = Number(s);
  if (isNaN(n)) return { ok: false, value: null };
  let result = n;
  if (negative) result = -Math.abs(result);
  if (isPercent) result = result / 100;
  return { ok: true, value: result };
}

const DATE_PATTERNS = [
  // ISO-ish
  { re: /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/, fmt: (m) => `${m[1]}-${pad(m[2])}-${pad(m[3])}` },
  // dd/mm/yyyy or dd-mm-yyyy
  { re: /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/, fmt: (m) => `${m[3]}-${pad(m[2])}-${pad(m[1])}` },
  // mm/dd/yyyy or mm-dd-yyyy
  { re: /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/, fmt: (m, sample) => guessMDY(m, sample) },
  // Month name forms: "Jan 5, 2024" / "5 Jan 2024"
  { re: /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/, fmt: (m) => fromMonthName(m[1], m[2], m[3]) },
  { re: /^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})/, fmt: (m) => fromMonthName(m[2], m[1], m[3]) },
];

function pad(n) { return String(n).padStart(2, '0'); }

function guessMDY(m, _sample) {
  // Heuristic: if first part > 12 it must be a day → dd/mm. Otherwise assume
  // US-style mm/dd. This is imperfect but documented as such.
  const a = Number(m[1]);
  const b = Number(m[2]);
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  if (a > 12) return `${y}-${pad(b)}-${pad(a)}`;
  return `${y}-${pad(a)}-${pad(b)}`;
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  january:1, february:2, march:3, april:4, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };

function fromMonthName(name, day, year) {
  const mo = MONTHS[name.toLowerCase().slice(0, 3)];
  if (!mo) return null;
  const y = year.length === 2 ? `20${year}` : year;
  return `${y}-${pad(mo)}-${pad(day)}`;
}

function coerceDate(raw) {
  if (raw === null || raw === undefined) return { ok: false, value: null };
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    return { ok: true, value: raw.toISOString().slice(0, 10) };
  }
  const s = String(raw).trim();
  if (!s) return { ok: false, value: null };
  for (const p of DATE_PATTERNS) {
    const m = s.match(p.re);
    if (m) {
      const iso = p.fmt(m, s);
      if (iso && !isNaN(Date.parse(iso))) return { ok: true, value: iso };
    }
  }
  return { ok: false, value: null };
}

function coerceBoolean(raw) {
  if (raw === true || raw === false) return { ok: true, value: raw };
  const s = String(raw).trim().toLowerCase();
  if (['true', 'yes', 'y', 't', '1'].includes(s)) return { ok: true, value: true };
  if (['false', 'no', 'n', 'f', '0'].includes(s)) return { ok: true, value: false };
  return { ok: false, value: null };
}

// ── column type inference ──────────────────────────────────────────────────

function inferColumnType(header, values) {
  const nonNull = values.filter((v) => !isNullish(v));
  if (!nonNull.length) {
    return { type: 'empty', confidence: 0 };
  }
  let numeric = 0;
  let integer = 0;
  let booleanish = 0;
  let dateish = 0;
  for (const v of nonNull) {
    if (coerceNumber(v).ok) {
      numeric++;
      if (Number.isInteger(coerceNumber(v).value)) integer++;
    }
    if (coerceBoolean(v).ok) booleanish++;
    if (coerceDate(v).ok) dateish++;
  }
  const n = nonNull.length;
  if (booleanish / n >= 0.9 && n >= 2) return { type: 'boolean', confidence: booleanish / n };
  if (dateish / n >= 0.8) return { type: 'date', confidence: dateish / n };
  if (numeric / n >= 0.85) {
    const isInt = integer === n;
    return { type: isInt ? 'integer' : 'number', confidence: numeric / n };
  }
  const unique = new Set(nonNull.map((v) => String(v).trim().toLowerCase()));
  // Identifier heuristic: high cardinality, all strings, mostly unique.
  if (unique.size >= n * 0.9 && n >= 5 && unique.size <= n) {
    return { type: 'identifier', confidence: 0.7 };
  }
  // Category heuristic: low-ish cardinality relative to n.
  if (unique.size > 1 && unique.size <= Math.max(15, Math.ceil(n * 0.5))) {
    return { type: 'category', confidence: 0.75 };
  }
  return { type: 'text', confidence: 0.5 };
}

// ── duplicate detection ─────────────────────────────────────────────────────

function rowKey(row, headers) {
  return headers
    .map((h) => String(row[h] ?? '').trim().toLowerCase())
    .join('\u0001');
}

// ── main clean entry ─────────────────────────────────────────────────────────

/**
 * Clean a dataset deterministically.
 * @param {object[]} rows
 * @param {string[]} headers
 * @param {object} options { imputeNulls:boolean, dropDuplicates:boolean }
 * @returns {object} cleaning result
 */
export function cleanDataset(rows, headers, options = {}) {
  const { imputeNulls = true, dropDuplicates = true } = options;

  // 1. Normalise headers (trim, collapse spaces). Detect collisions.
  const normHeaders = [];
  const seen = new Map();
  headers.forEach((h, i) => {
    let nh = normalizeHeader(h) || `column_${i + 1}`;
    if (seen.has(nh.toLowerCase())) {
      nh = `${nh}_${i}`;
    }
    seen.set(nh.toLowerCase(), true);
    normHeaders.push(nh);
  });

  // 2. Rename keys in every row to normalised headers.
  let working = rows.map((r) => {
    const o = {};
    headers.forEach((h, i) => {
      o[normHeaders[i]] = r[h];
    });
    return o;
  });

  const cleaningLog = [];

  // 3. Infer per-column types.
  const columnProfiles = {};
  for (const h of normHeaders) {
    const values = working.map((r) => r[h]);
    const { type, confidence } = inferColumnType(h, values);
    columnProfiles[h] = { type, confidence, originalType: typeof values[0] };
  }
  cleaningLog.push({
    action: 'type_inference',
    detail: `${normHeaders.length} columns profiled (${Object.values(columnProfiles).filter((c) => c.type === 'number' || c.type === 'integer').length} numeric, ${Object.values(columnProfiles).filter((c) => c.type === 'date').length} date, ${Object.values(columnProfiles).filter((c) => c.type === 'category').length} categorical).`,
  });

  // 4. Coerce values per column type. Strip whitespace.
  for (const h of normHeaders) {
    const profile = columnProfiles[h];
    for (const row of working) {
      const v = row[h];
      if (isNullish(v)) {
        row[h] = null;
        continue;
      }
      const s = typeof v === 'string' ? v.trim() : v;
      if (profile.type === 'number' || profile.type === 'integer') {
        const { ok, value } = coerceNumber(v);
        row[h] = ok ? value : s;
      } else if (profile.type === 'boolean') {
        const { ok, value } = coerceBoolean(v);
        row[h] = ok ? value : s;
      } else if (profile.type === 'date') {
        const { ok, value } = coerceDate(v);
        row[h] = ok ? value : s;
      } else if (profile.type === 'category' || profile.type === 'identifier' || profile.type === 'text') {
        row[h] = typeof s === 'string' ? s : String(s);
      } else {
        row[h] = s;
      }
    }
  }
  cleaningLog.push({ action: 'value_coercion', detail: 'Numeric, date, and boolean values normalised to native types.' });

  // 5. Null accounting per column.
  const nullCounts = {};
  for (const h of normHeaders) {
    nullCounts[h] = working.filter((r) => r[h] === null || r[h] === undefined || r[h] === '').length;
  }

  // 6. Imputation (optional, conservative).
  if (imputeNulls) {
    let imputed = 0;
    for (const h of normHeaders) {
      const profile = columnProfiles[h];
      const nonNull = working.map((r) => r[h]).filter((v) => v !== null && v !== undefined && v !== '');
      if (!nonNull.length) continue;
      const nullCount = nullCounts[h];
      if (!nullCount) continue;
      if (profile.type === 'number' || profile.type === 'integer') {
        const mean = nonNull.reduce((a, b) => a + b, 0) / nonNull.length;
        working.forEach((r) => {
          if (r[h] === null || r[h] === undefined || r[h] === '') {
            r[h] = Number(mean.toFixed(4));
            imputed++;
          }
        });
      } else if (profile.type === 'category' || profile.type === 'boolean') {
        const mode = modeOf(nonNull);
        working.forEach((r) => {
          if (r[h] === null || r[h] === undefined || r[h] === '') {
            r[h] = mode;
            imputed++;
          }
        });
      }
    }
    if (imputed > 0) {
      cleaningLog.push({ action: 'imputation', detail: `${imputed} missing values imputed (mean for numeric, mode for categorical).` });
    }
  }

  // 7. Duplicate detection.
  let duplicateRows = 0;
  if (dropDuplicates) {
    const seenKeys = new Set();
    const deduped = [];
    for (const r of working) {
      const k = rowKey(r, normHeaders);
      if (seenKeys.has(k)) {
        duplicateRows++;
      } else {
        seenKeys.add(k);
        deduped.push(r);
      }
    }
    if (duplicateRows > 0) {
      cleaningLog.push({ action: 'deduplication', detail: `${duplicateRows} exact duplicate rows removed.` });
    }
    working = deduped;
  } else {
    // Still count duplicates without dropping.
    const seenKeys = new Set();
    for (const r of working) {
      const k = rowKey(r, normHeaders);
      if (seenKeys.has(k)) duplicateRows++;
      else seenKeys.add(k);
    }
  }

  return {
    headers: normHeaders,
    rows: working,
    columnProfiles,
    nullCounts,
    duplicateRows,
    cleaningLog,
    rowsRemoved: rows.length - working.length,
  };
}

function modeOf(arr) {
  const counts = new Map();
  for (const v of arr) {
    const k = typeof v === 'string' ? v.toLowerCase() : String(v);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = arr[0];
  let bestCount = -1;
  for (const [k, c] of counts) {
    if (c > bestCount) {
      bestCount = c;
      best = arr.find((v) => (typeof v === 'string' ? v.toLowerCase() : String(v)) === k);
    }
  }
  return best;
}

export { isNullish, coerceNumber, coerceDate, inferColumnType };
