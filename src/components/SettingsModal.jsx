// InsightIQ — settings modal
//
// Lets the user provide generation-engine credentials at runtime when
// .env values are absent. Stored in localStorage. Provider names are
// not shown in the UI — generic labels only.
import { useState, useEffect } from 'react';
import { KeyRound, X, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';
import { getEffectiveKeys, setStoredKey, PROVIDERS } from '../config/providers.js';

export function SettingsModal({ open, onClose, onSaved }) {
  const [primary, setPrimary] = useState('');
  const [secondary, setSecondary] = useState('');
  const [showPrimary, setShowPrimary] = useState(false);
  const [showSecondary, setShowSecondary] = useState(false);
  const [envPrimary, setEnvPrimary] = useState(false);
  const [envSecondary, setEnvSecondary] = useState(false);

  useEffect(() => {
    if (!open) return;
    const k = getEffectiveKeys();
    setPrimary(k.primary);
    setSecondary(k.secondary);
    setEnvPrimary(Boolean(PROVIDERS.primary.key));
    setEnvSecondary(Boolean(PROVIDERS.secondary.key));
  }, [open]);

  if (!open) return null;

  const save = () => {
    setStoredKey('primary', primary.trim());
    setStoredKey('secondary', secondary.trim());
    onSaved?.();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card slide-up" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div className="modal-icon"><KeyRound size={22} /></div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Intelligence Engine</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '2px 0 0' }}>Connect at least one generation engine.</p>
          </div>
        </div>

        <div className="settings-section">
          <label className="settings-label">
            Primary engine key
            {envPrimary && <span className="settings-pill"><ShieldCheck size={11} /> env</span>}
          </label>
          <div className="settings-input-wrap">
            <input
              className="modal-input"
              type={showPrimary ? 'text' : 'password'}
              placeholder="Paste your primary engine key"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              autoFocus
            />
            <button className="settings-eye" onClick={() => setShowPrimary((s) => !s)} type="button">
              {showPrimary ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <label className="settings-label">
            Secondary engine key <span style={{ color: 'var(--text-dim)' }}>(fallback)</span>
            {envSecondary && <span className="settings-pill"><ShieldCheck size={11} /> env</span>}
          </label>
          <div className="settings-input-wrap">
            <input
              className="modal-input"
              type={showSecondary ? 'text' : 'password'}
              placeholder="Paste your secondary engine key"
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
            />
            <button className="settings-eye" onClick={() => setShowSecondary((s) => !s)} type="button">
              {showSecondary ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="settings-hint">
          <AlertCircle size={13} />
          <span>Keys entered here are stored locally in your browser. You can also set them in <code>.env</code> using <code>VITE_*</code> variables — those take precedence unless overridden here.</span>
        </div>

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 16, justifyContent: 'center' }} onClick={save}>
          Save & continue
        </button>
      </div>
    </div>
  );
}
