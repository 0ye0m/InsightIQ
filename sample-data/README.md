# InsightIQ — Sample Data Suite

42 test files covering every type of data InsightIQ should handle.
Drop any of these into InsightIQ's upload zone to see how the pipeline
handles each shape.

## Test results

**40 / 42 files passed** the full deterministic pipeline (parse → clean →
stats → quality → insights → charts → RAG index). The remaining 2
(business_report.pdf + annual_report.docx) also work — they were marked
"FAIL" in the Node test runner only because Node doesn't have the browser
APIs (DOMParser / DOMMatrix) the PDF and Word parsers use. Verified working
in the actual browser.

---

## 01 — Clean structured (5 files)

Well-behaved tabular data. Each has consistent types, no nulls, clean
headers, and a clear schema. The baseline "happy path".

| File | Rows | Cols | Notes |
|------|------|------|-------|
| `ecommerce_sales.csv` | 180 | 10 | Time series with categories, returns, channels |
| `employees.csv` | 80 | 11 | Mixed types: ids, names, emails, dates, booleans |
| `financial_transactions.csv` | 120 | 8 | Income / expense / asset / liability accounts |
| `iot_sensors.csv` | 500 | 7 | Dense time series, 4 sensors, status enum |
| `student_grades.csv` | 60 | 9 | Computed column (passed = final_score >= 50) |

**Expected behavior:** quality score 91–95, full type inference (date /
number / category / boolean), correlation matrix populated, all chart
types render.

---

## 02 — Messy / irregular (6 files)

Real-world dirty data. Each file tests a different cleaning challenge.

| File | What it tests |
|------|---------------|
| `sales_messy.csv` | Mixed date formats, currency symbols in `$1,250.50`, null markers (N/A, empty), exact duplicate rows, accounting-style negatives |
| `customers_messy.csv` | Mixed-case emails, international phone formats, Unicode names (María, Müller, François), multiple null tokens (N/A, NULL, empty), inconsistent casing |
| `numbers_messy.csv` | Currency `$`, percent `5%`, accounting negatives `($890.00)`, European decimals `1.234,56` |
| `dates_messy.csv` | 6 different date formats: ISO, US `mm/dd/yyyy`, EU `dd-mm-yyyy`, `Jan 20, 2024`, `2024.07.20`, ISO datetime |
| `booleans_messy.csv` | 10+ boolean variants: yes/no, true/false, 1/0, Y/N, T/F, TRUE/FALSE, mixed case |
| `whitespace_messy.csv` | Leading/trailing whitespace in headers and values, inconsistent casing |

**Expected behavior:** type inference correctly identifies numeric columns
despite currency symbols; date normalisation converts all formats to ISO;
boolean detection handles all variants; deduplication removes the exact
duplicate in `sales_messy.csv`.

---

## 03 — Semi-structured (7 files)

Inconsistent schema, embedded JSON, mixed delimiters.

| File | What it tests |
|------|---------------|
| `ragged_rows.csv` | Rows with different column counts (PapaParse handles gracefully) |
| `embedded_json.csv` | JSON objects embedded in cells (parsed and flattened) |
| `log_format.csv` | Log-style rows with optional/variable fields |
| `key_value_style.csv` | Long-format key-value records (one metric per row) |
| `tab_separated.tsv` | TSV — delimiter auto-detection should pick `\t` |
| `pipe_separated.txt` | Pipe `|` delimiter — auto-detected |
| `semicolon_separated.csv` | European `;` delimiter with `,` decimal — auto-detected |

**Expected behavior:** delimiter auto-detection picks the right one for
each file; ragged rows don't crash; JSON embedded cells get flattened.

---

## 04 — Unstructured (5 files)

Free text with no tabular structure. InsightIQ treats these as documents
and runs the deep document analysis (readability, sentiment, keywords,
entities, topics, key passages).

| File | Words | What it tests |
|------|-------|---------------|
| `business_report.txt` | ~400 | Business prose with $ amounts, %, dates, emails, phones |
| `server_logs.txt` | ~600 | 200 structured log lines — timestamp / level / source / message |
| `survey_responses.txt` | ~700 | 15 customer survey responses with ratings (5/5, 2/5, etc.) |
| `meeting_notes.txt` | ~500 | Meeting notes with action items, dates, names |
| `changelog.txt` | ~600 | Software changelog with version numbers, dates, feature lists |

**Expected behavior:** Each is chunked into paragraphs; keyword TF-IDF
extracts top terms; entity detection finds emails, phones, dates,
currencies, percentages; topic clustering groups paragraphs; sentiment
lexicon scores polarity.

---

## 05 — Edge cases (12 files)

Extreme inputs that test the pipeline's robustness.

| File | What it tests |
|------|---------------|
| `single_row.csv` | Only 1 data row — does stats still work? |
| `single_column.csv` | Only 1 column — no correlation possible |
| `all_null_column.csv` | A column with all empty values |
| `wide_format.csv` | 51 columns × 10 rows — wide layout |
| `high_cardinality.csv` | UUIDs and tokens — identifier detection |
| `sparse_nulls.csv` | Alternating full and empty rows |
| `no_variance.csv` | All values identical — stddev = 0 |
| `extreme_outliers.csv` | Salaries like $125M and -$50K |
| `mixed_types_column.csv` | Numbers and text in the same column |
| `long_text.csv` | Cells with very long text content |
| `duplicate_rows.csv` | Intentional duplicates to test dedup |
| `quoted_fields.csv` | Fields with commas, newlines, and embedded quotes |

**Expected behavior:** No crashes on any of these. The extreme outliers
file should produce 2-3 anomaly detections (salary = $125M, salary =
$999M, salary = -$50K). The wide format should produce a populated
correlation matrix.

---

## 06 — Excel / JSON / PDF / Word (7 files)

Non-CSV formats.

| File | Format | Notes |
|------|--------|-------|
| `products.json` | JSON | Array of 30 records with nested `tags` array |
| `users_nested.json` | JSON | Nested objects (contact.email, contact.address.street, orders[]) |
| `single_record.json` | JSON | Single object, not an array |
| `sales_clean.xlsx` | Excel | Clean single-sheet workbook |
| `multi_sheet.xlsx` | Excel | Workbook with 2 sheets (Summary + Details) |
| `business_report.pdf` | PDF | Business report with embedded table |
| `annual_report.docx` | Word | Word doc with headings, paragraphs, and a table |

**Expected behavior:**
- All JSON shapes parse (array, single record, nested objects flattened)
- Excel reads the first sheet
- PDF: table detected → tabular extraction (6 rows × 13 cols)
- Word: table detected → tabular extraction (4 rows × 4 cols)

When a PDF/Word file has NO detectable table, InsightIQ falls back to
per-paragraph document analysis and the Document tab activates.

---

## How to use

1. Open InsightIQ in your browser
2. Drag any file from this folder into the upload zone (or click "Browse files")
3. Click "Analyze"
4. Explore the 7 tabs (Overview / Charts / Data / Document / Chat / Compare / History)

## Re-running the test suite

```bash
cd /home/z/my-project/scripts
node test_samples.mjs
```

This runs all 42 files through the deterministic pipeline and prints a
status table showing rows / cols / quality / chunks for each.
