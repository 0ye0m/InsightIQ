// InsightIQ — top bar
import { Sun, Moon, Download, Settings } from 'lucide-react';

export function Topbar({ theme, onToggleTheme, title, hasAnalysis, onExport, onSettings, keyConfigured, children }) {
  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-title">{title}</span>
      </div>
      <div style={{ flex: 1 }} />
      {children}
      <button className="theme-toggle" onClick={onToggleTheme} title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
      </button>
      <div className="topbar-actions">
        {hasAnalysis && (
          <button className="icon-btn" title="Export report" onClick={onExport} aria-label="Export">
            <Download size={16} />
          </button>
        )}
        <button
          className="icon-btn"
          title={keyConfigured ? 'Engine connected' : 'Configure engine'}
          onClick={onSettings}
          aria-label="Settings"
          style={keyConfigured ? { color: 'var(--green)', borderColor: 'var(--green-dim)' } : undefined}
        >
          <Settings size={16} />
        </button>
      </div>
    </header>
  );
}
