// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — report export
//
// Exports the cleaned dataset + statistics + insights to:
//   • Excel (.xlsx)  — multi-sheet workbook (Clean Data, Statistics, Insights,
//                       Quality, Correlations)
//   • CSV             — clean data only
//   • JSON            — full analysis bundle
//   • PDF             — printable executive summary (jsPDF + autotable)
// ─────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function safeName(name) {
  return (name || 'insightiq').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_');
}

// ── Excel ──────────────────────────────────────────────────────────────────

export function exportExcel(analysis, fileName) {
  const wb = XLSX.utils.book_new();
  const { cleaned, stats, insights, quality, meta } = analysis;

  // Sheet 1 — Clean Data
  if (cleaned.rows.length) {
    const ws = XLSX.utils.json_to_sheet(cleaned.rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Clean Data');
  }

  // Sheet 2 — Column Statistics
  const colStatsAOA = [['Column', 'Type', 'Count', 'Mean', 'Median', 'Std Dev', 'Min', 'Max', 'Q1', 'Q3', 'Nulls', 'Null %', 'Unique']];
  for (const h of cleaned.headers) {
    const c = stats.columnStats[h] || {};
    colStatsAOA.push([
      h,
      cleaned.columnProfiles[h]?.type || '—',
      c.count ?? '—',
      c.mean ?? '—',
      c.median ?? '—',
      c.stddev ?? '—',
      c.min ?? '—',
      c.max ?? '—',
      c.q1 ?? '—',
      c.q3 ?? '—',
      c.nullCount ?? 0,
      c.nullPercentage ?? 0,
      c.uniqueCount ?? '—',
    ]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(colStatsAOA), 'Statistics');

  // Sheet 3 — Quality breakdown
  const qualityAOA = [['Dimension', 'Weight', 'Value', 'Contribution']];
  for (const b of quality.breakdown) {
    qualityAOA.push([b.dimension, b.weight, b.value, b.contribution]);
  }
  qualityAOA.push([], ['Overall Quality Score', '', '', quality.score]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(qualityAOA), 'Quality');

  // Sheet 4 — Insights & Anomalies
  const insAOA = [['Insights'], ...insights.insights.map((i) => [i]), [], ['Anomalies'], ...insights.anomalies.map((a) => [a]), [], ['Predictions'], ...insights.predictions.map((p) => [p])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(insAOA), 'Insights');

  // Sheet 5 — Correlations (if numeric columns exist)
  if (stats.numericColumns.length >= 2) {
    const corrAOA = [['', ...stats.numericColumns]];
    for (const a of stats.numericColumns) {
      corrAOA.push([a, ...stats.numericColumns.map((b) => stats.correlation[a][b])]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(corrAOA), 'Correlations');
  }

  // Sheet 6 — KPIs
  const kpiAOA = [['KPI', 'Value', 'Trend', 'Context']];
  for (const k of insights.kpis) {
    kpiAOA.push([k.label, k.value, k.trend, k.sub]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kpiAOA), 'KPIs');

  XLSX.writeFile(wb, `insightiq_${safeName(fileName)}.xlsx`);
}

// ── CSV ────────────────────────────────────────────────────────────────────

export function exportCSV(analysis, fileName) {
  const { cleaned } = analysis;
  if (!cleaned.rows.length) return;
  const headers = cleaned.headers;
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const r of cleaned.rows) {
    lines.push(headers.map((h) => escape(r[h])).join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `insightiq_${safeName(fileName)}.csv`);
}

// ── JSON ───────────────────────────────────────────────────────────────────

export function exportJSON(analysis, fileName) {
  const payload = {
    meta: analysis.meta,
    statistics: analysis.stats,
    insights: analysis.insights,
    quality: analysis.quality,
    columnProfiles: analysis.cleaned.columnProfiles,
    cleaningLog: analysis.cleaned.cleaningLog,
    generatedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `insightiq_${safeName(fileName)}_analysis.json`);
}

// ── PDF ─────────────────────────────────────────────────────────────────────

export function exportPDF(analysis, fileName) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = margin;

  // Header band
  doc.setFillColor(11, 14, 19);
  doc.rect(0, 0, pageWidth, 70, 'F');
  doc.setTextColor(74, 158, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('InsightIQ', margin, 40);
  doc.setTextColor(180, 190, 205);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Intelligent Data Analytics — Analysis Report', margin, 56);
  doc.text(new Date().toLocaleString(), pageWidth - margin - 130, 56);

  y = 100;
  doc.setTextColor(20, 25, 35);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`Dataset: ${analysis.meta.fileName}`, margin, y);
  y += 22;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 70, 85);
  const summary = analysis.insights.executiveSummary || analysis.insights.insights.join(' ');
  const wrapped = doc.splitTextToSize(summary, pageWidth - margin * 2);
  doc.text(wrapped, margin, y);
  y += wrapped.length * 12 + 10;

  // Quality score
  autoTable(doc, {
    startY: y,
    head: [['Quality Score', analysis.quality.score + '/100']],
    body: analysis.quality.breakdown.map((b) => [b.dimension, `${b.value} (weight ${b.weight}) → ${b.contribution}`]),
    theme: 'grid',
    headStyles: { fillColor: [74, 158, 255], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [40, 50, 65] },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 16;

  // Statistics
  autoTable(doc, {
    startY: y,
    head: [['Column', 'Type', 'Mean', 'Std Dev', 'Min', 'Max', 'Nulls']],
    body: analysis.cleaned.headers.map((h) => {
      const c = analysis.stats.columnStats[h] || {};
      return [
        h,
        analysis.cleaned.columnProfiles[h]?.type || '—',
        c.mean ?? '—',
        c.stddev ?? '—',
        c.min ?? '—',
        c.max ?? '—',
        c.nullCount ?? 0,
      ];
    }),
    theme: 'striped',
    headStyles: { fillColor: [124, 92, 255], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 8, textColor: [40, 50, 65] },
    margin: { left: margin, right: margin },
  });
  y = doc.lastAutoTable.finalY + 16;

  // Insights
  autoTable(doc, {
    startY: y,
    head: [['Key Insights']],
    body: analysis.insights.insights.map((i) => [i]),
    theme: 'grid',
    headStyles: { fillColor: [34, 211, 238], textColor: 20, fontSize: 10 },
    bodyStyles: { fontSize: 9, textColor: [40, 50, 65] },
    margin: { left: margin, right: margin },
    columnStyles: { 0: { cellWidth: pageWidth - margin * 2 } },
  });
  y = doc.lastAutoTable.finalY + 12;

  if (analysis.insights.anomalies.length) {
    autoTable(doc, {
      startY: y,
      head: [['Anomalies Detected']],
      body: analysis.insights.anomalies.map((a) => [a]),
      theme: 'grid',
      headStyles: { fillColor: [255, 90, 90], textColor: 255, fontSize: 10 },
      bodyStyles: { fontSize: 9, textColor: [40, 50, 65] },
      margin: { left: margin, right: margin },
      columnStyles: { 0: { cellWidth: pageWidth - margin * 2 } },
    });
  }

  doc.save(`insightiq_${safeName(fileName)}_report.pdf`);
}

// ── helpers ────────────────────────────────────────────────────────────────

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
