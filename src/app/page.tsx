"use client";

import { useState, useRef, useCallback } from "react";
import { FileEntry, ParseResult } from "@/lib/parser";
import JSZip from "jszip"; // Import thêm jszip ở client
import { parseZipFileList } from "@/lib/parser";
type Tab = "anPhu" | "anPhuOther" | "caiDau" | "caiDauOther" | "errors";

function calcDT(e: FileEntry) {
  return Math.round(e.soLuong * e.width * e.height * 100) / 100;
}

function DataTable({ entries }: { entries: FileEntry[] }) {
  if (entries.length === 0)
    return <p className="empty-msg">Không có dữ liệu</p>;

  const total0 = entries
    .filter((e) => e.loai === 0)
    .reduce((s, e) => s + calcDT(e), 0);
  const total1 = entries
    .filter((e) => e.loai === 1)
    .reduce((s, e) => s + calcDT(e), 0);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {["STT", "Tháng", "Tên", "NG (m)", "Cao (m)", "SL", "Loại", "M2 Thường", "M2 Dày"].map(
              (h) => (
                <th key={h}>{h}</th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => {
            const dt = calcDT(e);
            return (
              <tr key={i} className={e.loai === 1 ? "row-day" : ""}>
                <td>{e.stt}</td>
                <td>{e.month}</td>
                <td className="td-name">{e.name}</td>
                <td>{e.width}</td>
                <td>{e.height}</td>
                <td>{e.soLuong}</td>
                <td className="td-loai">{e.loai === 0 ? "Thường" : "Dày"}</td>
                <td>{e.loai === 0 ? dt.toFixed(2) : "—"}</td>
                <td>{e.loai === 1 ? dt.toFixed(2) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="row-total">
            <td colSpan={7}>Tổng Cộng</td>
            <td>{total0.toFixed(2)} m²</td>
            <td>{total1.toFixed(2)} m²</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function Home() {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("anPhu");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
  if (!file.name.endsWith(".zip")) {
    setError("Vui lòng upload file ZIP.");
    return;
  }
  setError("");
  setLoading(true);

  try {
    // 1. Đọc file trực tiếp tại Client
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const rootName = file.name.replace(/\.zip$/i, "");

    const filePaths: string[] = [];
    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir && !relativePath.includes(".git/")) {
        filePaths.push(relativePath);
      }
    });

    // 2. Chạy logic parse (Hàm này giờ chạy ở máy người dùng)
    const result = parseZipFileList(filePaths, rootName);

    // 3. Cập nhật state (Không cần qua API /api/parse nữa)
    setResult(result);
    setActiveTab("anPhu");
  } catch (e: any) {
    setError("Lỗi xử lý file: " + e.message);
  } finally {
    setLoading(false);
  }
}, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleExport = async () => {
    if (!result) return;
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: result }),
      });
      if (!res.ok) throw new Error("Lỗi khi tạo Excel");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "KetQua.zip";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const tabs: { key: Tab; label: string; count: number }[] = result
    ? [
        { key: "anPhu", label: "An Phú (1)", count: result.anPhu.length },
        { key: "anPhuOther", label: "An Phú (2)", count: result.anPhuOther.length },
        { key: "caiDau", label: "Cái Dầu (1)", count: result.caiDau.length },
        { key: "caiDauOther", label: "Cái Dầu (2)", count: result.caiDauOther.length },
        { key: "errors", label: "⚠ Lỗi", count: result.errors.length },
      ]
    : [];

  const tabData: Record<Tab, FileEntry[] | string[]> = result
    ? {
        anPhu: result.anPhu,
        anPhuOther: result.anPhuOther,
        caiDau: result.caiDau,
        caiDauOther: result.caiDauOther,
        errors: result.errors,
      }
    : { anPhu: [], anPhuOther: [], caiDau: [], caiDauOther: [], errors: [] };

  return (
    <main>
      <header>
        <div className="header-inner">
          <span className="logo">📊</span>
          <div>
            <h1>Bảng Kế Toán Tự Động</h1>
            <p className="subtitle">Upload folder ZIP → xuất Excel tức thì</p>
          </div>
        </div>
      </header>

      <section className="container">
        {/* Upload zone */}
        <div
          className={`drop-zone ${dragging ? "dragging" : ""} ${loading ? "loading" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
          />
          {loading ? (
            <div className="spinner-wrap">
              <div className="spinner" />
              <p>Đang phân tích tên file...</p>
            </div>
          ) : (
            <>
              <div className="drop-icon">📁</div>
              <p className="drop-title">Kéo thả file ZIP vào đây</p>
              <p className="drop-hint">hoặc click để chọn file</p>
              <p className="drop-note">
                Cấu trúc: <code>TênTháng.zip / 01.01 / AP TênSP 200x100.cdr</code>
              </p>
            </>
          )}
        </div>

        {error && <div className="error-box">❌ {error}</div>}

        {/* Kết quả */}
        {result && (
          <div className="result-section">
            {/* Stats */}
            <div className="stats-row">
              {[
                { label: "An Phú (1)", val: result.anPhu.length, color: "#3b82f6" },
                { label: "An Phú (2)", val: result.anPhuOther.length, color: "#60a5fa" },
                { label: "Cái Dầu (1)", val: result.caiDau.length, color: "#10b981" },
                { label: "Cái Dầu (2)", val: result.caiDauOther.length, color: "#34d399" },
                { label: "Lỗi", val: result.errors.length, color: "#f87171" },
              ].map((s) => (
                <div className="stat-card" key={s.label} style={{ borderTopColor: s.color }}>
                  <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
                  <div className="stat-label">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Export button */}
            <div className="export-row">
              <button
                className="btn-export"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? "⏳ Đang tạo file..." : "⬇ Xuất Excel (.zip)"}
              </button>
              <span className="export-note">Gồm AnPhu.xlsx + CaiDau.xlsx</span>
            </div>

            {/* Tabs */}
            <div className="tabs">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  className={`tab ${activeTab === t.key ? "active" : ""} ${t.key === "errors" && t.count > 0 ? "tab-error" : ""}`}
                  onClick={() => setActiveTab(t.key)}
                >
                  {t.label}
                  <span className="badge">{t.count}</span>
                </button>
              ))}
            </div>

            {/* Table or errors */}
            {activeTab === "errors" ? (
              <div className="error-list">
                {(tabData.errors as string[]).length === 0 ? (
                  <p className="empty-msg">✅ Không có file lỗi nào!</p>
                ) : (
                  <ul>
                    {(tabData.errors as string[]).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <DataTable entries={tabData[activeTab] as FileEntry[]} />
            )}
          </div>
        )}
      </section>
    </main>
  );
}
