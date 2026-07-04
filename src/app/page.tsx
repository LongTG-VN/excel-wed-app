// src/app/page.tsx
"use client";

import { useState, useRef, useCallback } from "react";

interface OrderEntry {
  "Ngày đặt": string;
  "Tên": string;
  "Kích thước": string;
  "Số lượng": number | string;
  "Chất liệu": string;
  "Dòng chữ quét được": string;
  "File gốc": string;
}

type Tab = "topTable" | "bottomTable";
type InputMode = "ocrZip" | "importJson";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [orders, setOrders] = useState<OrderEntry[] | null>(null);
  const [templateName, setTemplateName] = useState<string>("Mặc định (template.xlsx)");
  const [templateBase64, setTemplateBase64] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("topTable");
  const [inputMode, setInputMode] = useState<InputMode>("ocrZip");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  
  const jsonFileRef = useRef<HTMLInputElement>(null);
  const zipFileRef = useRef<HTMLInputElement>(null);
  const xlsxFileRef = useRef<HTMLInputElement>(null);

  // Parse ZIP of Zalo images via backend Python OCR
  const handleZipUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith(".zip")) {
      setError("Vui lòng tải lên file nén ZIP (.zip) chứa ảnh thiết kế Zalo.");
      return;
    }
    setError("");
    setSuccessMsg("");
    setLoading(true);
    setOrders(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Lỗi xử lý quét OCR trên server.");
      }

      const data = await res.json();
      if (data.orders && Array.isArray(data.orders)) {
        setOrders(data.orders);
        setSuccessMsg(`Đã nhận diện & trích xuất thành công ${data.orders.length} đơn hàng từ ảnh!`);
      } else {
        throw new Error("Không nhận diện được đơn hàng nào hợp lệ.");
      }
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi khi quét OCR.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Parse pre-parsed JSON file
  const handleJsonUpload = useCallback((file: File) => {
    if (!file.name.endsWith(".json")) {
      setError("Vui lòng tải lên file JSON (.json) chứa dữ liệu đã làm sạch.");
      return;
    }
    setError("");
    setSuccessMsg("");
    setLoading(true);
    setOrders(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          setOrders(parsed);
          setSuccessMsg(`Đã tải thành công ${parsed.length} đơn hàng từ tệp JSON.`);
        } else {
          setError("File JSON phải chứa một mảng các đơn hàng.");
        }
      } catch (err: any) {
        setError("Lỗi parse file JSON: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError("Lỗi đọc file JSON.");
      setLoading(false);
    };
    reader.readAsText(file);
  }, []);

  // Parse custom XLSX template
  const handleXlsxUpload = useCallback((file: File) => {
    if (!file.name.endsWith(".xlsx")) {
      setError("Vui lòng tải lên file Excel (.xlsx) làm mẫu.");
      return;
    }
    setError("");
    setSuccessMsg("");

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        setTemplateBase64(base64);
        setTemplateName(file.name);
        setSuccessMsg(`Đã tải tệp mẫu tùy chỉnh: ${file.name}`);
      } catch (err: any) {
        setError("Lỗi đọc file Excel mẫu: " + err.message);
      }
    };
    reader.onerror = () => {
      setError("Lỗi đọc file template Excel.");
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // Export to template Excel
  const handleExport = async () => {
    if (!orders || orders.length === 0) return;
    setExporting(true);
    setError("");
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orders,
          templateBase64,
        }),
      });
      
      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || "Lỗi khi xuất file Excel");
      }
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = templateName.includes("template.xlsx") ? "CD-1 2026_populated.xlsx" : templateName.replace(/\.xlsx$/i, "_populated.xlsx");
      a.click();
      URL.revokeObjectURL(url);
      setSuccessMsg("Đã xuất file Excel thành công!");
    } catch (e: any) {
      setError(e.message || "Đã xảy ra lỗi khi tạo Excel.");
    } finally {
      setExporting(false);
    }
  };

  // Grouping for preview
  const topOrders = orders ? orders.filter(o => {
    const mat = o["Chất liệu"] || "";
    return mat === "Rồng Lưng Xám" || mat === "Không rõ";
  }) : [];
  
  const bottomOrders = orders ? orders.filter(o => {
    const mat = o["Chất liệu"] || "";
    return mat !== "Rồng Lưng Xám" && mat !== "Không rõ";
  }) : [];

  // Helper to calculate area for preview
  const calcArea = (o: OrderEntry) => {
    const dimStr = o["Kích thước"] || "";
    let n = 0.0;
    let c = 0.0;
    if (dimStr) {
      const parts = dimStr.toLowerCase().split("x");
      if (parts.length >= 2) {
        n = parseFloat(parts[0].trim()) / 100.0;
        c = parseFloat(parts[1].trim()) / 100.0;
      }
    }
    const sl = parseInt(String(o["Số lượng"] || 1));
    return Math.round(n * c * sl * 100) / 100;
  };

  return (
    <main>
      <header>
        <div className="header-inner">
          <span className="logo">📊</span>
          <div>
            <h1>Công Cụ Điền Excel Tự Động</h1>
            <p className="subtitle">Quét ảnh Zalo và xuất Excel trực tiếp lên file Template mẫu</p>
          </div>
        </div>
      </header>

      <section className="container">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
          
          {/* 1. Left upload box: clean data input */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ color: "#fff", marginBottom: "16px", fontSize: "1rem" }}>Bước 1: Nhập dữ liệu đơn hàng</h3>
            
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <button
                className={`tab ${inputMode === "ocrZip" ? "active" : ""}`}
                style={{ flex: 1, padding: "8px", borderRadius: "4px" }}
                onClick={() => setInputMode("ocrZip")}
              >
                Quét ZIP ảnh Zalo
              </button>
              <button
                className={`tab ${inputMode === "importJson" ? "active" : ""}`}
                style={{ flex: 1, padding: "8px", borderRadius: "4px" }}
                onClick={() => setInputMode("importJson")}
              >
                Nhập file JSON
              </button>
            </div>

            {inputMode === "ocrZip" ? (
              <div
                className="drop-zone"
                style={{ padding: "24px 16px" }}
                onClick={() => zipFileRef.current?.click()}
              >
                <input
                  ref={zipFileRef}
                  type="file"
                  accept=".zip"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && handleZipUpload(e.target.files[0])}
                />
                <div className="drop-icon" style={{ fontSize: "2.5rem" }}>🖼️</div>
                <p className="drop-title" style={{ fontSize: "0.95rem" }}>Chọn file nén ZIP chứa ảnh</p>
                <p className="drop-hint" style={{ fontSize: "0.8rem" }}>Kéo thả file ZIP ảnh tải từ Zalo</p>
              </div>
            ) : (
              <div
                className="drop-zone"
                style={{ padding: "24px 16px" }}
                onClick={() => jsonFileRef.current?.click()}
              >
                <input
                  ref={jsonFileRef}
                  type="file"
                  accept=".json"
                  style={{ display: "none" }}
                  onChange={(e) => e.target.files?.[0] && handleJsonUpload(e.target.files[0])}
                />
                <div className="drop-icon" style={{ fontSize: "2.5rem" }}>🔑</div>
                <p className="drop-title" style={{ fontSize: "0.95rem" }}>Chọn file dữ liệu cleaned_data.json</p>
                <p className="drop-hint" style={{ fontSize: "0.8rem" }}>Dành cho dữ liệu đã làm sạch sẵn</p>
              </div>
            )}
            
            {orders && (
              <p style={{ marginTop: "12px", color: "var(--accent2)", fontWeight: "bold", fontSize: "0.85rem", textAlign: "center" }}>
                ✓ Đang tải {orders.length} đơn hàng
              </p>
            )}
          </div>

          {/* 2. Right upload box: template file */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", padding: "20px" }}>
            <h3 style={{ color: "#fff", marginBottom: "16px", fontSize: "1rem" }}>Bước 2: Chọn tệp Excel mẫu mẫu</h3>
            
            <div
              className="drop-zone"
              style={{ padding: "43px 16px" }}
              onClick={() => xlsxFileRef.current?.click()}
            >
              <input
                ref={xlsxFileRef}
                type="file"
                accept=".xlsx"
                style={{ display: "none" }}
                onChange={(e) => e.target.files?.[0] && handleXlsxUpload(e.target.files[0])}
              />
              <div className="drop-icon" style={{ fontSize: "2.5rem" }}>📗</div>
              <p className="drop-title" style={{ fontSize: "0.95rem" }}>Chọn file Excel mẫu (.xlsx)</p>
              <p className="drop-hint" style={{ fontSize: "0.8rem" }}>Để trống nếu muốn sử dụng mẫu mặc định</p>
            </div>
            
            <p style={{ marginTop: "12px", color: "var(--gold)", fontWeight: "bold", fontSize: "0.85rem", textAlign: "center" }}>
              📄 Mẫu: {templateName}
            </p>
          </div>

        </div>

        {loading && (
          <div className="spinner-wrap" style={{ margin: "32px 0" }}>
            <div className="spinner" />
            <p style={{ color: "var(--accent)", fontWeight: "bold" }}>Đang quét AI OCR và bóc tách nội dung hình ảnh... Có thể mất 1-2 phút...</p>
          </div>
        )}

        {error && <div className="error-box">❌ {error}</div>}
        {successMsg && <div style={{ marginTop: "16px", background: "#1b2c1c", border: "1px solid #165c20", padding: "12px 16px", borderRadius: "8px", color: "var(--accent2)" }}>✓ {successMsg}</div>}

        {orders && !loading && (
          <div className="result-section">
            {/* Stats row */}
            <div className="stats-row">
              <div className="stat-card" style={{ borderTopColor: "#3b82f6" }}>
                <div className="stat-val" style={{ color: "#3b82f6" }}>{topOrders.filter(o => o["Chất liệu"] === "Rồng Lưng Xám").length}</div>
                <div className="stat-label">Rồng Lưng Xám</div>
              </div>
              <div className="stat-card" style={{ borderTopColor: "#60a5fa" }}>
                <div className="stat-val" style={{ color: "#60a5fa" }}>{topOrders.filter(o => o["Chất liệu"] === "Không rõ").length}</div>
                <div className="stat-label">Không Rõ (Bảng Trên)</div>
              </div>
              <div className="stat-card" style={{ borderTopColor: "#10b981" }}>
                <div className="stat-val" style={{ color: "#10b981" }}>{bottomOrders.filter(o => o["Chất liệu"] === "Decal").length}</div>
                <div className="stat-label">Decal</div>
              </div>
              <div className="stat-card" style={{ borderTopColor: "#34d399" }}>
                <div className="stat-val" style={{ color: "#34d399" }}>{bottomOrders.filter(o => o["Chất liệu"] !== "Decal").length}</div>
                <div className="stat-label">Đặc biệt khác (Bảng Dưới)</div>
              </div>
            </div>

            {/* Export row */}
            <div className="export-row">
              <button
                className="btn-export"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? "⏳ Đang xuất Excel..." : "⬇ Xuất Excel"}
              </button>
              <span className="export-note">Ghi đè trực tiếp vào file mẫu, tự động xóa dòng thừa và gộp ô.</span>
            </div>

            {/* Tabs */}
            <div className="tabs">
              <button
                className={`tab ${activeTab === "topTable" ? "active" : ""}`}
                onClick={() => setActiveTab("topTable")}
              >
                Bảng trên (Rồng & Không rõ)
                <span className="badge">{topOrders.length}</span>
              </button>
              <button
                className={`tab ${activeTab === "bottomTable" ? "active" : ""}`}
                onClick={() => setActiveTab("bottomTable")}
              >
                Bảng dưới (Decal & Khác)
                <span className="badge">{bottomOrders.length}</span>
              </button>
            </div>

            {/* Table Preview */}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ngày đặt</th>
                    <th>Tên thiết kế</th>
                    <th>Ngang (m)</th>
                    <th>Cao (m)</th>
                    <th>Số lượng</th>
                    <th>Chất liệu</th>
                    <th>Diện tích (m²)</th>
                  </tr>
                </thead>
                <tbody>
                  {(activeTab === "topTable" ? topOrders : bottomOrders).map((o, idx) => {
                    const area = calcArea(o);
                    return (
                      <tr key={idx}>
                        <td>{o["Ngày đặt"] ? o["Ngày đặt"].substring(5) : ""}</td>
                        <td className="td-name">{o["Tên"]}</td>
                        <td>{(parseFloat(o["Kích thước"].split("x")[0]) / 100).toFixed(2)}</td>
                        <td>{(parseFloat(o["Kích thước"].split("x")[1]) / 100).toFixed(2)}</td>
                        <td>{o["Số lượng"]}</td>
                        <td className="td-loai">{o["Chất liệu"]}</td>
                        <td>{area.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
