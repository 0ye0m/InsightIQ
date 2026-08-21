// InsightIQ — Document tab (deep document analysis for PDF/Word uploads)
import { useState } from 'react';
import { FileText, Hash, Calendar, DollarSign, Percent, Link2, AtSign, Phone, Tag, BookOpen, Layers, Smile, Quote } from 'lucide-react';

const ENTITY_ICONS = {
  email: <AtSign size={13} />,
  url: <Link2 size={13} />,
  phone: <Phone size={13} />,
  date: <Calendar size={13} />,
  currency: <DollarSign size={13} />,
  percentage: <Percent size={13} />,
  id: <Tag size={13} />,
};

export function DocumentTab({ analysis, theme }) {
  const { documentAnalysis: da, meta, tables } = analysis;
  const [expandedTopic, setExpandedTopic] = useState(null);

  if (!da) {
    return (
      <div className="empty-note" style={{ padding: 40, textAlign: 'center' }}>
        No document analysis available. The Document tab activates automatically for PDF, Word, and large text files.
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      {/* Structural overview */}
      <div className="grid-2">
        <div className="glass-card">
          <div className="glass-card-header"><FileText size={13} /> Structural overview</div>
          <div className="doc-stats-grid">
            <div className="doc-stat">
              <span className="doc-stat-label">Paragraphs</span>
              <span className="doc-stat-value">{da.structural.paragraphs.toLocaleString()}</span>
            </div>
            <div className="doc-stat">
              <span className="doc-stat-label">Sentences</span>
              <span className="doc-stat-value">{da.structural.sentences.toLocaleString()}</span>
            </div>
            <div className="doc-stat">
              <span className="doc-stat-label">Words</span>
              <span className="doc-stat-value">{da.structural.words.toLocaleString()}</span>
            </div>
            <div className="doc-stat">
              <span className="doc-stat-label">Characters</span>
              <span className="doc-stat-value">{da.structural.characters.toLocaleString()}</span>
            </div>
            <div className="doc-stat">
              <span className="doc-stat-label">Avg words / sentence</span>
              <span className="doc-stat-value">{da.structural.avgWordsPerSentence}</span>
            </div>
            <div className="doc-stat">
              <span className="doc-stat-label">Avg paragraph length</span>
              <span className="doc-stat-value">{da.structural.avgParagraphLength}</span>
            </div>
          </div>
        </div>

        <div className="glass-card">
          <div className="glass-card-header"><BookOpen size={13} /> Readability & sentiment</div>
          <div className="readability-row">
            <div className="readability-score">{da.readability.fleschScore}</div>
            <div className="readability-info">
              <span className="readability-label">{da.readability.label}</span>
              <span className="readability-scale">Flesch reading ease (0–100)</span>
            </div>
          </div>
          <div className="sentiment-row">
            <span className="sentiment-label">Sentiment</span>
            <span className={`sentiment-pill sentiment-${da.sentiment.label}`}>
              {da.sentiment.label}
            </span>
            <span className="sentiment-score">score {da.sentiment.score}</span>
            <span className="sentiment-detail">+{da.sentiment.positive} / −{da.sentiment.negative}</span>
          </div>
        </div>
      </div>

      {/* Keywords */}
      <div className="glass-card">
        <div className="glass-card-header"><Hash size={13} /> Top keywords (TF-IDF)</div>
        <div className="keyword-cloud">
          {da.keywords.map((k, i) => {
            const maxSize = da.keywords[0]?.score || 1;
            const size = 12 + (k.score / maxSize) * 14;
            const opacity = 0.5 + (k.score / maxSize) * 0.5;
            return (
              <span key={k.term} className="keyword-chip" style={{ fontSize: size, opacity }} title={`${k.count} occurrences · score ${k.score}`}>
                {k.term}
                <span className="keyword-count">{k.count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Entities */}
      <div className="grid-2">
        <div className="glass-card">
          <div className="glass-card-header"><Tag size={13} /> Detected entities</div>
          {da.entities.total === 0 ? (
            <p className="empty-note">No structured entities detected.</p>
          ) : (
            <div className="entity-list">
              {Object.entries(da.entities.entities).map(([kind, info]) => (
                <div key={kind} className="entity-row">
                  <div className="entity-head">
                    {ENTITY_ICONS[kind] || <Tag size={13} />}
                    <span className="entity-kind">{kind}</span>
                    <span className="entity-count">{info.count}</span>
                  </div>
                  <div className="entity-samples">
                    {info.samples.map((s, i) => <span key={i} className="entity-sample">{s}</span>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card">
          <div className="glass-card-header"><Quote size={13} /> Key passages</div>
          <div className="passage-list">
            {da.keyPassages.map((p, i) => (
              <div key={i} className="passage-row">
                <div className="passage-head">
                  <span className="passage-num">#{p.index}</span>
                  <span className="passage-density">density {p.density} · {p.length} words</span>
                </div>
                <p className="passage-text">{p.snippet}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Topic clusters */}
      <div className="glass-card">
        <div className="glass-card-header"><Layers size={13} /> Topic clusters (k-means)</div>
        {da.topics.length === 0 ? (
          <p className="empty-note">Not enough content for topic clustering.</p>
        ) : (
          <div className="topic-grid">
            {da.topics.map((t) => (
              <div key={t.topic} className={`topic-card ${expandedTopic === t.topic ? 'expanded' : ''}`} onClick={() => setExpandedTopic(expandedTopic === t.topic ? null : t.topic)}>
                <div className="topic-head">
                  <span className="topic-num">Topic {t.topic}</span>
                  <span className="topic-count">{t.paragraphCount} paragraphs</span>
                </div>
                <div className="topic-keywords">
                  {t.keywords.map((k) => <span key={k} className="topic-keyword">{k}</span>)}
                </div>
                {expandedTopic === t.topic && (
                  <p className="topic-representative">{t.representative}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sample paragraphs */}
      <div className="glass-card">
        <div className="glass-card-header"><FileText size={13} /> Sample passages</div>
        <div className="sample-paragraphs">
          {da.sampleParagraphs.map((p, i) => (
            <p key={i} className="sample-paragraph">
              <span className="sample-marker">§{i + 1}</span>
              {p}
            </p>
          ))}
        </div>
      </div>

      {/* Extracted tables (PDF/Word only) */}
      {tables && tables.length > 0 && (
        <div className="glass-card">
          <div className="glass-card-header"><Layers size={13} /> Tables detected in document ({tables.length})</div>
          <div className="doc-table-list">
            {tables.map((t, ti) => (
              <div key={ti} className="doc-table-block">
                <div className="doc-table-head">
                  Table {ti + 1} · {t.rows.length} rows × {t.headers.length} cols
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>{t.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {t.rows.slice(0, 50).map((r, ri) => (
                        <tr key={ri}>
                          {t.headers.map((h, ci) => <td key={ci}>{String(r[h] ?? '')}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {t.rows.length > 50 && (
                  <p className="preview-foot">Showing 50 of {t.rows.length} rows</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
