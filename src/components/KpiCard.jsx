// InsightIQ — KPI card with animated counter
import { useEffect, useState, useRef } from 'react';

export function KpiCard({ kpi }) {
  const [display, setDisplay] = useState('');
  const raf = useRef();

  useEffect(() => {
    // Detect a numeric value to animate; otherwise just show the string.
    const numeric = String(kpi.value).replace(/[^0-9.\-]/g, '');
    const num = parseFloat(numeric);
    const hasNonNumeric = String(kpi.value).replace(/[0-9.\-,]/g, '').trim().length > 0;
    if (isNaN(num) || hasNonNumeric) {
      setDisplay(String(kpi.value));
      return;
    }
    const duration = 900;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = num * eased;
      let formatted;
      if (Number.isInteger(num)) {
        formatted = Math.round(cur).toLocaleString();
      } else {
        formatted = cur.toFixed(2);
      }
      // reattach any non-numeric suffix/prefix (e.g. %)
      const prefix = String(kpi.value).match(/^[^0-9.\-]+/)?.[0] || '';
      const suffix = String(kpi.value).match(/[^0-9.\-]+$/)?.[0] || '';
      setDisplay(prefix + formatted + suffix);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [kpi.value]);

  const trendIcon = kpi.trend === 'up' ? '↑' : kpi.trend === 'down' ? '↓' : '—';
  return (
    <div className="glass-card kpi-card">
      <div className="glass-card-header">{kpi.label}</div>
      <div className="kpi-value">{display}</div>
      <div className={`kpi-trend ${kpi.trend || 'neutral'}`}>
        {trendIcon} {kpi.sub}
      </div>
    </div>
  );
}
