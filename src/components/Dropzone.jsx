import React, { useRef, useState } from "react";
import { parseCsvFile } from "../lib/csv.js";

export default function Dropzone({ label, hint, fileName, rowCount, onLoaded, error }) {
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    try {
      const { headers, rows } = await parseCsvFile(file);
      onLoaded({ file, headers, rows });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        className={`dropzone${dragging ? " dropzone--active" : ""}${
          fileName ? " dropzone--filled" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {busy ? (
          <div className="dropzone__text">Parsing…</div>
        ) : fileName ? (
          <div>
            <div className="dropzone__filename">{fileName}</div>
            <div className="dropzone__meta">
              {rowCount} row{rowCount === 1 ? "" : "s"} loaded — click or drop to replace
            </div>
          </div>
        ) : (
          <div>
            <div className="dropzone__text">{label}</div>
            <div className="dropzone__meta">{hint || "Drag & drop a CSV, or click to browse"}</div>
          </div>
        )}
      </div>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
