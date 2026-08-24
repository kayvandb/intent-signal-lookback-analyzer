import React from "react";

/**
 * Generic "map your CSV headers to these roles" control.
 * fields: [{ key, label, help, type }]
 */
export default function ColumnMapper({ headers, fields, mapping, onChange, previewRows }) {
  return (
    <div className="mapper">
      <div className="mapper__grid">
        {fields.map((field) => (
          <div className="mapper__field" key={field.key}>
            <label className="mapper__label" htmlFor={`map-${field.key}`}>
              {field.label}
              {field.required !== false && <span className="required">*</span>}
            </label>
            <select
              id={`map-${field.key}`}
              value={mapping[field.key] || ""}
              onChange={(e) => onChange(field.key, e.target.value)}
            >
              <option value="">— select column —</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            {field.help && <div className="mapper__help">{field.help}</div>}
          </div>
        ))}
      </div>

      {previewRows && previewRows.length > 0 && (
        <div className="preview-table-wrap">
          <table className="preview-table">
            <thead>
              <tr>
                {headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.slice(0, 3).map((row, i) => (
                <tr key={i}>
                  {headers.map((h) => (
                    <td key={h}>{String(row[h] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
