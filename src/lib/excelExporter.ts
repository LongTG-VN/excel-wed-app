// lib/excelExporter.ts
// Port từ WriteFileExcel.java sang TypeScript dùng ExcelJS

import ExcelJS from "exceljs";
import { FileEntry, calcDienTich } from "./parser";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9D9D9" },
};

const GOLD_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFD700" },
};

const YELLOW_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFFFFF00" },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

function applyBorderAndFont(
  cell: ExcelJS.Cell,
  fill?: ExcelJS.Fill,
  bold = true
) {
  cell.border = THIN_BORDER;
  cell.font = { bold, size: 14 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  if (fill) cell.fill = fill;
}

function createHeaderRow(sheet: ExcelJS.Worksheet) {
  const headers = ["STT", "Tháng", "Tên", "NG", "Cao", "SL", "Loại", "M2-Thường", "M2-Dày"];
  const colWidths = [8, 10, 40, 10, 10, 8, 8, 18, 18];

  const row = sheet.getRow(1);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    applyBorderAndFont(cell, HEADER_FILL, true);
  });
  row.commit();

  colWidths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });
}

function writeEntries(
  sheet: ExcelJS.Worksheet,
  entries: FileEntry[],
  startRow: number
): number {
  let rowIdx = startRow;
  for (const entry of entries) {
    const row = sheet.getRow(rowIdx);
    const dienTich = calcDienTich(entry);

    row.getCell(1).value = entry.stt;
    row.getCell(2).value = entry.month;
    row.getCell(3).value = entry.name;
    row.getCell(4).value = entry.width;
    row.getCell(5).value = entry.height;
    row.getCell(6).value = entry.soLuong;
    row.getCell(7).value = entry.loai;

    if (entry.loai === 0) {
      row.getCell(8).value = dienTich;
      row.getCell(9).value = 0;
    } else {
      row.getCell(8).value = 0;
      row.getCell(9).value = dienTich;
    }

    for (let c = 1; c <= 9; c++) {
      applyBorderAndFont(row.getCell(c), undefined, true);
      if (c === 7) row.getCell(c).fill = YELLOW_FILL;
    }

    row.commit();
    rowIdx++;
  }
  return rowIdx;
}

function writeTongCong(
  sheet: ExcelJS.Worksheet,
  label: string,
  rowIdx: number,
  sumFrom: number,
  sumTo: number
): number {
  const row = sheet.getRow(rowIdx);

  for (let c = 1; c <= 7; c++) {
    const cell = row.getCell(c);
    cell.value = c === 3 ? label : null;
    applyBorderAndFont(cell, GOLD_FILL, true);
  }

  const cell8 = row.getCell(8);
  const cell9 = row.getCell(9);
  cell8.value = { formula: `SUM(H${sumFrom}:H${sumTo})` };
  cell9.value = { formula: `SUM(I${sumFrom}:I${sumTo})` };
  applyBorderAndFont(cell8, GOLD_FILL, true);
  applyBorderAndFont(cell9, GOLD_FILL, true);

  row.commit();
  return rowIdx + 1;
}

export async function buildExcelBuffer(
  main: FileEntry[],
  other: FileEntry[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("T1");

  createHeaderRow(sheet);

  // Nhóm 1 (main)
  const dataStart1 = 2;
  let nextRow = writeEntries(sheet, main, dataStart1);
  const tongCong1Row = nextRow;
  nextRow = writeTongCong(sheet, "Tổng Cộng (1) :", tongCong1Row, dataStart1, tongCong1Row - 1);

  // Nhóm 2 (other)
  const dataStart2 = nextRow;
  nextRow = writeEntries(sheet, other, dataStart2);
  const tongCong2Row = nextRow;
  nextRow = writeTongCong(sheet, "Tổng Cộng (2) :", tongCong2Row, dataStart2, tongCong2Row - 1);

  // Tổng cộng 1+2
  const tc3Row = sheet.getRow(nextRow);
  for (let c = 1; c <= 7; c++) {
    const cell = tc3Row.getCell(c);
    cell.value = c === 3 ? "Tổng Cộng (1+2) :" : null;
    applyBorderAndFont(cell, GOLD_FILL, true);
  }
  tc3Row.getCell(8).value = { formula: `H${tongCong1Row}+H${tongCong2Row}` };
  tc3Row.getCell(9).value = { formula: `I${tongCong1Row}+I${tongCong2Row}` };
  applyBorderAndFont(tc3Row.getCell(8), GOLD_FILL, true);
  applyBorderAndFont(tc3Row.getCell(9), GOLD_FILL, true);
  tc3Row.commit();

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
