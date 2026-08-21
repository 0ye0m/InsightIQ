// InsightIQ — Charts tab (real chart data from the dataset, with PNG export)
import { useRef } from 'react';
import { Download } from 'lucide-react';
import { BarChart, LineChart, DoughnutChart, HistogramChart, ScatterChart, RadarChart, AreaChart, CorrelationHeatmap } from './Charts.jsx';
import { ChartErrorBoundary } from './ChartErrorBoundary.jsx';
import { exportChartContainer } from '../lib/chartExport.js';

function ChartCard({ title, subtitle, children }) {
  const ref = useRef(null);
  const safe = (title || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (
    <div className="glass-card chart-card-wrap" ref={ref}>
      <div className="glass-card-header chart-card-head">
        <span>{title}</span>
        <button
          className="icon-btn chart-download"
          title="Download chart as PNG"
          onClick={() => exportChartContainer(ref.current, safe)}
          aria-label="Download chart"
        >
          <Download size={13} />
        </button>
      </div>
      {subtitle && <div className="chart-subtitle">{subtitle}</div>}
      {children}
    </div>
  );
}

export function ChartsTab({ analysis, theme }) {
  const { chartBundle: c } = analysis;
  if (!c) return <div className="empty-note">No chart data available.</div>;

  return (
    <div className="dashboard-grid">
      <div className="grid-2">
        {c.bar && (
          <ChartCard title="Bar" subtitle={c.bar.source?.metric ? `${c.bar.source.metric} by ${c.bar.source.category}` : 'distribution'}>
            <ChartErrorBoundary><BarChart data={c.bar} theme={theme} title={c.bar.title} /></ChartErrorBoundary>
          </ChartCard>
        )}
        {c.line && (
          <ChartCard title="Trend" subtitle={c.line.source?.metric || ''}>
            <ChartErrorBoundary><LineChart data={c.line} theme={theme} title={c.line.title} /></ChartErrorBoundary>
          </ChartCard>
        )}
      </div>

      <div className="grid-2">
        {c.pie && (
          <ChartCard title="Share" subtitle={c.pie.source?.category || ''}>
            <ChartErrorBoundary><DoughnutChart data={c.pie} theme={theme} title={c.pie.title} /></ChartErrorBoundary>
          </ChartCard>
        )}
        {c.histogram && (
          <ChartCard title="Distribution" subtitle={c.histogram.source?.metric || ''}>
            <ChartErrorBoundary><HistogramChart data={c.histogram} theme={theme} title={c.histogram.title} /></ChartErrorBoundary>
          </ChartCard>
        )}
      </div>

      <div className="grid-2">
        {c.scatter && (
          <ChartCard title="Correlation" subtitle={`${c.scatter.source?.x} vs ${c.scatter.source?.y}`}>
            <ChartErrorBoundary><ScatterChart data={c.scatter} theme={theme} title={c.scatter.title} /></ChartErrorBoundary>
          </ChartCard>
        )}
        {c.hbar && (
          <ChartCard title="Top values" subtitle={c.hbar.source?.category || ''}>
            <ChartErrorBoundary><BarChart data={c.hbar} theme={theme} title={c.hbar.title} horizontal /></ChartErrorBoundary>
          </ChartCard>
        )}
      </div>

      {c.area && (
        <ChartCard title="Multi-series" subtitle={`${c.area.source?.metrics?.length || 0} numeric columns`}>
          <ChartErrorBoundary><AreaChart data={c.area} theme={theme} title={c.area.title} /></ChartErrorBoundary>
        </ChartCard>
      )}

      <div className="grid-2">
        {c.qualityRadar && (
          <ChartCard title="Quality radar">
            <ChartErrorBoundary><RadarChart data={c.qualityRadar} theme={theme} title={c.qualityRadar.title} /></ChartErrorBoundary>
          </ChartCard>
        )}
        {c.correlation && (
          <ChartCard title="Correlation matrix">
            <ChartErrorBoundary><CorrelationHeatmap data={c.correlation} theme={theme} /></ChartErrorBoundary>
          </ChartCard>
        )}
      </div>
    </div>
  );
}
