// InsightIQ — Data tab (clean data preview + column profiles)
import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';

const PAGE_SIZE = 50;

export function DataTableTab({ analysis, theme }) {
  const { cleaned, stats } = analysis;
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return cleaned.rows;
    const q = query.toLowerCase();
    return cleaned.rows.filter((r) =>
      cleaned.headers.some((h) => String(r[h] ?? '').toLowerCase().includes(q))
    );
  }, [query, cleaned.rows, cleaned.headers]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const slice = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <div className="dashboard-grid">
      <div className="glass-card">
        <div className="preview-header">
          <div className="glass-card-header" style={{ margin: 0 }}>Clean data preview</div>
          <span className="badge badge-blue">{filtered.length.toLocaleString()} rows</span>
        </div>

        <div className="data-toolbar">
          <div className="search-box">
            <Search size={14} />
            <input
              type="text"
              placeholder="Filter rows…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              aria-label="Filter rows"
            />
          </div>
          <div className="pager">
            <button className="pager-btn" disabled={current === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>‹</button>
            <span className="pager-info">Page {current + 1} / {totalPages}</span>
            <button className="pager-btn" disabled={current >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>›</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {cleaned.headers.map((h) => (
                  <th key={h}>
                    <div className="th-name">{h}</div>
                    <div className="th-type">{cleaned.columnProfiles[h]?.type || 'unknown'}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((row, i) => (
                <tr key={i}>
                  {cleaned.headers.map((h) => {
                    const v = row[h];
                    const profile = cleaned.columnProfiles[h];
                    const isNull = v === null || v === undefined || v === '';
                    return (
                      <td key={h} className={isNull ? 'cell-null' : ''}>
                        {isNull ? <span className="null-marker">—</span> : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Column profiles sidebar */}
      <div className="glass-card">
        <div className="glass-card-header">Column profiles</div>
        <div className="profile-list">
          {cleaned.headers.map((h) => {
            const p = cleaned.columnProfiles[h];
            const c = stats.columnStats[h];
            return (
              <div key={h} className="profile-row">
                <div className="profile-name">{h}</div>
                <div className="profile-meta">
                  <span className={`type-pill type-${p.type}`}>{p.type}</span>
                  {typeof c?.uniqueCount === 'number' && <span className="profile-stat">{c.uniqueCount} unique</span>}
                  {typeof c?.nullCount === 'number' && c.nullCount > 0 && (
                    <span className="profile-stat null-stat">{c.nullCount} nulls</span>
                  )}
                  {typeof c?.mean === 'number' && (
                    <span className="profile-stat">μ {c.mean}</span>
                  )}
                  {typeof c?.cardinality === 'number' && (
                    <span className="profile-stat">{c.cardinality} cats</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
