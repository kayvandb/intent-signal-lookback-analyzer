/**
 * Lenient date parsing for messy CSV exports.
 * Supports ISO (YYYY-MM-DD), US (M/D/YYYY), and a few common variants.
 * Returns a Date at UTC midnight, or null if unparseable.
 */
export function parseDate(value) {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;

  // ISO: 2024-03-15 or 2024-03-15T00:00:00Z
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return toUtcDate(+y, +m, +d);
  }

  // US slash format: 3/15/2024 or 03/15/24
  const us = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    let [, m, d, y] = us;
    y = y.length === 2 ? 2000 + +y : +y;
    return toUtcDate(+y, +m, +d);
  }

  // Dash format: 03-15-2024
  const dash = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    const [, m, d, y] = dash;
    return toUtcDate(+y, +m, +d);
  }

  // Fallback to native parsing (handles "March 15, 2024" etc.)
  const native = new Date(str);
  if (!isNaN(native.getTime())) {
    return toUtcDate(
      native.getFullYear(),
      native.getMonth() + 1,
      native.getDate()
    );
  }

  return null;
}

function toUtcDate(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(d.getTime())) return null;
  return d;
}

export function daysBetween(dateA, dateB) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return (dateA.getTime() - dateB.getTime()) / msPerDay;
}

export function formatDate(date) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}
