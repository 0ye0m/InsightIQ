// InsightIQ — History tab (analysis history + trend charts)
import { useState, useMemo, useEffect } from 'react';
import { History as HistoryIcon, TrendingUp, Trash2, X, Activity } from 'lucide-react';
import { listHistory, clearHistory, removeHistoryEntry, trendForFile, overallTrend } from '../lib/history.js';
import { LineChart, BarChart } from './Charts.jsx';

export function HistoryTab({ theme }) {
  const [history, setHistory] = useState([]);
  const [selectedFile, setSelectedFile] = useState('');

  const refresh = () => setHistory(listHistory());
  useEffect(() => { refresh(); }, []);

  const fileNames = useMemo(() => {
    const set = new Set(history.map((e) => e.fileName));
    return Array.from(set);
  }, [history]);

  const fileTrend = useMemo(() => {
    if (!selectedFile) return [];
    return trendForFile(selectedFile);
  }, [selectedFile, history]);

  const overall = useMemo(() => overallTrend(), [history]);

  // Build chart data for overall row count over time
  const overallChart = useMemo(() => {
    if (!overall.length) return null;
    return {
      labels: overall.map((e) => new Date(e.timestamp).toLocaleDateString() + ' ' + new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      values: overall.map((e) => e.rows),
    };
  }, [overall]);

  // Build chart data for selected file's quality trend
  const qualityTrend = useMemo(() => {
    if (!fileTrend.length) return null;
    return {
      labels: fileTrend.map((e) => new Date(e.timestamp).toLocaleDateString()),
      values: fileTrend.map((e) => e.quality),
    };
  }, [fileTrend]);

  // Build chart data for selected file's first metric trend
  const metricTrend = useMemo(() => {
    if (!fileTrend.length || !fileTrend[0].firstMetric) return null;
    const col = fileTrend[0].firstMetric.column;
    return {
      labels: fileTrend.map((e) => new Date(e.timestamp).toLocaleDateString()),
      values: fileTrend.map((e) => e.firstMetric?.mean ?? 0),
      column: col,
    };
  }, [fileTrend]);

  const handleClear = () => { clearHistory(); refresh(); setSelectedFile(''); };
  const handleRemove = (id) => { removeHistoryEntry(id); refresh(); };

  return (
    <div className="dashboard-grid">
      <div className="glass-card">
        <div className="preview-header">
          <div className="glass-card-header" style={{ margin: 0 }}><HistoryIcon size={13} /> Analysis history ({history.length})</div>
          <button className="btn btn-secondary" onClick={handleClear} disabled={!history.length}>
            <Trash2 size={13} /> Clear all
          </button>
        </div>

        {history.length === 0 ? (
          <p className="empty-note" style={{ padding: 32, textAlign: 'center' }}>
            No analyses recorded yet. Each completed analysis is automatically saved here so you can review trends over time or compare datasets.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Rows</th>
                  <th>Cols</th>
                  <th>Quality</th>
                  <th>Nulls</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id}>
                    <td>{e.fileName}</td>
                    <td>{new Date(e.timestamp).toLocaleString()}</td>
                    <td><span className="type-pill">{e.fileType}</span></td>
                    <td>{e.rows.toLocaleString()}</td>
                    <td>{e.cols}</td>
                    <td><span className={`quality-badge q-${e.quality >= 80 ? 'good' : e.quality >= 60 ? 'mid' : 'low'}`}>{e.quality}</span></td>
                    <td>{e.nullPercentage}%</td>
                    <td><button className="icon-btn" onClick={() => handleRemove(e.id)} title="Remove"><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {overallChart && (
        <div className="glass-card">
          <div className="glass-card-header"><Activity size={13} /> Records analysed over time</div>
          <LineChart data={overallChart} theme={theme} title="Rows per analysis run" />
        </div>
      )}

      {fileNames.length > 0 && (
        <div className="glass-card">
          <div className="glass-card-header"><TrendingUp size={13} /> Per-file trend</div>
          <div className="settings-section">
            <label className="settings-label">Track a specific file across runs</label>
            <select className="modal-input" value={selectedFile} onChange={(e) => setSelectedFile(e.target.value)}>
              <option value="">— select a file —</option>
              {fileNames.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          {selectedFile && fileTrend.length === 0 && (
            <p className="empty-note">No repeated runs of "{selectedFile}" yet. Upload the same file again to see trend lines.</p>
          )}
          {selectedFile && fileTrend.length > 0 && (
            <div className="dashboard-grid" style={{ marginTop: 16 }}>
              {qualityTrend && (
                <div className="glass-card">
                  <div className="glass-card-header">Quality score trend</div>
                  <LineChart data={qualityTrend} theme={theme} title={`${selectedFile} — quality over time`} />
                </div>
              )}
              {metricTrend && (
                <div className="glass-card">
                  <div className="glass-card-header">"{metricTrend.column}" — mean over time</div>
                  <LineChart data={{ labels: metricTrend.labels, values: metricTrend.values }} theme={theme} title={`${metricTrend.column} mean across runs`} />
                </div>
              )}
              {fileTrend.length > 1 && (
                <div className="glass-card">
                  <div className="glass-card-header">Top category share over time</div>
                  <BarChart data={{
                    labels: fileTrend.map((e) => new Date(e.timestamp).toLocaleDateString()),
                    values: fileTrend.map((e) => e.topCategory?.topCount || 0),
                  }} theme={theme} title={`"${fileTrend[0].topCategory?.column}" top-value count`} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
