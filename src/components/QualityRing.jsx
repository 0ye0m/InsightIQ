// InsightIQ — animated quality ring
export function QualityRing({ score, size = 110 }) {
  const r = (size - 16) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score || 0));
  const fill = (clamped / 100) * c;
  const color = clamped >= 80 ? '#4ADE80' : clamped >= 60 ? '#FF8C42' : '#FF5A5A';
  const label = clamped >= 80 ? 'Excellent' : clamped >= 60 ? 'Good' : 'Needs Work';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${fill} ${c - fill}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(0.4, 0, 0.2, 1)' }} />
        <text x={size / 2} y={size / 2 - 2} textAnchor="middle" fontSize={size * 0.22}
          fontWeight={800} fill="var(--text)" fontFamily="Inter">{Math.round(clamped)}</text>
        <text x={size / 2} y={size / 2 + size * 0.14} textAnchor="middle"
          fontSize={size * 0.07} fill="var(--text-muted)" fontFamily="Inter">/ 100</text>
      </svg>
      <span className={`badge ${clamped >= 80 ? 'badge-green' : clamped >= 60 ? 'badge-orange' : 'badge-red'}`}>{label}</span>
    </div>
  );
}
