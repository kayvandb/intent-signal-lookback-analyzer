import { parseDate } from "./dates.js";

/**
 * Applies a { fieldKey: headerName } mapping to raw CSV row objects and
 * coerces value/date fields. Rows that fail to coerce are dropped and
 * counted so the UI can surface data-quality issues transparently.
 */
export function mapRows(rawRows, mapping, roleTypes) {
  const rows = [];
  let skipped = 0;

  for (const raw of rawRows) {
    const out = {};
    let ok = true;

    for (const [field, type] of Object.entries(roleTypes)) {
      const header = mapping[field];
      const rawValue = header ? raw[header] : undefined;

      if (type === "text") {
        const str = rawValue === undefined || rawValue === null ? "" : String(rawValue).trim();
        if (!str) {
          ok = false;
          break;
        }
        out[field] = str;
      } else if (type === "number") {
        const num = Number(String(rawValue ?? "").replace(/[,$%]/g, "").trim());
        if (!Number.isFinite(num)) {
          ok = false;
          break;
        }
        out[field] = num;
      } else if (type === "date") {
        const date = parseDate(rawValue);
        if (!date) {
          ok = false;
          break;
        }
        out[field] = date;
      }
    }

    if (ok) rows.push(out);
    else skipped++;
  }

  return { rows, skipped };
}

export function isMappingComplete(mapping, fields) {
  return fields.every((f) => f.required === false || mapping[f.key]);
}
