export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Ghost Shelf mark">
      <rect x="8" y="10" width="8" height="30" fill="currentColor" />
      <rect x="21" y="12" width="7" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="4 3" />
      <rect x="32" y="8" width="8" height="32" fill="currentColor" />
      <rect x="4" y="40" width="40" height="3" fill="currentColor" />
    </svg>
  );
}
