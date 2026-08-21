// InsightIQ — upload zone + paste mode + file preview
import { useState, useCallback, useRef } from 'react';
import { UploadCloud, FileSpreadsheet, Type as TypeIcon, Zap, Loader2 } from 'lucide-react';

export function UploadZone({ onFile, parsed, fileName, loading, loadingMsg, error, onAnalyze, onPasteText, onTogglePaste, onCancelPaste, pasteMode }) {
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }, [onFile]);

  return (
    <div style={{ maxWidth: 720, margin: '32px auto 0' }} className="fade-in">
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 className="hero-title">
          Raw data in.<br />
          <span style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent2))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Real intelligence out.</span>
        </h1>
        <p className="hero-sub">Upload any dataset — InsightIQ cleans, profiles, visualises, and answers your questions, end-to-end.</p>
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {!pasteMode ? (
        <div
          className={`upload-zone ${dragOver ? 'dragging' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,.json,.xlsx,.xls,.pdf,.docx"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
          />
          <div className="upload-icon">
            <UploadCloud size={40} />
          </div>
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Drop your file here</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>CSV, TSV, Excel, JSON, TXT, PDF, or Word — up to 25&nbsp;MB</p>
          <button className="btn btn-secondary" style={{ pointerEvents: 'none' }}>
            <FileSpreadsheet size={15} /> Browse files
          </button>
        </div>
      ) : (
        <div className="glass-card">
          <label className="settings-label" style={{ marginBottom: 8, display: 'block' }}>
            <TypeIcon size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Paste tabular data
          </label>
          <textarea
            className="chat-input paste-textarea"
            placeholder={'Paste CSV / TSV here (with headers in the first row).\nExample:\nname,age,city\nAda,28,London\nBo,34,Paris'}
            onChange={(e) => onPasteText(e.target.value)}
            rows={8}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={onAnalyze} disabled={loading}>
              {loading ? <Loader2 size={15} className="spin" /> : <Zap size={15} />} Parse & analyze
            </button>
            <button className="btn btn-secondary" onClick={onCancelPaste}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: 12 }}>
        <button
          className="link-button"
          onClick={onTogglePaste}
          type="button"
        >
          {pasteMode ? '← Back to upload' : 'Or paste data directly'}
        </button>
      </div>

      {parsed && !pasteMode && (
        <div className="glass-card fade-in" style={{ marginTop: 20 }}>
          <div className="preview-header">
            <div>
              <p className="preview-filename"><FileSpreadsheet size={15} /> {fileName}</p>
              <p className="preview-meta">{parsed.rows.length.toLocaleString()} rows · {parsed.headers.length} columns · {parsed.meta.fileType.toUpperCase()}</p>
            </div>
            <button className="btn btn-primary" onClick={onAnalyze} disabled={loading}>
              {loading ? <><Loader2 size={15} className="spin" /> <span className="loading-pulse">{loadingMsg}</span></> : <><Zap size={15} /> Analyze</>}
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>{parsed.headers.map((h) => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {parsed.headers.map((h) => <td key={h}>{String(row[h] ?? '—')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > 5 && (
            <p className="preview-foot">Showing 5 of {parsed.rows.length.toLocaleString()} rows</p>
          )}
        </div>
      )}
    </div>
  );
}
