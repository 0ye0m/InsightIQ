// InsightIQ — Compare tab (dataset comparison)
import { useState, useMemo, useEffect } from 'react';
import { ArrowRight, GitCompare, TrendingUp, TrendingDown, Minus, Trash2, Layers, AlertTriangle } from 'lucide-react';
import { listHistory, removeHistoryEntry, clearHistory } from '../lib/history.js';
import { compareAnalyses } from '../lib/comparison.js';

// Re-create the minimal analyses we need from history entries.
// History stores headers + KPIs, which is enough for the comparison
// engine's needs.
function entryToAnalysis(entry) {
  return {
    meta: { fileName: entry.fileName, fileType: entry.fileType, kind: entry.kind },
    cleaned: { headers: entry.headers || [], columnProfiles: {} },
    stats: {
      totalRows: entry.rows,
      totalColumns: entry.cols,
      nullPercentage: entry.nullPercentage,
      duplicateRows: entry.duplicateRows,
      numericColumnCount: entry.numericCols,
      categoryColumnCount: entry.categoryCols,
      columnStats: {},
      numericColumns: entry.firstMetric ? [entry.firstMetric.column] : [],
      categoryColumns: entry.topCategory ? [entry.topCategory.column] : [],
      correlation: {},
      strongPairs: [],
      nullsPerColumn: {},
      memoryCells: entry.rows * entry.cols,
    },
    quality: {
      score: entry.quality,
      breakdown: [
        { dimension: 'Completeness', value: 100 - entry.nullPercentage },
        { dimension: 'Uniqueness', value: 100 - (entry.duplicateRows / Math.max(entry.rows, 1)) * 100 },
        { dimension: 'Consistency', value: 100 },
        { dimension: 'Type Richness', value: 50 },
        { dimension: 'Volume', value: Math.min(100, Math.log10(entry.rows + 1) * 35) },
      ],
    },
    insights: { executiveSummary: entry.summary || '' },
  };
}

// To get full comparison including KPI deltas, we need actual column stats.
// The history entry doesn't store full column stats, so we mark this case.
function entryToComparisonAnalysis(entry) {
  const a = entryToAnalysis(entry);
  // Patch in the firstMetric if available so KPI delta works.
  if (entry.firstMetric) {
    a.stats.columnStats[entry.firstMetric.column] = {
      mean: entry.firstMetric.mean,
      median: entry.firstMetric.median,
      stddev: 0,
      outliers: 0,
    };
    a.cleaned.columnProfiles[entry.firstMetric.column] = { type: 'number' };
  }
  if (entry.topCategory) {
    a.stats.columnStats[entry.topCategory.column] = {
      cardinality: 0,
      topValues: entry.topCategory.topValue ? [{ value: entry.topCategory.topValue, count: entry.topCategory.topCount }] : [],
    };
    a.cleaned.columnProfiles[entry.topCategory.column] = { type: 'category' };
  }
  return a;
}

export function CompareTab({ currentAnalysis, theme, onPickCurrent }) {
  const [history, setHistory] = useState([]);
  const [pickA, setPickA] = useState(null);   // entry id
  const [pickB, setPickB] = useState(null);   // entry id
  const [useCurrentAsB, setUseCurrentAsB] = useState(false);

  useEffect(() => {
    setHistory(listHistory());
  }, []);

  const comparison = useMemo(() => {
    if (!pickA || (!pickB && !useCurrentAsB)) return null;
    const entryA = history.find((e) => e.id === pickA);
    if (!entryA) return null;
    const analysisA = entryToComparisonAnalysis(entryA);

    let analysisB;
    if (useCurrentAsB && currentAnalysis) {
      analysisB = currentAnalysis;
    } else {
      const entryB = history.find((e) => e.id === pickB);
      if (!entryB) return null;
      analysisB = entryToComparisonAnalysis(entryB);
    }
    try {
      return compareAnalyses(analysisA, analysisB);
    } catch (e) {
      return { error: e.message };
    }
  }, [pickA, pickB, useCurrentAsB, currentAnalysis, history]);

  const refreshHistory = () => setHistory(listHistory());
  const handleRemove = (id) => { removeHistoryEntry(id); refreshHistory(); setPickA(null); setPickB(null); };
  const handleClearAll = () => { clearHistory(); refreshHistory(); setPickA(null); setPickB(null); };

  return (
    <div className="dashboard-grid">
      <div className="glass-card">
        <div className="preview-header">
          <div className="glass-card-header" style={{ margin: 0 }}><GitCompare size={13} /> Pick two analyses to compare</div>
          <button className="btn btn-secondary" onClick={handleClearAll} disabled={!history.length}>
            <Trash2 size={13} /> Clear history
          </button>
        </div>

        {history.length === 0 ? (
          <p className="empty-note">No analysis history yet. Run an analysis to populate the history.</p>
        ) : (
          <>
            <div className="compare-pickers">
              <div className="compare-picker">
                <label className="settings-label">Dataset A (baseline)</label>
                <select className="modal-input" value={pickA || ''} onChange={(e) => setPickA(e.target.value || null)}>
                  <option value="">— select —</option>
                  {history.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.fileName} · {e.rows} rows · {e.quality}/100 · {new Date(e.timestamp).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              <div className="compare-arrow"><ArrowRight size={18} /></div>
              <div className="compare-picker">
                <label className="settings-label">
                  Dataset B (candidate)
                  <label className="settings-checkbox">
                    <input type="checkbox" checked={useCurrentAsB} onChange={(e) => { setUseCurrentAsB(e.target.checked); setPickB(null); }} disabled={!currentAnalysis} />
                    use current
                  </label>
                </label>
                {useCurrentAsB ? (
                  <div className="modal-input compare-current">📊 {currentAnalysis?.meta.fileName || '—'} (current)</div>
                ) : (
                  <select className="modal-input" value={pickB || ''} onChange={(e) => setPickB(e.target.value || null)}>
                    <option value="">— select —</option>
                    {history.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.fileName} · {e.rows} rows · {e.quality}/100 · {new Date(e.timestamp).toLocaleString()}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {history.length > 0 && (
              <details className="history-list">
                <summary>Manage history ({history.length})</summary>
                <div className="history-items">
                  {history.map((e) => (
                    <div key={e.id} className="history-row">
                      <span className="history-name">{e.fileName}</span>
                      <span className="history-meta">{e.rows} rows · {e.quality}/100 · {new Date(e.timestamp).toLocaleString()}</span>
                      <button className="icon-btn" onClick={() => handleRemove(e.id)} title="Remove"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      {comparison?.error && (
        <div className="alert alert-error">{comparison.error}</div>
      )}

      {comparison && !comparison.error && (
        <>
          {/* Summary */}
          <div className="glass-card">
            <div className="glass-card-header"><GitCompare size={13} /> Drift summary</div>
            <div className="compare-summary">
              {comparison.summary.map((s, i) => <p key={i}>{s}</p>)}
            </div>
          </div>

          <div className="grid-2">
            {/* Volume delta */}
            <div className="glass-card">
              <div className="glass-card-header">Volume delta</div>
              <div className="delta-grid">
                <DeltaRow label="Rows" a={comparison.volume.rowsA} b={comparison.volume.rowsB} delta={comparison.volume.rowDelta} pct={comparison.volume.rowPct} />
                <DeltaRow label="Columns" a={comparison.volume.colsA} b={comparison.volume.colsB} delta={comparison.volume.colDelta} />
              </div>
            </div>

            {/* Schema drift */}
            <div className="glass-card">
              <div className="glass-card-header"><Layers size={13} /> Schema drift</div>
              {comparison.schema.added.length === 0 && comparison.schema.removed.length === 0 && comparison.typeDrift.length === 0 ? (
                <p className="empty-note">No schema drift detected.</p>
              ) : (
                <div className="schema-drift">
                  {comparison.schema.added.length > 0 && (
                    <div className="drift-block drift-added">
                      <span className="drift-label">Added ({comparison.schema.added.length})</span>
                      <div className="drift-chips">
                        {comparison.schema.added.map((c) => <span key={c} className="drift-chip add">+ {c}</span>)}
                      </div>
                    </div>
                  )}
                  {comparison.schema.removed.length > 0 && (
                    <div className="drift-block drift-removed">
                      <span className="drift-label">Removed ({comparison.schema.removed.length})</span>
                      <div className="drift-chips">
                        {comparison.schema.removed.map((c) => <span key={c} className="drift-chip rem">− {c}</span>)}
                      </div>
                    </div>
                  )}
                  {comparison.typeDrift.length > 0 && (
                    <div className="drift-block drift-type">
                      <span className="drift-label"><AlertTriangle size={12} /> Type changes ({comparison.typeDrift.length})</span>
                      <div className="drift-chips">
                        {comparison.typeDrift.map((t) => (
                          <span key={t.column} className="drift-chip type">{t.column}: {t.from} → {t.to}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* KPI delta */}
          {comparison.kpiDelta.length > 0 && (
            <div className="glass-card">
              <div className="glass-card-header">KPI delta (shared numeric columns)</div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Column</th>
                      <th>Mean A</th>
                      <th>Mean B</th>
                      <th>Δ Mean</th>
                      <th>% Δ</th>
                      <th>Std A</th>
                      <th>Std B</th>
                      <th>Outliers A → B</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.kpiDelta.map((k) => (
                      <tr key={k.column}>
                        <td>{k.column}</td>
                        <td>{k.meanA?.toFixed(2) ?? '—'}</td>
                        <td>{k.meanB?.toFixed(2) ?? '—'}</td>
                        <td className={k.meanDelta > 0 ? 'cell-up' : k.meanDelta < 0 ? 'cell-down' : ''}>
                          {k.meanDelta > 0 ? '+' : ''}{k.meanDelta?.toFixed(2) ?? '—'}
                        </td>
                        <td className={k.meanPct > 0 ? 'cell-up' : k.meanPct < 0 ? 'cell-down' : ''}>
                          {k.meanPct === null ? '—' : `${k.meanPct > 0 ? '+' : ''}${k.meanPct}%`}
                        </td>
                        <td>{k.stdA?.toFixed(2) ?? '—'}</td>
                        <td>{k.stdB?.toFixed(2) ?? '—'}</td>
                        <td>{k.outliersA} → {k.outliersB}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Quality + Category overlap */}
          <div className="grid-2">
            <div className="glass-card">
              <div className="glass-card-header">Quality delta</div>
              <div className="quality-row" style={{ marginBottom: 8 }}>
                <span className="quality-dim" style={{ width: 'auto' }}>Overall score</span>
                <span className="quality-val" style={{ flex: 1, textAlign: 'left', paddingLeft: 12 }}>
                  {comparison.qualityDelta.scoreA} → {comparison.qualityDelta.scoreB}
                  <span className={`quality-delta-pill ${comparison.qualityDelta.scoreDelta >= 0 ? 'positive' : 'negative'}`}>
                    {comparison.qualityDelta.scoreDelta >= 0 ? '+' : ''}{comparison.qualityDelta.scoreDelta}
                  </span>
                </span>
              </div>
              {comparison.qualityDelta.dimensions.map((d) => (
                <div key={d.dimension} className="quality-row">
                  <span className="quality-dim">{d.dimension}</span>
                  <div className="quality-bar">
                    <div className="quality-bar-fill" style={{ width: `${d.b}%` }} />
                  </div>
                  <span className="quality-val">{d.a} → {d.b} <span className={`quality-delta-pill small ${d.delta >= 0 ? 'positive' : 'negative'}`}>{d.delta >= 0 ? '+' : ''}{d.delta}</span></span>
                </div>
              ))}
            </div>

            <div className="glass-card">
              <div className="glass-card-header">Categorical overlap (shared)</div>
              {comparison.categoryOverlap.length === 0 ? (
                <p className="empty-note">No shared categorical columns.</p>
              ) : (
                <div className="overlap-list">
                  {comparison.categoryOverlap.map((c) => (
                    <div key={c.column} className="overlap-row">
                      <div className="overlap-head">
                        <span className="overlap-name">{c.column}</span>
                        <span className="overlap-jaccard jaccard-{c.jaccardSimilarity >= 0.7 ? 'high' : c.jaccardSimilarity >= 0.4 ? 'mid' : 'low'}">
                          J = {c.jaccardSimilarity}
                        </span>
                      </div>
                      <div className="overlap-bar">
                        <div className="overlap-bar-fill" style={{ width: `${c.jaccardSimilarity * 100}%` }} />
                      </div>
                      <span className="overlap-detail">{c.cardinalityA} → {c.cardinalityB} cats · {c.sharedValues} shared</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function DeltaRow({ label, a, b, delta, pct }) {
  const TrendIcon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tone = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
  return (
    <div className={`delta-row tone-${tone}`}>
      <span className="delta-label">{label}</span>
      <span className="delta-a">{a?.toLocaleString() ?? '—'}</span>
      <ArrowRight size={13} className="delta-arrow" />
      <span className="delta-b">{b?.toLocaleString() ?? '—'}</span>
      <span className="delta-delta">
        <TrendIcon size={13} />
        {delta > 0 ? '+' : ''}{delta?.toLocaleString() ?? '—'}
        {pct !== null && pct !== undefined && <span className="delta-pct"> ({pct > 0 ? '+' : ''}{pct}%)</span>}
      </span>
    </div>
  );
}
