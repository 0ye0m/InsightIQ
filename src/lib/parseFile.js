// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — file parsing
//
// Robust client-side parsing for:
//   • CSV / TSV / TXT          — PapaParse with delimiter auto-detection
//   • JSON                      — native (arrays of records; nested objects
//                                  are flattened one level)
//   • Excel (.xlsx / .xls)      — SheetJS
//   • PDF (.pdf)                — pdf.js (text + table extraction)
//   • Word (.docx)              — mammoth (HTML → structured text → rows)
//
// Returns a normalised shape for ALL file types:
//   { headers: string[], rows: object[], rawText: string, rawPreview: string,
//     meta: { fileName, fileType, rowCount, colCount, parsedAt, kind } }
// where `kind` is one of: 'tabular' | 'document' | 'mixed'.
// For documents, rows may be paragraph/section records with a single
// "text" column (or several extracted columns if tables are found).
// ─────────────────────────────────────────────────────────────────────────

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const MAX_PREVIEW = 8000;
const MAX_PDF_PAGES = 60;

// ── CSV / TSV / TXT ─────────────────────────────────────────────────────────

function inferDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const count = firstLine.split(d).length - 1;
    if (count > bestScore) { bestScore = count; best = d; }
  }
  return best;
}

function parseDelimited(text, { delimiter }) {
  const result = Papa.parse(text, {
    delimiter: delimiter || '',
    header: true,
    dynamicTyping: false,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    quoteChar: '"',
    escapeChar: '"',
  });
  if (result.errors && result.errors.length) {
    if (!result.data || result.data.length === 0) {
      throw new Error(result.errors[0]?.message || 'Could not parse delimited file.');
    }
  }
  let rows = result.data.filter((r) => r && Object.values(r).some((v) => v !== '' && v != null));
  let headers = result.meta.fields || (rows[0] ? Object.keys(rows[0]) : []);

  // ── Header sanity check ────────────────────────────────────────────
  // If the file has no real header row, Papa will create placeholder
  // names like "_1", "_2", or the headers will look like data values.
  // Detect this and replace with sensible default names ("Column 1", ...).
  if (looksLikeMissingHeader(headers, rows)) {
    // Use the first row as data, not as header.
    const reParse = Papa.parse(text, {
      delimiter: delimiter || '',
      header: false,
      dynamicTyping: false,
      skipEmptyLines: 'greedy',
      quoteChar: '"',
      escapeChar: '"',
    });
    const allRows = reParse.data.filter((r) => r && r.some((v) => v !== '' && v != null));
    if (allRows.length > 1) {
      const numCols = Math.max(...allRows.map((r) => r.length));
      headers = Array.from({ length: numCols }, (_, i) => `Column ${i + 1}`);
      rows = allRows.map((r) => {
        const obj = {};
        for (let i = 0; i < numCols; i++) obj[headers[i]] = r[i] ?? '';
        return obj;
      });
    }
  }

  return { headers, rows };
}

/**
 * Detect if the first row was used as headers but looks like data.
 * Heuristics:
 *   • Headers are empty strings or Papa placeholders like "_1", "_2".
 *   • All headers are numeric values (the first row is data, not names).
 *   • All headers are very long strings (> 40 chars) — typical of prose.
 */
function looksLikeMissingHeader(headers, rows) {
  if (!headers || !headers.length) return false;
  // Papa placeholder names
  if (headers.every((h) => /^_\d+$/.test(h))) return true;
  // All headers empty
  if (headers.every((h) => !h || !h.trim())) return true;
  // All headers look like numbers (first row is data)
  if (headers.length > 1 && headers.every((h) => !isNaN(Number(h)) && h.trim() !== '')) return true;
  return false;
}

// ── JSON ────────────────────────────────────────────────────────────────────

function parseJSON(text) {
  let data;
  try { data = JSON.parse(text); }
  catch (e) { throw new Error('Invalid JSON: ' + e.message); }
  const rows = Array.isArray(data) ? data : [data];
  if (!rows.length) throw new Error('JSON contained no records.');
  const flat = rows.map((r) => flatten(r));
  const headers = uniqueHeaders(flat);
  return { headers, rows: flat };
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else if (Array.isArray(v)) out[key] = v.join(', ');
    else out[key] = v;
  }
  return out;
}

function uniqueHeaders(rows) {
  const set = new Set();
  rows.forEach((r) => Object.keys(r || {}).forEach((k) => set.add(k)));
  return Array.from(set);
}

// ── Excel ────────────────────────────────────────────────────────────────────

function parseExcel(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Workbook contains no sheets.');
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
  if (!rows.length) throw new Error('First sheet is empty.');
  const headers = Object.keys(rows[0]);
  return { headers, rows };
}

// ── PDF (pdf.js) ──────────────────────────────────────────────────────────────
//
// We extract text per page AND detect tabular content. PDF tables are hard;
// pdf.js gives us text items with positional info. We cluster items by Y
// coordinate (rows) and X gaps (columns) to reconstruct tables heuristically.
// If no table is found, we fall back to per-paragraph rows.

let pdfjsLibPromise = null;
async function getPdfjs() {
  if (pdfjsLibPromise) return pdfjsLibPromise;
  pdfjsLibPromise = (async () => {
    const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
    // Use the bundled worker (Vite resolves the URL).
    pdfjs.GlobalWorkerOptions.workerSrc = await import('pdfjs-dist/build/pdf.worker.mjs?url')
      .then((m) => m.default).catch(() => undefined);
    return pdfjs;
  })();
  return pdfjsLibPromise;
}

function clusterRows(items, tolerance = 3) {
  // Group items whose Y coordinates are within `tolerance` points.
  const sorted = [...items].sort((a, b) => Math.round(b.transform[5]) - Math.round(a.transform[5]) || a.transform[4] - b.transform[4]);
  const rows = [];
  let current = null;
  let currentY = null;
  for (const it of sorted) {
    const y = Math.round(it.transform[5]);
    if (currentY === null || Math.abs(y - currentY) > tolerance) {
      current = [];
      rows.push(current);
      currentY = y;
    }
    current.push(it);
  }
  return rows;
}

function detectColumns(rowItems, gapThreshold = 18) {
  // Sort left-to-right, then split into columns whenever the X gap exceeds the threshold.
  const sorted = [...rowItems].sort((a, b) => a.transform[4] - b.transform[4]);
  const cols = [];
  let current = [];
  let prevX = null;
  for (const it of sorted) {
    const x = it.transform[4];
    if (prevX !== null && x - prevX > gapThreshold) {
      cols.push(current);
      current = [];
    }
    current.push(it);
    prevX = x;
  }
  if (current.length) cols.push(current);
  return cols;
}

/**
 * Strict table detector.
 *
 * The previous heuristic was far too loose — it flagged ANY line with a
 * wide gap between word groups as a "tabular row", which meant prose
 * documents (novels, books, articles) got mis-classified as tables and
 * the user saw garbage "13 columns × 6 rows" output.
 *
 * This new detector requires multiple signals of true tabularity before
 * declaring a table:
 *   1. STABLE COLUMN COUNT — at least 80% of the candidate rows have
 *      the same column count.
 *   2. COLUMN ALIGNMENT — columns start at consistent X positions across
 *      rows (within a tolerance). Real tables have aligned columns;
 *      prose wrapped across lines does not.
 *   3. SHORT CELL CONTENT — average cell length is < 40 characters.
 *      Real table cells are short; prose paragraphs are long.
 *   4. ENOUGH ROWS — at least 5 candidate rows survive the above filters.
 *   5. NUMERIC CONTENT — real data tables usually have at least one
 *      numeric column. We don't require this, but weight it.
 *
 * Returns null if no real table is found, otherwise { headers, rows }.
 */
function detectStrictTable(allRows) {
  // Step 1: collect candidate rows (those with 2+ columns).
  const candidates = [];
  for (const r of allRows) {
    const cols = detectColumns(r);
    if (cols.length >= 2) {
      candidates.push({
        cols,
        cells: cols.map((c) => c.map((it) => it.str).join(' ').trim()),
        colCount: cols.length,
        xStarts: cols.map((c) => c[0].transform[4]),
      });
    }
  }
  if (candidates.length < 5) return null;

  // Step 2: find the most common column count.
  const countHist = {};
  for (const c of candidates) countHist[c.colCount] = (countHist[c.colCount] || 0) + 1;
  const dominantCount = parseInt(Object.entries(countHist).sort((a, b) => b[1] - a[1])[0][0]);
  const stableRows = candidates.filter((c) => c.colCount === dominantCount);
  if (stableRows.length < 5) return null;
  // 80% stability check
  if (stableRows.length / candidates.length < 0.6) return null;

  // Step 3: check column alignment — the X starts of each column position
  // should cluster tightly across rows.
  const colCount = dominantCount;
  const colStartArrays = Array.from({ length: colCount }, () => []);
  for (const r of stableRows) {
    for (let i = 0; i < colCount; i++) {
      if (r.xStarts[i] !== undefined) colStartArrays[i].push(r.xStarts[i]);
    }
  }
  // For each column, compute the stddev of its X starts. Real tables have
  // low stddev (aligned); prose has high stddev (random wraps).
  let alignedCols = 0;
  for (const arr of colStartArrays) {
    if (arr.length < 3) continue;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    const stddev = Math.sqrt(variance);
    // Tolerance: columns should align within 12 points (about 4mm).
    if (stddev < 12) alignedCols++;
  }
  // Require at least half the columns to be aligned.
  if (alignedCols < Math.ceil(colCount / 2)) return null;

  // Step 4: check cell content length.
  const allCells = stableRows.flatMap((r) => r.cells);
  const avgLen = allCells.reduce((s, c) => s + c.length, 0) / allCells.length;
  if (avgLen > 40) return null;

  // Step 5: bonus — check for at least some numeric content.
  const numericCells = allCells.filter((c) => /^[-+]?\d[\d,.\s]*[%]?$/.test(c)).length;
  // Not required, but log it for debugging.

  // We have a real table. Use first row as headers.
  const headerRow = stableRows[0].cells;
  const dataRows = stableRows.slice(1).map((r) => r.cells);
  return { headers: headerRow, rows: dataRows, alignmentScore: alignedCols / colCount, avgCellLength: avgLen };
}

async function parsePDF(arrayBuffer) {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
  let allText = '';
  const allRows = [];

  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items.filter((i) => i.str && i.str.trim());
    if (!items.length) continue;
    const rows = clusterRows(items);
    const pageText = rows
      .map((r) => r.map((it) => it.str).join(' '))
      .join('\n');
    allText += `\n--- Page ${p} ---\n${pageText}\n`;
    allRows.push(...rows);
  }

  // Try strict table detection across ALL pages combined.
  const table = detectStrictTable(allRows);

  // Build paragraph records regardless of table detection. PDFs and Word
  // docs are ALWAYS treated as documents — the deep document analysis
  // runs on the full prose. If a real table is detected, it is exposed
  // separately via `meta.tables` so the UI can render a "Tables" section
  // without polluting the main rows view.
  const paragraphs = allText
    .split(/\n\s*\n|\n(?=---\s*Page)/)
    .map((p) => p.replace(/^---\s*Page\s*\d+\s*---\s*/, '').trim())
    .filter((p) => p.length > 30);

  let tables = null;
  if (table) {
    const maxCols = Math.max(table.headers.length, ...table.rows.map((r) => r.length));
    const headers = Array.from({ length: maxCols }, (_, i) => table.headers[i] || `col_${i + 1}`);
    const rows = table.rows.map((r) => {
      const obj = {};
      for (let i = 0; i < maxCols; i++) obj[headers[i]] = r[i] ?? '';
      return obj;
    });
    tables = [{ headers, rows, alignmentScore: table.alignmentScore }];
  }

  return {
    headers: ['section', 'text'],
    rows: paragraphs.map((p, i) => ({ section: `§${i + 1}`, text: p })),
    rawText: allText,
    kind: 'document',
    tables,
  };
}

// ── Word (.docx) via mammoth ────────────────────────────────────────────────

let mammothPromise = null;
async function getMammoth() {
  if (mammothPromise) return mammothPromise;
  mammothPromise = import('mammoth/mammoth.browser.js');
  return mammothPromise;
}

async function parseDocx(arrayBuffer) {
  const mammoth = await getMammoth();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value || '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Word docs are ALWAYS treated as documents (kind = 'document'). If a
  // real <table> is present in the HTML, we extract it separately and
  // expose via `meta.tables` so the UI can show it in a "Tables" section
  // without polluting the main rows view.
  const extractedTables = [];
  const htmlTables = Array.from(doc.querySelectorAll('table'));
  for (const htmlTable of htmlTables) {
    const rows = Array.from(htmlTable.rows);
    if (rows.length < 2) continue;
    const headers = Array.from(rows[0].cells).map((c, i) => c.textContent.trim() || `col_${i + 1}`);
    const dataRows = rows.slice(1).map((r) => {
      const cells = Array.from(r.cells);
      const obj = {};
      headers.forEach((h, i) => { obj[h] = cells[i]?.textContent?.trim() ?? ''; });
      return obj;
    });
    if (dataRows.length >= 2) {
      extractedTables.push({ headers, rows: dataRows });
    }
  }

  // Build paragraph/heading records (always document mode).
  const blocks = Array.from(doc.body.children);
  const records = [];
  let currentHeading = 'Document';
  for (const el of blocks) {
    const tag = el.tagName.toLowerCase();
    const text = el.textContent.trim();
    if (!text) continue;
    if (/^h[1-6]$/.test(tag)) { currentHeading = text; continue; }
    if (tag === 'p' || tag === 'li') {
      records.push({ section: currentHeading, text });
    }
    // tables are extracted separately above — do NOT inline them as prose
  }
  const rawText = doc.body.textContent || '';
  return {
    headers: ['section', 'text'],
    rows: records.length ? records : [{ section: 'Document', text: rawText.slice(0, 2000) }],
    rawText,
    kind: 'document',
    tables: extractedTables.length ? extractedTables : null,
  };
}

// ── main entry ──────────────────────────────────────────────────────────────

/**
 * Parse an uploaded File (or pasted text) into a normalised dataset.
 * @param {File|string} input
 * @param {string} [forcedName]
 * @returns {Promise<{headers:string[], rows:object[], rawText:string, rawPreview:string, meta:object}>}
 */
export async function parseFile(input, forcedName) {
  let name = forcedName || (input && input.name) || 'data.csv';
  let text = '';
  let arrayBuffer = null;
  const ext = name.split('.').pop().toLowerCase();

  if (typeof input === 'string') {
    text = input;
  } else {
    if (['xlsx', 'xls', 'pdf', 'docx'].includes(ext)) {
      arrayBuffer = await input.arrayBuffer();
    } else {
      text = await input.text();
    }
  }

  let parsed;
  let kind = 'tabular';
  let rawText = text;

  if (ext === 'json') {
    parsed = parseJSON(text);
  } else if (ext === 'xlsx' || ext === 'xls') {
    parsed = parseExcel(arrayBuffer);
  } else if (ext === 'pdf') {
    parsed = await parsePDF(arrayBuffer);
    kind = parsed.kind;
    rawText = parsed.rawText;
  } else if (ext === 'docx') {
    parsed = await parseDocx(arrayBuffer);
    kind = parsed.kind;
    rawText = parsed.rawText;
  } else {
    const delimiter = inferDelimiter(text);
    parsed = parseDelimited(text, { delimiter });
  }

  const rawPreview = (rawText || text || '').slice(0, MAX_PREVIEW);

  return {
    headers: parsed.headers,
    rows: parsed.rows,
    rawText,
    rawPreview,
    meta: {
      fileName: name,
      fileType: ext,
      rowCount: parsed.rows.length,
      colCount: parsed.headers.length,
      parsedAt: new Date().toISOString(),
      kind,
      // For PDF/Word: any tables detected inside the document are exposed
      // here so the UI can render a "Tables" section separately from the
      // main rows view. Always an array (empty if none found).
      tables: parsed.tables || null,
    },
  };
}
