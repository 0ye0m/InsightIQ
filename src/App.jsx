// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — application shell
//
// Layout: sidebar + topbar + content area. The content area switches
// between the upload screen and the analysis dashboard (Overview / Charts /
// Data / Chat). Includes an export menu (Excel / CSV / JSON / PDF) and a
// settings modal for runtime key configuration.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import {
  Sparkles, ChevronDown, FileSpreadsheet, Download,
  FileText, FileJson, FileType, Plus, Loader2, Image as ImageIcon,
} from 'lucide-react';
import { Sidebar } from './components/Sidebar.jsx';
import { Topbar } from './components/Topbar.jsx';
import { UploadZone } from './components/UploadZone.jsx';
import { OverviewTab } from './components/OverviewTab.jsx';
import { ChartsTab } from './components/ChartsTab.jsx';
import { DataTableTab } from './components/DataTableTab.jsx';
import { ChatTab } from './components/ChatTab.jsx';
import { SettingsModal } from './components/SettingsModal.jsx';
import { useAnalysis } from './hooks/useAnalysis.js';
import { useTheme } from './hooks/useTheme.js';
import { hasAnyKey } from './config/providers.js';
import { exportExcel, exportCSV, exportJSON, exportPDF } from './lib/exportReport.js';
import { exportNodeAsPng } from './lib/chartExport.js';
import { DocumentTab } from './components/DocumentTab.jsx';
import { CompareTab } from './components/CompareTab.jsx';
import { HistoryTab } from './components/HistoryTab.jsx';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'charts', label: 'Charts' },
  { id: 'data', label: 'Data' },
  { id: 'document', label: 'Document' },
  { id: 'chat', label: 'Chat' },
  { id: 'compare', label: 'Compare' },
  { id: 'history', label: 'History' },
];

export default function App() {
  const { theme, toggle } = useTheme();
  const {
    parsed, analysis, loading, loadingMsg, error, narrative, narrativeLoading,
    pipeline, loadFile, loadPasted, run, reset, setError,
  } = useAnalysis();

  const [activeTab, setActiveTab] = useState('overview');
  const [showSettings, setShowSettings] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [toast, setToast] = useState(null);
  const [keyVersion, setKeyVersion] = useState(0); // re-check hasAnyKey() after settings save

  const keyConfigured = hasAnyKey();

  const showToast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleFile = useCallback(async (file) => {
    const result = await loadFile(file);
    if (!result) return;
    if (!hasAnyKey()) {
      // Prompt for keys before analysis, but allow preview.
      setShowSettings(true);
      showToast('Add at least one engine key to enable insight generation.', 'warn');
    }
  }, [loadFile, showToast]);

  const handleAnalyze = useCallback(async () => {
    let workingParsed = parsed;
    // If in paste mode, parse the pasted text first.
    if (!workingParsed && pasteMode) {
      if (!pasteText.trim()) {
        setError('Nothing to parse — paste some CSV / TSV text first.');
        return;
      }
      const r = await loadPasted(pasteText);
      if (!r) return;
      workingParsed = r;
    }
    if (!workingParsed) return;
    // The deterministic pipeline (clean / stats / charts / RAG index) runs
    // without keys. Only narrative polish + chat require a key. We don't
    // block the analysis — we just hint.
    if (!hasAnyKey()) {
      showToast('No engine key set — narrative and chat will be limited. Add a key in Settings for full insight generation.', 'warn');
    }
    const result = await run(workingParsed);
    if (result) {
      setActiveTab('overview');
      showToast(`Analysis complete — ${result.assembled.stats.totalRows.toLocaleString()} rows indexed.`, 'success');
    }
  }, [parsed, pasteMode, pasteText, loadPasted, run, showToast]);

  const handleNew = useCallback(() => {
    reset();
    setPasteMode(false);
    setPasteText('');
    setActiveTab('overview');
  }, [reset]);

  const handlePasteChange = useCallback((text) => {
    setPasteText(text);
  }, []);

  const doExport = useCallback(async (kind) => {
    setExportOpen(false);
    if (!analysis) return;
    try {
      const name = analysis.meta.fileName;
      if (kind === 'xlsx') { exportExcel(analysis, name); showToast('Excel report downloaded.', 'success'); }
      else if (kind === 'csv') { exportCSV(analysis, name); showToast('CSV downloaded.', 'success'); }
      else if (kind === 'json') { exportJSON(analysis, name); showToast('JSON bundle downloaded.', 'success'); }
      else if (kind === 'pdf') { exportPDF(analysis, name); showToast('PDF report downloaded.', 'success'); }
      else if (kind === 'png') {
        const node = document.querySelector('.content-area .dashboard-grid') || document.querySelector('.content-area');
        await exportNodeAsPng(node, `${name}_dashboard`);
        showToast('Dashboard PNG downloaded.', 'success');
      }
    } catch (e) {
      showToast(`Export failed: ${e.message}`, 'error');
    }
  }, [analysis, showToast]);

  const onSettingsSaved = useCallback(() => {
    setKeyVersion((v) => v + 1);
    showToast('Engine keys updated.', 'success');
  }, [showToast]);

  const sidebarPage = analysis ? 'dashboard' : 'home';
  const topbarTitle = analysis ? analysis.meta.fileName : 'InsightIQ';

  return (
    <div className="app-layout">
      <Sidebar
        page={sidebarPage}
        onHome={handleNew}
        hasAnalysis={Boolean(analysis)}
        onExport={() => setExportOpen((o) => !o)}
        onSettings={() => setShowSettings(true)}
        keyConfigured={keyConfigured}
      />

      <div className="main-wrap">
        <Topbar
          theme={theme}
          onToggleTheme={toggle}
          title={topbarTitle}
          hasAnalysis={Boolean(analysis)}
          onExport={() => setExportOpen((o) => !o)}
          onSettings={() => setShowSettings(true)}
          keyConfigured={keyConfigured}
        >
          {analysis && (
            <>
              <button className="btn btn-secondary topbar-action" onClick={handleNew}>
                <Plus size={14} /> New
              </button>
              <div className="export-wrap">
                <button className="btn btn-primary topbar-action" onClick={() => setExportOpen((o) => !o)}>
                  <Download size={14} /> Export <ChevronDown size={13} />
                </button>
                {exportOpen && (
                  <>
                    <div className="export-backdrop" onClick={() => setExportOpen(false)} />
                    <div className="export-menu" role="menu">
                      <button className="export-item" onClick={() => doExport('xlsx')} role="menuitem">
                        <FileSpreadsheet size={15} /> Excel workbook
                        <span className="export-hint">.xlsx · 6 sheets</span>
                      </button>
                      <button className="export-item" onClick={() => doExport('csv')} role="menuitem">
                        <FileText size={15} /> Clean CSV
                        <span className="export-hint">.csv</span>
                      </button>
                      <button className="export-item" onClick={() => doExport('json')} role="menuitem">
                        <FileJson size={15} /> Analysis bundle
                        <span className="export-hint">.json</span>
                      </button>
                      <button className="export-item" onClick={() => doExport('pdf')} role="menuitem">
                        <FileType size={15} /> PDF report
                        <span className="export-hint">.pdf · summary</span>
                      </button>
                      <button className="export-item" onClick={() => doExport('png')} role="menuitem">
                        <ImageIcon size={15} /> Dashboard PNG
                        <span className="export-hint">.png · screenshot</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </Topbar>

        <div className="content-area">
          {/* Loading overlay */}
          {loading && (
            <div className="loading-overlay">
              <div className="loading-card">
                <Loader2 size={28} className="spin" />
                <p className="loading-msg">{loadingMsg || 'Working…'}</p>
                <div className="loading-bar"><div className="loading-bar-fill" /></div>
              </div>
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div className={`toast toast-${toast.kind}`} role="alert">
              <Sparkles size={14} /> {toast.msg}
            </div>
          )}

          {!analysis ? (
            <UploadZone
              onFile={handleFile}
              parsed={parsed}
              fileName={parsed?.meta.fileName}
              loading={loading}
              loadingMsg={loadingMsg}
              error={error}
              onAnalyze={handleAnalyze}
              pasteMode={pasteMode}
              onPasteText={handlePasteChange}
              onTogglePaste={() => setPasteMode((p) => !p)}
              onCancelPaste={() => { setPasteMode(false); setPasteText(''); }}
            />
          ) : (
            <div className="fade-in">
              <div className="dashboard-header">
                <div>
                  <h1 className="dashboard-title">Analysis complete</h1>
                  <p className="dashboard-sub">
                    {parsed?.meta.fileName} · {analysis.stats.totalRows.toLocaleString()} rows · {analysis.stats.totalColumns} columns · quality {analysis.quality.score}/100
                  </p>
                </div>
              </div>

              <div className="tab-bar" role="tablist">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <OverviewTab analysis={analysis} theme={theme} narrative={narrative} narrativeLoading={narrativeLoading} />
              )}
              {activeTab === 'charts' && <ChartsTab analysis={analysis} theme={theme} />}
              {activeTab === 'data' && <DataTableTab analysis={analysis} theme={theme} />}
              {activeTab === 'document' && <DocumentTab analysis={analysis} theme={theme} />}
              {activeTab === 'chat' && (
                <ChatTab pipeline={pipeline} ready={true} theme={theme} analysis={analysis} />
              )}
              {activeTab === 'compare' && (
                <CompareTab currentAnalysis={analysis} theme={theme} />
              )}
              {activeTab === 'history' && <HistoryTab theme={theme} />}
            </div>
          )}
        </div>
      </div>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={onSettingsSaved}
      />
    </div>
  );
}
