// InsightIQ — sidebar navigation
import { Home, LayoutDashboard, Download, Settings, Sparkles } from 'lucide-react';

export function Sidebar({ page, onHome, hasAnalysis, onExport, onSettings, keyConfigured }) {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar-logo" title="InsightIQ" onClick={onHome}>
        <Sparkles size={20} color="#fff" />
      </div>
      <nav className="sidebar-nav">
        <button
          className={`sidebar-btn ${page === 'home' ? 'active' : ''}`}
          title="Home"
          onClick={onHome}
          aria-label="Home"
        >
          <Home size={20} />
        </button>
        <button
          className={`sidebar-btn ${page === 'dashboard' ? 'active' : ''}`}
          title="Dashboard"
          disabled={!hasAnalysis}
          aria-label="Dashboard"
          aria-disabled={!hasAnalysis}
        >
          <LayoutDashboard size={20} />
        </button>
        <button
          className="sidebar-btn"
          title="Export report"
          onClick={onExport}
          disabled={!hasAnalysis}
          aria-label="Export report"
          aria-disabled={!hasAnalysis}
        >
          <Download size={20} />
        </button>
      </nav>
      <div className="sidebar-bottom">
        <button
          className="sidebar-btn"
          title={keyConfigured ? 'Engine settings' : 'Configure engine'}
          onClick={onSettings}
          aria-label="Settings"
        >
          <Settings size={20} style={keyConfigured ? { color: 'var(--green)' } : undefined} />
        </button>
      </div>
    </aside>
  );
}
