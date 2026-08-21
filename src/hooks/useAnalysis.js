// ─────────────────────────────────────────────────────────────────────────
// InsightIQ — useAnalysis orchestration hook
//
// Pipeline: parse → clean → compute statistics → compute quality →
//           generate deterministic insights → build chart bundle →
//           index the RAG store → request a narrative from the engine.
//
// Every step before "narrative" is deterministic and offline-safe.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from 'react';
import { parseFile } from '../lib/parseFile.js';
import { cleanDataset } from '../lib/dataCleaner.js';
import { computeStatistics } from '../lib/statistics.js';
import { computeQualityScore } from '../lib/qualityScore.js';
import { generateInsights } from '../lib/insights.js';
import { buildChartBundle } from '../lib/chartData.js';
import { analyzeDocument } from '../lib/documentAnalysis.js';
import { RetrievalPipeline } from '../rag/retrieval.js';
import { generateNarrative } from '../engine/generate.js';
import { addHistoryEntry } from '../lib/history.js';

export function useAnalysis() {
  const [parsed, setParsed] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [error, setError] = useState('');
  const [narrative, setNarrative] = useState('');
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const pipelineRef = useRef(new RetrievalPipeline());

  const loadFile = useCallback(async (file) => {
    setError('');
    setLoadingMsg('Parsing file…');
    try {
      const result = await parseFile(file);
      if (!result.rows.length) {
        setError('The file is empty or could not be parsed.');
        return null;
      }
      setParsed(result);
      return result;
    } catch (e) {
      setError(`Could not read file: ${e.message}`);
      return null;
    }
  }, []);

  const loadPasted = useCallback((text) => {
    setError('');
    if (!text || !text.trim()) {
      setError('Nothing to parse — paste some CSV / TSV text first.');
      return null;
    }
    const fakeFile = new File([text], 'pasted_data.csv', { type: 'text/csv' });
    return loadFile(fakeFile);
  }, [loadFile]);

  const run = useCallback(async (overrideParsed) => {
    const source = overrideParsed || parsed;
    if (!source) return;
    setError('');
    setAnalysis(null);
    setNarrative('');
    setLoading(true);

    try {
      // 1. Clean
      setLoadingMsg('Cleaning & profiling data…');
      const cleaned = cleanDataset(source.rows, source.headers, { imputeNulls: true, dropDuplicates: true });

      // 2. Stats — attach rows + headers so the OLAP insights engine can
      // run business-focused aggregations (Top-N, Pareto, period-over-period)
      setLoadingMsg('Computing statistics…');
      const stats = computeStatistics(cleaned.rows, cleaned.headers, cleaned.columnProfiles);
      stats.rows = cleaned.rows;
      stats.headers = cleaned.headers;
      stats.columnProfiles = cleaned.columnProfiles;

      // 3. Quality score
      setLoadingMsg('Scoring data quality…');
      const quality = computeQualityScore({ ...stats, _duplicateRows: cleaned.duplicateRows });
      stats.dataQualityScore = quality.score;
      stats.duplicateRows = cleaned.duplicateRows;

      // 4. Insights (deterministic)
      setLoadingMsg('Generating insights…');
      const insights = generateInsights(stats);

      // 5. Chart bundle
      setLoadingMsg('Building visualisations…');
      const chartBundle = buildChartBundle(cleaned.rows, cleaned.headers, cleaned.columnProfiles, stats);

      const assembled = {
        meta: source.meta,
        cleaned,
        stats,
        quality,
        insights,
        chartBundle,
      };

      // 6. Document analysis — run for ANY file that has rawText (PDFs,
      // Word docs, even large CSVs / TXT files). The Document tab
      // activates whenever documentAnalysis exists. For PDF/Word the
      // kind is always 'document' so this always runs.
      if (source.rawText && source.rawText.length > 100) {
        setLoadingMsg('Analysing document structure…');
        try {
          const da = analyzeDocument(source.rawText, source.meta.fileName);
          assembled.documentAnalysis = da;
        } catch (e) {
          console.warn('Document analysis failed:', e);
        }
      }
      // Expose extracted tables (PDF/Word) on the assembled analysis.
      if (source.meta.tables && source.meta.tables.length) {
        assembled.tables = source.meta.tables;
      }

      // 7. Index RAG store
      setLoadingMsg('Indexing for retrieval…');
      const indexed = pipelineRef.current.index(assembled);

      // 8. Surface dashboard immediately
      setAnalysis(assembled);
      setLoading(false);
      setLoadingMsg('');

      // 9. Record in history
      try {
        addHistoryEntry(assembled);
      } catch (e) {
        console.warn('History save failed:', e);
      }

      // 10. Request narrative (async, non-blocking)
      setNarrativeLoading(true);
      try {
        const text = await generateNarrative(assembled);
        setNarrative(text);
      } catch {
        setNarrative(insights.executiveSummary);
      } finally {
        setNarrativeLoading(false);
      }

      return { assembled, indexed };
    } catch (e) {
      setError(`Analysis failed: ${e.message}`);
      setLoading(false);
      setLoadingMsg('');
      return null;
    }
  }, [parsed]);

  const reset = useCallback(() => {
    setParsed(null);
    setAnalysis(null);
    setNarrative('');
    setError('');
    setNarrativeLoading(false);
    setLoading(false);
    setLoadingMsg('');
  }, []);

  return {
    parsed,
    analysis,
    loading,
    loadingMsg,
    error,
    narrative,
    narrativeLoading,
    pipeline: pipelineRef.current,
    loadFile,
    loadPasted,
    run,
    reset,
    setError,
  };
}
