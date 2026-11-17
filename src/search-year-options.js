function parseDatabaseYear(value) {
  if (Number.isInteger(value)) return value;
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})(?:[-/.]|$)/);
  return match ? Number(match[1]) : null;
}

/**
 * Build the year selector from values actually stored in the catalogue.
 * Missing years are not fabricated and values outside the supported range
 * are never rendered.
 */
export function buildSearchYearOptions(groups = [], {
  minimumYear = 1870,
  maximumYear = new Date().getFullYear()
} = {}) {
  const years = new Set();
  const values = Array.isArray(groups) ? groups.flat(Infinity) : [];
  for (const value of values) {
    const year = parseDatabaseYear(value);
    if (Number.isInteger(year) && year >= minimumYear && year <= maximumYear) {
      years.add(year);
    }
  }
  const sorted = [...years].sort((a, b) => b - a);
  return {
    years: sorted,
    oldestYear: sorted.length ? sorted[sorted.length - 1] : null,
    newestYear: sorted.length ? sorted[0] : null
  };
}
