// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — chart PNG export
//
// Two export modes:
//   • per-chart PNG  — downloads a single chart canvas as a high-res PNG
//   • dashboard PNG  — captures any DOM node (with all its charts) using
//                      html-to-image, so users get a single composite image
//
// Background is forced to the current theme's --bg colour so dark-mode
// screenshots don't come out transparent.
// ─────────────────────────────────────────────────────────────────────────

import { toPng } from 'html-to-image';

const FILTER = (node) => {
  // Skip nodes we know we don't want
  if (typeof node?.className === 'string' && /chart-fallback|skeleton-line/.test(node.className)) {
    return false;
  }
  return true;
};

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#0B0E13';
}

/**
 * Export a single canvas element (Chart.js renders to <canvas>) as a PNG.
 * We bump the device-pixel ratio for crisp output.
 */
export async function exportChartCanvas(canvas, fileName = 'chart') {
  if (!canvas) return;
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `insightiq_${fileName}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Find the first <canvas> inside a chart container and export it.
 * The Chart.js wrappers wrap canvases in a div.
 */
export async function exportChartContainer(containerEl, fileName = 'chart') {
  const canvas = containerEl?.querySelector?.('canvas');
  if (canvas) return exportChartCanvas(canvas, fileName);
  // Fallback: render the whole container via html-to-image
  return exportNodeAsPng(containerEl, fileName);
}

/**
 * Export any DOM node as a PNG (charts + surrounding labels).
 */
export async function exportNodeAsPng(node, fileName = 'dashboard') {
  if (!node) return;
  const bg = cssVar('--bg');
  const dataUrl = await toPng(node, {
    filter: FILTER,
    backgroundColor: bg,
    pixelRatio: 2,
    cacheBust: true,
  });
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `insightiq_${fileName}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Download a single chart by its wrapper element id.
 */
export async function downloadChartById(wrapperId, fileName) {
  const el = document.getElementById(wrapperId);
  if (!el) return;
  return exportChartContainer(el, fileName);
}
