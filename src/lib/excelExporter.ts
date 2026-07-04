// src/lib/excelExporter.ts
import ExcelJS from "exceljs";

export interface OrderEntry {
  "Ngày đặt": string;
  "Tên": string;
  "Kích thước": string;
  "Số lượng": number | string;
  "Chất liệu": string;
  "Dòng chữ quét được": string;
  "File gốc": string;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      // Input: YYYY-MM-DD -> Output: DD.MM
      const day = parts[2];
      const month = parts[1];
      return `${day}.${month}`;
    }
  } catch (e) {}
  return dateStr;
}

function shiftMerge(
  rangeStr: string,
  countTop: number,
  startTop: number,
  countBottom: number,
  startBottom: number
): string | null {
  const parts = rangeStr.split(":");
  if (parts.length !== 2) return null;
  
  const startCell = parts[0];
  const endCell = parts[1];
  
  let startRow = parseInt(startCell.replace(/^[A-Z]+/i, ""));
  let endRow = parseInt(endCell.replace(/^[A-Z]+/i, ""));
  const startCol = startCell.replace(/[0-9]+/g, "");
  const endCol = endCell.replace(/[0-9]+/g, "");
  
  // 1. Shift by countTop starting at startTop
  if (countTop > 0) {
    const endTop = startTop + countTop - 1;
    // Overlap check
    if (startRow >= startTop && startRow <= endTop) return null;
    if (endRow >= startTop && endRow <= endTop) return null;
    if (startRow < startTop && endRow > endTop) return null;
    
    if (startRow > endTop) {
      startRow -= countTop;
      endRow -= countTop;
    }
  }
  
  // 2. Shift by countBottom starting at startBottom
  if (countBottom > 0) {
    const endBottom = startBottom + countBottom - 1;
    // Overlap check
    if (startRow >= startBottom && startRow <= endBottom) return null;
    if (endRow >= startBottom && endRow <= endBottom) return null;
    if (startRow < startBottom && endRow > endBottom) return null;
    
    if (startRow > endBottom) {
      startRow -= countBottom;
      endRow -= countBottom;
    }
  }
  
  return `${startCol}${startRow}:${endCol}${endRow}`;
}

export async function buildExcelFromTemplate(
  orders: OrderEntry[],
  templateBuffer: Buffer
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);
  
  // Get active or first worksheet
  const sheet = workbook.worksheets[0] || workbook.addWorksheet("t5 (2)");
  
  // 1. Find the total rows dynamically by scanning Column B (Tên)
  let R_tc1 = 220; // Default fallback for TỔNG CỘNG (1)
  let R_tt = 257;  // Default fallback for TỔNG TIỀN
  
  const maxRowToScan = Math.min(sheet.maxRow, 500);
  for (let r = 1; r <= maxRowToScan; r++) {
    const cellVal = sheet.getCell(`B${r}`).value;
    if (cellVal && typeof cellVal === "string") {
      const valStr = cellVal.trim().toUpperCase();
      if (valStr.includes("TỔNG CỘNG (1)")) {
        R_tc1 = r;
      } else if (valStr.includes("TỔNG TIỀN")) {
        R_tt = r;
      }
    }
  }
  
  console.log(`Detected template structure: TỔNG CỘNG (1) at row ${R_tc1}, TỔNG TIỀN at row ${R_tt}`);

  // 2. Group orders
  const topOrders: OrderEntry[] = [];
  const bottomOrders: OrderEntry[] = [];
  
  for (const order of orders) {
    const material = order["Chất liệu"] || "";
    if (material === "Rồng Lưng Xám" || material === "Không rõ") {
      topOrders.push(order);
    } else {
      bottomOrders.push(order);
    }
  }
  
  console.log(`Exporting: ${topOrders.length} top orders, ${bottomOrders.length} bottom orders.`);

  // 3. Save original merges and clear them from sheet model
  const originalMerges = sheet.model && sheet.model.merges ? [...sheet.model.merges] : [];
  if (sheet.model) {
    sheet.model.merges = [];
  }

  // 4. Unmerge B (Tên) only inside active data ranges to avoid write display issues
  // We do this by filtering out merges that are in active ranges
  const activeMergesToKeep: string[] = [];
  for (const rangeStr of originalMerges) {
    const parts = rangeStr.split(":");
    if (parts.length === 2) {
      const startRow = parseInt(parts[0].replace(/^[A-Z]+/i, ""));
      const endRow = parseInt(parts[1].replace(/^[A-Z]+/i, ""));
      
      const inTopTableData = startRow >= 3 && endRow <= R_tc1 - 1;
      const inBottomTableData = startRow >= R_tc1 + 2 && endRow <= R_tt - 1;
      
      // If the merge is NOT inside data ranges, we keep it to shift later.
      // If it IS inside data ranges, we discard it (which effectively unmerges it!).
      if (!inTopTableData && !inBottomTableData) {
        activeMergesToKeep.push(rangeStr);
      }
    }
  }

  // 5. Populate Top Table (Rows 3 to 3 + N - 1)
  const N = topOrders.length;
  for (let idx = 0; idx < N; idx++) {
    const rowIdx = 3 + idx;
    const order = topOrders[idx];
    const dateFormatted = formatDate(order["Ngày đặt"]);
    const nameVal = order["Tên"] || "";
    
    // Parse dimensions (cm to meters)
    const dimStr = order["Kích thước"] || "";
    let ngangVal = 0.0;
    let caoVal = 0.0;
    if (dimStr) {
      const parts = dimStr.toLowerCase().split("x");
      if (parts.length >= 2) {
        ngangVal = parseFloat(parts[0].trim()) / 100.0;
        caoVal = parseFloat(parts[1].trim()) / 100.0;
      }
    }
    
    const slVal = parseInt(String(order["Số lượng"] || 1));
    
    // Check if "vải dày"
    const ocrText = (order["Dòng chữ quét được"] || "").toLowerCase();
    const fileName = (order["File gốc"] || "").toLowerCase();
    const isThick = ["dày", "dầy", "day", "dey"].some(k => 
      ocrText.includes(k) || fileName.includes(k) || nameVal.toLowerCase().includes(k)
    );
    const loaiVal = isThick ? 2 : 1;
    
    const row = sheet.getRow(rowIdx);
    row.getCell(1).value = dateFormatted;
    row.getCell(2).value = nameVal;
    row.getCell(3).value = ngangVal;
    row.getCell(4).value = caoVal;
    row.getCell(5).value = slVal;
    row.getCell(6).value = loaiVal;
    
    // Formulas
    row.getCell(7).value = { formula: `ROUND(C${rowIdx}*D${rowIdx}*E${rowIdx},2)` };
    row.getCell(8).value = { formula: `IF(F${rowIdx}=1,G${rowIdx},"")` };
    row.getCell(9).value = { formula: `IF(F${rowIdx}=2,G${rowIdx},"")` };
    row.getCell(10).value = { formula: `IF(F${rowIdx}<>"",IF(OR(AND(F${rowIdx}=1,G${rowIdx}=H${rowIdx}),AND(F${rowIdx}=2,G${rowIdx}=I${rowIdx})),"ok","xxxxxx"),"---")` };
    row.getCell(11).value = { formula: `IF(F${rowIdx}<>"",IF(SUM(H${rowIdx}:I${rowIdx})<9,"-","NNNNN"),"")` };
    
    row.getCell(12).value = order["Chất liệu"] || "";
    
    row.commit();
  }

  // 6. Delete unused top table rows (range: 3 + N to R_tc1 - 1)
  const startClearTop = 3 + N;
  const countTop = (R_tc1 - 1) - startClearTop + 1;
  if (countTop > 0) {
    console.log(`Deleting ${countTop} unused rows from Top Table (starting from row ${startClearTop})`);
    for (let r = startClearTop; r <= R_tc1 - 1; r++) {
      const row = sheet.getRow(r);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.value = null;
      });
      row.commit();
    }
    sheet.spliceRows(startClearTop, countTop);
  }

  // Adjust coordinates after top table row deletion
  const newTc1Row = 3 + N;
  const newTc2Row = newTc1Row + 1;
  const startBottomRow = newTc1Row + 2;
  const newTtRowBefore = R_tt - (countTop > 0 ? countTop : 0);

  // 7. Update SUM formulas in the TỔNG CỘNG (1) row
  console.log(`Updating TỔNG CỘNG (1) formulas at row ${newTc1Row}`);
  sheet.getCell(`H${newTc1Row}`).value = { formula: `SUM(H3:H${newTc1Row - 1})` };
  sheet.getCell(`I${newTc1Row}`).value = { formula: `SUM(I3:I${newTc1Row - 1})` };

  // 8. Populate Bottom Table (starting at startBottomRow)
  const M = bottomOrders.length;
  for (let idx = 0; idx < M; idx++) {
    const rowIdx = startBottomRow + idx;
    const order = bottomOrders[idx];
    const dateFormatted = formatDate(order["Ngày đặt"]);
    const nameVal = order["Tên"] || "";
    
    // Parse dimensions (cm to meters)
    const dimStr = order["Kích thước"] || "";
    let ngangVal = 0.0;
    let caoVal = 0.0;
    if (dimStr) {
      const parts = dimStr.toLowerCase().split("x");
      if (parts.length >= 2) {
        ngangVal = parseFloat(parts[0].trim()) / 100.0;
        caoVal = parseFloat(parts[1].trim()) / 100.0;
      }
    }
    
    const slVal = parseInt(String(order["Số lượng"] || 1));
    
    const row = sheet.getRow(rowIdx);
    row.getCell(1).value = dateFormatted;
    row.getCell(2).value = nameVal;
    row.getCell(3).value = ngangVal;
    row.getCell(4).value = caoVal;
    row.getCell(5).value = slVal;
    
    // Area formula
    row.getCell(6).value = { formula: `E${rowIdx}*D${rowIdx}*C${rowIdx}` };
    row.getCell(12).value = order["Chất liệu"] || "";
    
    row.commit();
  }

  // 9. Delete unused bottom table rows (range: startBottomRow + M to newTtRowBefore - 1)
  const startClearBottom = startBottomRow + M;
  const countBottom = (newTtRowBefore - 1) - startClearBottom + 1;
  if (countBottom > 0) {
    console.log(`Deleting ${countBottom} unused rows from Bottom Table (starting from row ${startClearBottom})`);
    for (let r = startClearBottom; r <= newTtRowBefore - 1; r++) {
      const row = sheet.getRow(r);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.value = null;
      });
      row.commit();
    }
    sheet.spliceRows(startClearBottom, countBottom);
  }

  // 10. Re-apply shifted merges using the official ExcelJS API
  for (const mergeStr of activeMergesToKeep) {
    const shifted = shiftMerge(
      mergeStr,
      countTop > 0 ? countTop : 0,
      startClearTop,
      countBottom > 0 ? countBottom : 0,
      startClearBottom
    );
    if (shifted) {
      try {
        sheet.mergeCells(shifted);
        console.log(`Re-applied merged cell range: ${shifted}`);
      } catch (e) {
        console.warn(`Failed to merge cell range ${shifted}:`, e);
      }
    }
  }

  // 11. Generate and return array buffer
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
