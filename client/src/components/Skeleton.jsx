/**
 * Skeleton placeholder shapes for loading states.
 * Uses the `pulse` keyframe already defined in index.css.
 */

const base = {
  background: '#e5e7eb',
  borderRadius: 6,
  animation: 'pulse 1.4s ease-in-out infinite',
  flexShrink: 0,
};

/** Single rectangular block */
export function SkeletonBlock({ width = '100%', height = 16, radius = 6, style }) {
  return <div style={{ ...base, width, height, borderRadius: radius, ...style }} />;
}

/** A row of label + value, typical for card metadata */
export function SkeletonRow({ labelWidth = 80, valueWidth = 140, height = 13, style }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, ...style }}>
      <div style={{ ...base, width: labelWidth, height }} />
      <div style={{ ...base, width: valueWidth, height }} />
    </div>
  );
}

/**
 * A card-shaped skeleton with a title line and 2–4 body rows.
 * Pass `rows` to control how many body lines to show.
 */
export function SkeletonCard({ rows = 3, style }) {
  return (
    <div style={{
      background: '#fff',
      borderRadius: 12,
      padding: '16px 18px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      ...style,
    }}>
      <SkeletonBlock width="55%" height={16} />
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBlock key={i} width={i % 2 === 0 ? '80%' : '65%'} height={12} />
      ))}
    </div>
  );
}

/** Stack of N card skeletons */
export function SkeletonList({ count = 4, rows = 3, gap = 10, cardStyle }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} rows={rows} style={cardStyle} />
      ))}
    </div>
  );
}

/** Horizontal row of stat-box skeletons, e.g. KPI cards */
export function SkeletonStatRow({ count = 4, style }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', ...style }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          ...base,
          flex: '1 1 120px',
          height: 72,
          borderRadius: 12,
        }} />
      ))}
    </div>
  );
}
