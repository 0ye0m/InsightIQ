// InsightIQ — Overview tab (business-focused dashboard)
//
// Leads with what a Power BI / business analyst wants to see:
//   1. Executive business narrative
//   2. Business KPI cards (Total, Avg, Top performer, Growth, Pareto)
//   3. Top-N performers table
//   4. Time trend (when a date column exists)
//   5. Pareto concentration chart
//   6. Key business insights (OLAP-derived)
//   7. Anomalies (statistical outliers framed as business anomalies)
//   8. Forward signals (projections, volatility, recommendations)
//
// Technical data-quality info (null %, duplicates) is shown at the
// bottom in a small "Data Health" panel — useful context, not the main
// story.
import { Lightbulb, AlertTriangle, TrendingUp, Sparkles, Activity, Layers, Database, GitCompare, ArrowUp, ArrowDown, Minus, ShieldCheck } from 'lucide-react';
import { QualityRing } from './QualityRing.jsx';
import { KpiCard } from './KpiCard.jsx';
import { BarChart, LineChart, DoughnutChart } from './Charts.jsx';
import { ChartErrorBoundary } from './ChartErrorBoundary.jsx';

export function OverviewTab({ analysis, theme, narrative, narrativeLoading }) {
  const { insights, quality, stats, meta } = analysis;
  const olap = insights?.olap;
  const classified = insights?.classified;

  // Pick the primary Top-N to display
  const topNKey = olap && olap.primaryMeasure && olap.primaryDimension
    ? `${olap.primaryMeasure}__${olap.primaryDimension}__sum`
    : null;
  const topN = topNKey ? olap.olap.topN[topNKey] : null;

  // Pick the primary period-over-period to display
  const popKey = olap && olap.primaryMeasure && olap.primaryTimeDimension
    ? `${olap.primaryMeasure}__${olap.primaryTimeDimension}__month`
    : null;
  const pop = popKey ? olap.olap.periodOverPeriod[popKey] : null;

  // Pick the primary Pareto
  const paretoKey = olap && olap.primaryMeasure && olap.primaryDimension
    ? `${olap.primaryMeasure}__${olap.primaryDimension}`
    : null;
  const pareto = paretoKey ? olap.olap.paretos[paretoKey] : null;

  return (
    <div className="dashboard-grid">
      {/* Executive narrative + quality ring */}
      <div className="grid-2">
        <div className="glass-card">
          <div className="glass-card-header">
            <Sparkles size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Executive narrative
          </div>
          {narrativeLoading ? (
            <div className="narrative-loading">
              <div className="skeleton-line" style={{ width: '100%' }} />
              <div className="skeleton-line" style={{ width: '92%' }} />
              <div className="skeleton-line" style={{ width: '85%' }} />
              <div className="skeleton-line" style={{ width: '70%' }} />
            </div>
          ) : (
            <>
              <p className="exec-summary">{narrative || insights.executiveSummary}</p>
              {classified && (
                <div className="semantic-tags">
                  {classified.measures.length > 0 && (
                    <div className="semantic-group">
                      <span className="semantic-label"><Database size={11} /> Measures</span>
                      {classified.measures.map((m) => (
                        <span key={m.column} className="semantic-pill measure">{m.column}</span>
                      ))}
                    </div>
                  )}
                  {classified.dimensions.length + classified.geoDimensions.length > 0 && (
                    <div className="semantic-group">
                      <span className="semantic-label"><Layers size={11} /> Dimensions</span>
                      {[...classified.dimensions, ...classified.geoDimensions].map((d) => (
                        <span key={d.column} className="semantic-pill dimension">{d.column}</span>
                      ))}
                    </div>
                  )}
                  {classified.timeDimensions.length > 0 && (
                    <div className="semantic-group">
                      <span className="semantic-label"><Activity size={11} /> Time</span>
                      {classified.timeDimensions.map((d) => (
                        <span key={d.column} className="semantic-pill time">{d.column}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="glass-card quality-card">
          <div className="glass-card-header"><ShieldCheck size={13} /> Data quality score</div>
          <QualityRing score={quality.score} />
          <div className="quality-breakdown">
            {quality.breakdown.map((b) => (
              <div key={b.dimension} className="quality-row">
                <span className="quality-dim">{b.dimension}</span>
                <div className="quality-bar">
                  <div className="quality-bar-fill" style={{ width: `${b.value}%` }} />
                </div>
                <span className="quality-val">{b.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Business KPIs — these are now OLAP-powered */}
      {insights.kpis?.length > 0 && (
        <div className="grid-auto">
          {insights.kpis.map((kpi, i) => <KpiCard key={i} kpi={kpi} />)}
        </div>
      )}

      {/* Top-N performers + Time trend */}
      <div className="grid-2">
        {topN && topN.length > 0 && (
          <div className="glass-card">
            <div className="glass-card-header">
              <TrendingUp size={13} /> Top {olap.primaryDimension}s by {olap.primaryMeasure}
            </div>
            <ChartErrorBoundary>
              <BarChart data={{
                labels: topN.slice(0, 8).map((t) => String(t.value).slice(0, 12)),
                values: topN.slice(0, 8).map((t) => t.sum),
              }} theme={theme} title={`Top ${olap.primaryDimension}s by ${olap.primaryMeasure}`} />
            </ChartErrorBoundary>
            <div className="topn-table-wrap">
              <table className="data-table compact">
                <thead>
                  <tr>
                    <th>{olap.primaryDimension}</th>
                    <th>{olap.primaryMeasure}</th>
                    <th>Count</th>
                    <th>Avg</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {topN.slice(0, 8).map((t, i) => (
                    <tr key={i}>
                      <td className="dim-value">{String(t.value)}</td>
                      <td className="measure-value">{t.sum.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td>{t.count}</td>
                      <td>{t.mean.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td><span className={`share-pill share-${t.share > 30 ? 'high' : t.share > 10 ? 'mid' : 'low'}`}>{t.share}%</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {pop && pop.length >= 2 && (
          <div className="glass-card">
            <div className="glass-card-header">
              <Activity size={13} /> {olap.primaryMeasure} trend over {olap.primaryTimeDimension}
            </div>
            <ChartErrorBoundary>
              <LineChart data={{
                labels: pop.map((p) => p.period),
                values: pop.map((p) => p.value),
              }} theme={theme} title={`${olap.primaryMeasure} over time (monthly)`} />
            </ChartErrorBoundary>
            <div className="trend-stats">
              {pop.length >= 2 && (() => {
                const last = pop[pop.length - 1];
                const prev = pop[pop.length - 2];
                const first = pop[0];
                const totalGrowth = first.value !== 0 ? +(((last.value - first.value) / Math.abs(first.value)) * 100).toFixed(2) : null;
                return (
                  <>
                    <div className="trend-stat">
                      <span className="trend-label">Latest period</span>
                      <span className="trend-value">{last.period}</span>
                      <span className="trend-detail">{last.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    </div>
                    {last.growthPct !== null && (
                      <div className={`trend-stat trend-${last.growthPct >= 0 ? 'up' : 'down'}`}>
                        <span className="trend-label">MoM change</span>
                        <span className="trend-value">{last.growthPct >= 0 ? '+' : ''}{last.growthPct}%</span>
                        <span className="trend-detail">{prev.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} → {last.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                      </div>
                    )}
                    {totalGrowth !== null && (
                      <div className={`trend-stat trend-${totalGrowth >= 0 ? 'up' : 'down'}`}>
                        <span className="trend-label">Total growth</span>
                        <span className="trend-value">{totalGrowth >= 0 ? '+' : ''}{totalGrowth}%</span>
                        <span className="trend-detail">{first.period} → {last.period}</span>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Pareto + Distribution */}
      {pareto && pareto.topContributors && pareto.topContributors.length > 0 && (
        <div className="grid-2">
          <div className="glass-card">
            <div className="glass-card-header">
              <GitCompare size={13} /> Pareto — {olap.primaryMeasure} concentration by {olap.primaryDimension}
            </div>
            <ChartErrorBoundary>
              <BarChart data={{
                labels: pareto.topContributors.slice(0, 10).map((t) => String(t.value).slice(0, 12)),
                values: pareto.topContributors.slice(0, 10).map((t) => t.sum),
              }} theme={theme} title="Concentration analysis" />
            </ChartErrorBoundary>
            <div className="pareto-summary">
              <div className="pareto-stat">
                <span className="pareto-num">{pareto.paretoCount}</span>
                <span className="pareto-label">{olap.primaryDimension}s drive 80% of {olap.primaryMeasure}</span>
              </div>
              <div className="pareto-stat">
                <span className="pareto-num">{pareto.totalContributors}</span>
                <span className="pareto-label">total {olap.primaryDimension}s in dataset</span>
              </div>
              <div className="pareto-stat">
                <span className="pareto-num">{pareto.concentrationIndex}%</span>
                <span className="pareto-label">concentration index</span>
              </div>
            </div>
          </div>

          {classified && classified.dimensions.length + classified.geoDimensions.length > 1 && (() => {
            const secondDim = classified.dimensions[1] || classified.geoDimensions[1];
            const key = `${olap.primaryMeasure}__${secondDim.column}`;
            const decomp = olap.olap.decompositions[key];
            if (!decomp) return null;
            return (
              <div className="glass-card">
                <div className="glass-card-header">
                  <Layers size={13} /> {olap.primaryMeasure} by {secondDim.column}
                </div>
                <ChartErrorBoundary>
                  <DoughnutChart data={{
                    labels: decomp.breakdown.slice(0, 7).map((b) => String(b.value).slice(0, 14)),
                    values: decomp.breakdown.slice(0, 7).map((b) => b.sum),
                  }} theme={theme} title={`Share of ${olap.primaryMeasure} by ${secondDim.column}`} />
                </ChartErrorBoundary>
                <p className="decomp-note">
                  Top contributor: "{decomp.breakdown[0].value}" ({decomp.breakdown[0].share}% share).
                  Top 20% of {secondDim.column}s account for {decomp.concentrationIndex}% of total {olap.primaryMeasure}.
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* Business insights + Anomalies + Predictions */}
      <div className="grid-3">
        <div className="glass-card">
          <div className="glass-card-header"><Lightbulb size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Business insights</div>
          <div className="chip-list">
            {insights.insights.map((ins, i) => (
              <div key={i} className="insight-chip"><span className="chip-dot accent" />{ins}</div>
            ))}
          </div>
        </div>
        <div className="glass-card">
          <div className="glass-card-header"><AlertTriangle size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Anomalies & outliers</div>
          <div className="chip-list">
            {insights.anomalies.length > 0
              ? insights.anomalies.map((a, i) => <div key={i} className="anomaly-chip"><span className="chip-dot bad" />{a}</div>)
              : <p className="empty-note">No anomalies detected.</p>}
          </div>
        </div>
        <div className="glass-card">
          <div className="glass-card-header"><TrendingUp size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Forward signals</div>
          <div className="chip-list">
            {insights.predictions.length > 0
              ? insights.predictions.map((p, i) => <div key={i} className="insight-chip"><span className="chip-dot purple" />{p}</div>)
              : <p className="empty-note">No forward signals — add a temporal column for trend analysis.</p>}
          </div>
        </div>
      </div>

      {/* Data health (technical, demoted) */}
      <div className="glass-card data-health-card">
        <div className="glass-card-header">
          <ShieldCheck size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Data health
          <span className="data-health-note">{insights.dataHealth}</span>
        </div>
        <div className="grid-4">
          <StatTile icon="rows" label="Records" value={stats.totalRows.toLocaleString()} sub={`${stats.totalColumns} columns`} />
          <StatTile icon="numeric" label="Measures / Dimensions" value={`${classified?.measures.length || 0} / ${(classified?.dimensions.length || 0) + (classified?.geoDimensions.length || 0)}`} sub={`${classified?.timeDimensions.length || 0} time dim`} />
          <StatTile icon="nulls" label="Null coverage" value={`${stats.nullPercentage}%`} sub={`${stats.nullCells.toLocaleString()} cells`} tone={stats.nullPercentage < 5 ? 'good' : stats.nullPercentage < 20 ? 'warn' : 'bad'} />
          <StatTile icon="dupes" label="Duplicates removed" value={stats.duplicateRows.toLocaleString()} sub={stats.duplicateRows === 0 ? 'none detected' : 'during cleaning'} tone={stats.duplicateRows === 0 ? 'good' : 'warn'} />
        </div>
      </div>
    </div>
  );
}

function StatTile({ icon, label, value, sub, tone = 'neutral' }) {
  const icons = {
    rows: '▦',
    numeric: '#',
    nulls: '∅',
    dupes: '⧉',
  };
  return (
    <div className={`glass-card stat-tile tone-${tone}`}>
      <div className="stat-tile-top">
        <span className="stat-tile-icon">{icons[icon]}</span>
        <span className="stat-tile-value">{value}</span>
      </div>
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-sub">{sub}</div>
    </div>
  );
}
