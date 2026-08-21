// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — Chart.js wrappers
//
// Theme-aware, defensive chart components. Each one degrades gracefully
// (returns null) when its data is empty instead of throwing.
// ─────────────────────────────────────────────────────────────────────────

import { Bar, Line, Doughnut, Scatter, Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  RadialLinearScale,
  Filler,
  Tooltip,
  Legend,
  Title,
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, ArcElement, RadialLinearScale,
  Filler, Tooltip, Legend, Title
);

const PALETTE = [
  '#4A9EFF', '#7C5CFF', '#22D3EE', '#4ADE80',
  '#FF8C42', '#F472B6', '#A78BFA', '#FBBF24',
  '#34D399', '#60A5FA', '#F87171', '#C084FC',
];

function themeColors(theme) {
  const dark = theme === 'dark';
  return {
    grid: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    text: dark ? '#E6EDF3' : '#0B0E13',
    muted: dark ? '#6B7B8D' : '#5C6B7A',
    surface: dark ? '#1E1C18' : '#FFFFFF',
    border: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
  };
}

function tooltipStyle(t) {
  return {
    backgroundColor: t.surface,
    titleColor: t.text,
    bodyColor: t.text,
    borderColor: t.border,
    borderWidth: 1,
    cornerRadius: 10,
    padding: 12,
    titleFont: { size: 12, weight: 600 },
    bodyFont: { size: 12 },
  };
}

function baseOptions(theme, title) {
  const t = themeColors(theme);
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 700, easing: 'easeOutQuart' },
    plugins: {
      legend: { display: false, labels: { color: t.text, font: { size: 11 }, usePointStyle: true, padding: 12 } },
      title: { display: !!title, text: title, color: t.text, font: { size: 13, weight: '600' }, padding: { bottom: 12 } },
      tooltip: tooltipStyle(t),
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: t.muted, font: { size: 11 } } },
      y: { grid: { color: t.grid }, ticks: { color: t.muted, font: { size: 11 } }, border: { display: false } },
    },
  };
}

function withAlpha(hex, a) {
  // accept #RRGGBB → rgba(...)
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ── Bar ─────────────────────────────────────────────────────────────────────

export function BarChart({ data, theme, title, horizontal = false }) {
  if (!data?.labels?.length) return null;
  const t = themeColors(theme);
  const opts = baseOptions(theme, title);
  if (horizontal) {
    opts.indexAxis = 'y';
    opts.scales = {
      x: { grid: { color: t.grid }, ticks: { color: t.muted }, border: { display: false } },
      y: { grid: { display: false }, ticks: { color: t.muted } },
    };
  }
  return (
    <div style={{ height: 280 }}>
      <Bar
        data={{
          labels: data.labels,
          datasets: [{
            data: data.values,
            backgroundColor: PALETTE.slice(0, data.values.length).map((c) => withAlpha(c, 0.8)),
            borderColor: PALETTE.slice(0, data.values.length),
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false,
          }],
        }}
        options={opts}
      />
    </div>
  );
}

// ── Line ──────────────────────────────────────────────────────────────────────

export function LineChart({ data, theme, title }) {
  if (!data?.labels?.length) return null;
  const t = themeColors(theme);
  const opts = baseOptions(theme, title);
  return (
    <div style={{ height: 280 }}>
      <Line
        data={{
          labels: data.labels,
          datasets: [{
            data: data.values,
            borderColor: '#4A9EFF',
            backgroundColor: withAlpha('#4A9EFF', 0.15),
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: '#4A9EFF',
            pointBorderColor: t.surface,
            pointBorderWidth: 1.5,
          }],
        }}
        options={opts}
      />
    </div>
  );
}

// ── Doughnut ───────────────────────────────────────────────────────────────────

export function DoughnutChart({ data, theme, title }) {
  if (!data?.labels?.length) return null;
  const t = themeColors(theme);
  return (
    <div style={{ height: 300 }}>
      <Doughnut
        data={{
          labels: data.labels,
          datasets: [{
            data: data.values,
            backgroundColor: PALETTE.slice(0, data.values.length).map((c) => withAlpha(c, 0.85)),
            borderColor: t.surface,
            borderWidth: 3,
            hoverOffset: 12,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '62%',
          animation: { duration: 700 },
          plugins: {
            legend: { position: 'right', labels: { color: t.text, font: { size: 11 }, usePointStyle: true, padding: 12 } },
            title: { display: !!title, text: title, color: t.text, font: { size: 13, weight: '600' } },
            tooltip: tooltipStyle(t),
          },
        }}
      />
    </div>
  );
}

// ── Histogram (uses Bar internally) ────────────────────────────────────────────

export function HistogramChart({ data, theme, title }) {
  if (!data?.labels?.length) return null;
  const t = themeColors(theme);
  return (
    <div style={{ height: 280 }}>
      <Bar
        data={{
          labels: data.labels,
          datasets: [{
            label: 'Frequency',
            data: data.values,
            backgroundColor: withAlpha('#4ADE80', 0.55),
            borderColor: '#4ADE80',
            borderWidth: 2,
            borderRadius: 4,
            barPercentage: 1,
            categoryPercentage: 0.95,
          }],
        }}
        options={{
          ...baseOptions(theme, title),
          scales: {
            x: { grid: { display: false }, ticks: { color: t.muted, maxRotation: 45, font: { size: 9 } } },
            y: { grid: { color: t.grid }, ticks: { color: t.muted }, border: { display: false }, title: { display: true, text: 'Frequency', color: t.muted } },
          },
        }}
      />
    </div>
  );
}

// ── Scatter ──────────────────────────────────────────────────────────────────────

export function ScatterChart({ data, theme, title }) {
  if (!data?.points?.length) return null;
  const t = themeColors(theme);
  const pts = data.points.map((p) => ({ x: p.x, y: p.y }));
  return (
    <div style={{ height: 280 }}>
      <Scatter
        data={{ datasets: [{ data: pts, backgroundColor: withAlpha('#7C5CFF', 0.55), borderColor: '#7C5CFF', pointRadius: 4, pointHoverRadius: 7 }] }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: !!title, text: title, color: t.text, font: { size: 13, weight: '600' } },
            tooltip: { ...tooltipStyle(t), callbacks: { label: (c) => `(${c.parsed.x}, ${c.parsed.y})` } },
          },
          scales: {
            x: { grid: { color: t.grid }, ticks: { color: t.muted }, title: { display: true, text: data.xLabel || 'X', color: t.muted } },
            y: { grid: { color: t.grid }, ticks: { color: t.muted }, border: { display: false }, title: { display: true, text: data.yLabel || 'Y', color: t.muted } },
          },
        }}
      />
    </div>
  );
}

// ── Radar ────────────────────────────────────────────────────────────────────────

export function RadarChart({ data, theme, title }) {
  if (!data?.labels?.length) return null;
  const t = themeColors(theme);
  return (
    <div style={{ height: 300 }}>
      <Radar
        data={{
          labels: data.labels,
          datasets: [{
            data: data.values,
            backgroundColor: withAlpha('#4A9EFF', 0.2),
            borderColor: '#4A9EFF',
            borderWidth: 2.5,
            pointBackgroundColor: '#4A9EFF',
            pointBorderColor: t.surface,
            pointBorderWidth: 2,
            pointRadius: 4,
          }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: !!title, text: title, color: t.text, font: { size: 13, weight: '600' } },
            tooltip: tooltipStyle(t),
          },
          scales: {
            r: {
              grid: { color: t.grid },
              angleLines: { color: t.grid },
              pointLabels: { color: t.text, font: { size: 11 } },
              ticks: { display: false },
              beginAtZero: true,
              max: 100,
            },
          },
        }}
      />
    </div>
  );
}

// ── Area (multi-series line) ───────────────────────────────────────────────────

export function AreaChart({ data, theme, title }) {
  if (!data?.labels?.length || !data?.datasets?.length) return null;
  const t = themeColors(theme);
  const datasets = data.datasets.map((d, i) => ({
    label: d.label || `Series ${i + 1}`,
    data: d.values,
    borderColor: PALETTE[i % PALETTE.length],
    backgroundColor: withAlpha(PALETTE[i % PALETTE.length], 0.15),
    borderWidth: 2.5,
    fill: true,
    tension: 0.4,
    pointRadius: 2,
    pointHoverRadius: 5,
  }));
  return (
    <div style={{ height: 300 }}>
      <Line
        data={{ labels: data.labels, datasets }}
        options={{
          ...baseOptions(theme, title),
          plugins: {
            ...baseOptions(theme, title).plugins,
            legend: { display: datasets.length > 1, position: 'top', align: 'end', labels: { color: t.text, font: { size: 11 }, usePointStyle: true, padding: 10, boxWidth: 8 } },
          },
        }}
      />
    </div>
  );
}

// ── Correlation Heatmap (custom canvas) ──────────────────────────────────────────

export function CorrelationHeatmap({ data, theme, title }) {
  if (!data?.labels?.length || !data?.matrix?.length) return null;
  const t = themeColors(theme);
  const n = data.labels.length;
  const cell = 44;
  const labelW = 110;
  const labelH = 28;
  const w = labelW + n * cell + 10;
  const h = labelH + n * cell + 10;

  function color(v) {
    // -1 (red) → 0 (neutral) → +1 (blue)
    const a = Math.min(1, Math.abs(v));
    if (v >= 0) return `rgba(74,158,255,${0.15 + a * 0.7})`;
    return `rgba(255,90,90,${0.15 + a * 0.7})`;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      {title && <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 8 }}>{title}</div>}
      <svg width={w} height={h} style={{ display: 'block' }}>
        {/* column headers */}
        {data.labels.map((lab, j) => (
          <text key={`ch-${j}`} x={labelW + j * cell + cell / 2} y={labelH - 8}
            textAnchor="end" transform={`rotate(-35 ${labelW + j * cell + cell / 2} ${labelH - 8})`}
            fontSize={10} fill={t.muted}>{lab.length > 12 ? lab.slice(0, 12) + '…' : lab}</text>
        ))}
        {/* rows */}
        {data.labels.map((lab, i) => (
          <g key={`r-${i}`}>
            <text x={labelW - 6} y={labelH + i * cell + cell / 2 + 4} textAnchor="end" fontSize={10} fill={t.muted}>
              {lab.length > 14 ? lab.slice(0, 14) + '…' : lab}
            </text>
            {data.matrix[i].map((v, j) => (
              <g key={`c-${i}-${j}`}>
                <rect x={labelW + j * cell} y={labelH + i * cell} width={cell - 2} height={cell - 2}
                  fill={color(v)} rx={4} stroke={t.border} strokeWidth={0.5} />
                <text x={labelW + j * cell + cell / 2} y={labelH + i * cell + cell / 2 + 4}
                  textAnchor="middle" fontSize={10} fontWeight={600}
                  fill={Math.abs(v) > 0.6 ? '#fff' : t.text}>{v.toFixed(2)}</text>
              </g>
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}
