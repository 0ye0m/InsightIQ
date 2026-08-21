// InsightIQ — Chat tab (RAG-grounded Q&A with dynamic suggestions)
import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Loader2, MessageSquare, FileText, Database, Link2, RefreshCw, Sparkles } from 'lucide-react';
import { buildSuggestions, generateLLMSuggestions } from '../engine/suggestions.js';

const SOURCE_ICONS = {
  summary: <Database size={11} />,
  column_stats: <FileText size={11} />,
  insights: <MessageSquare size={11} />,
  correlations: <Link2 size={11} />,
  row_group: <Database size={11} />,
};

export function ChatTab({ pipeline, ready, theme, analysis }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [llmSuggestions, setLlmSuggestions] = useState(null);
  const [refreshingSuggestions, setRefreshingSuggestions] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Build deterministic suggestions from the actual analysis.
  const deterministicSuggestions = useMemo(() => {
    if (!analysis) return [];
    return buildSuggestions(analysis);
  }, [analysis]);

  // The suggestions to display: prefer LLM-generated (more varied) but
  // fall back to deterministic.
  const activeSuggestions = (llmSuggestions && llmSuggestions.length > 0)
    ? llmSuggestions
    : deterministicSuggestions;

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [history, loading]);

  const ask = async (q) => {
    const question = (q ?? input).trim();
    if (!question || loading || !ready) return;
    setInput('');
    const newHistory = [...history, { role: 'user', content: question }];
    setHistory(newHistory);
    setLoading(true);
    try {
      const result = await pipeline.ask(question, { history: newHistory.slice(-6) });
      setHistory([
        ...newHistory,
        { role: 'assistant', content: result.answer, sources: result.sources },
      ]);
    } catch (e) {
      setHistory([
        ...newHistory,
        { role: 'assistant', content: `Sorry — I hit an error: ${e.message}`, sources: [] },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const refreshSuggestions = async () => {
    if (!analysis || refreshingSuggestions) return;
    setRefreshingSuggestions(true);
    try {
      const fresh = await generateLLMSuggestions(analysis, activeSuggestions);
      if (fresh && fresh.length > 0) {
        setLlmSuggestions(fresh);
      }
    } catch (e) {
      // Silent fallback — deterministic suggestions stay.
    } finally {
      setRefreshingSuggestions(false);
    }
  };

  return (
    <div className="glass-card chat-card">
      <div className="glass-card-header chat-header">
        <MessageSquare size={13} /> Insight chat — grounded in your data
        {ready && (
          <button
            className="suggestions-refresh"
            onClick={refreshSuggestions}
            disabled={refreshingSuggestions || !analysis}
            title="Generate fresh questions tailored to this dataset"
          >
            {refreshingSuggestions ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
            <span>{refreshingSuggestions ? 'Generating…' : 'Suggest more'}</span>
          </button>
        )}
      </div>

      <div className="chat-messages">
        {history.length === 0 && !loading && (
          <div className="chat-empty">
            <div className="chat-empty-icon"><MessageSquare size={28} /></div>
            <p className="chat-empty-title">Ask anything about your data</p>
            <p className="chat-empty-sub">Answers are grounded only in the indexed analysis — no fabricated numbers. Try one of these tailored questions:</p>
            <div className="chat-suggestions">
              {activeSuggestions.map((s, i) => (
                <button key={i} className="suggestion-chip" onClick={() => ask(s)}>
                  <Sparkles size={11} />
                  <span>{s}</span>
                </button>
              ))}
            </div>
            {activeSuggestions.length === 0 && (
              <p className="empty-note">No suggestions available. Ask a question in your own words.</p>
            )}
          </div>
        )}

        {history.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-avatar">{msg.role === 'user' ? 'You' : 'IQ'}</div>
            <div className="chat-content">
              <div className="chat-text">{msg.content}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="chat-sources">
                  <span className="sources-label">Sources:</span>
                  {msg.sources.slice(0, 5).map((s, j) => (
                    <span key={j} className="source-chip" title={s.snippet}>
                      {SOURCE_ICONS[s.family] || <FileText size={11} />}
                      {s.source}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="chat-avatar">IQ</div>
            <div className="chat-content">
              <div className="chat-text loading-dots">
                <span /> <span /> <span />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick suggestion chips below the input — always visible so the user can pivot mid-conversation */}
      {history.length > 0 && activeSuggestions.length > 0 && (
        <div className="chat-quick-suggestions">
          {activeSuggestions.slice(0, 3).map((s, i) => (
            <button key={i} className="quick-suggestion-chip" onClick={() => ask(s)} disabled={loading}>
              {s.length > 60 ? s.slice(0, 60) + '…' : s}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-area">
        <input
          ref={inputRef}
          className="chat-input"
          placeholder={ready ? 'Ask about your data…' : 'Upload a dataset first'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
          disabled={!ready}
          aria-label="Chat input"
        />
        <button className="btn btn-primary chat-send" onClick={() => ask()} disabled={!ready || loading || !input.trim()}>
          {loading ? <Loader2 size={15} className="spin" /> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}
