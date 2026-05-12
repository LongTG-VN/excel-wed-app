// lib/parser.ts
// Port từ Java ReadFolder.java sang TypeScript

export interface FileEntry {
  stt: number;
  month: string; // ngày tháng "01.01"
  name: string;  // tên sản phẩm
  width: number; // cm (đã chia 100)
  height: number; // cm (đã chia 100)
  soLuong: number;
  loai: number; // 0 = thường, 1 = dày
}

export interface ParseResult {
  anPhu: FileEntry[];
  anPhuOther: FileEntry[];
  caiDau: FileEntry[];
  caiDauOther: FileEntry[];
  errors: string[];
  rootName: string;
}

export function parseZipFileList(
  fileNames: string[], // mỗi phần tử: "01.01/tên file.cdr"
  rootName: string
): ParseResult {
  const result: ParseResult = {
    anPhu: [],
    anPhuOther: [],
    caiDau: [],
    caiDauOther: [],
    errors: [],
    rootName,
  };

  // Bước 1: collectFiles → allFilePaths dạng "01.01 tên_file.cdr"
  const allFilePaths: string[] = [];
  for (const filePath of fileNames) {
    const parts = filePath.split("/");
    if (parts.length < 2) continue;
    const dayName = parts[parts.length - 2];
    const fileName = parts[parts.length - 1];
    if (!fileName || fileName.startsWith(".")) continue;
    allFilePaths.push(`${dayName} ${fileName}`);
  }

  // Bước 2: CaseKoCokichThuoc → tách complete vs error
  const sizesOfComplete: string[] = [];
  const sizesOfError: string[] = [];

  for (const filePath of allFilePaths) {
    const lower = filePath.toLowerCase();
    const tokens = lower.split(/\s+/);
    const hasSize = tokens.some((t) => /\d+x\d+(x\d+)?(\.\w+)?/.test(t));
    if (hasSize) {
      sizesOfComplete.push(lower);
    } else {
      sizesOfError.push(lower);
    }
  }

  // Bước 3: processLine → tách kích thước và ghép lại
  const sizesOfAfterProcessLine: string[] = [];

  for (const line of sizesOfComplete) {
    const sizePattern = /\b\d+x\d+(x\d+)?\b/g;
    const matches = [...line.matchAll(sizePattern)];

    if (matches.length === 0) {
      sizesOfError.push(line);
      continue;
    }

    // Xóa tất cả kích thước để lấy phần mô tả
    const lineWithoutSizes = line
      .replace(/\b\d+x\d+(x\d+)?\b/g, "")
      .replace(/ +/g, " ")
      .trim();

    const parts = lineWithoutSizes.split(" ");
    let suffix = "";
    let fixed = lineWithoutSizes;

    if (parts.length > 1) {
      suffix = parts[parts.length - 1];
      fixed = parts.slice(0, parts.length - 1).join(" ");
    }

    for (const match of matches) {
      const sizeStr = match[0];
      const raw = `${fixed} ${sizeStr} ${suffix}`.trim();
      // Xóa extension .cdr
      const cdrIdx = raw.lastIndexOf(".cdr");
      const processed = cdrIdx >= 0 ? raw.substring(0, cdrIdx).trim() : raw;
      sizesOfAfterProcessLine.push(processed);
    }
  }

  // Bước 4: Ecuting → phân loại và tạo objects
  let sttAnPhu = 1;
  let sttAnPhuOther = 1;
  let sttCaiDau = 1;
  let sttCaiDauOther = 1;

  for (const line of sizesOfAfterProcessLine) {
    const tokens = line.split(" ");
    if (tokens.length < 3) {
      sizesOfError.push(line);
      continue;
    }

    const lastToken = tokens[tokens.length - 1];
    const sizePattern = /^\d+x\d+(x\d+)?$/;

    let name = "";
    let sizeTokens: string[] = [];
    let loai = 0;
    let isOther = false;

    if (sizePattern.test(lastToken)) {
      // Case thường: kết thúc bằng kích thước
      for (let j = 2; j < tokens.length - 1; j++) name += " " + tokens[j];
      sizeTokens = lastToken.split("x");
      loai = 0;
    } else if (lastToken.toLowerCase() === "day") {
      // Case day
      for (let j = 2; j < tokens.length - 2; j++) name += " " + tokens[j];
      sizeTokens = tokens[tokens.length - 2].split("x");
      loai = 1;
    } else {
      // Case other
      for (let j = 2; j < tokens.length - 2; j++) name += " " + tokens[j];
      const secondLast = tokens[tokens.length - 2];
      if (!sizePattern.test(secondLast)) {
        sizesOfError.push(line);
        continue;
      }
      sizeTokens = secondLast.split("x");
      loai = 1;
      isOther = true;
    }

    name = name.trim();
    if (!name) name = "(không tên)";

    const soLuong = sizeTokens.length >= 3 ? parseInt(sizeTokens[2]) : 1;
    const width = parseFloat(sizeTokens[0]) / 100;
    const height = parseFloat(sizeTokens[1]) / 100;

    if (isNaN(width) || isNaN(height)) {
      sizesOfError.push(line);
      continue;
    }

    const month = tokens[0];
    const house = tokens[1];
    const isAnPhu = house.toLowerCase() === "ap";

    const entry: FileEntry = { stt: 0, month, name, width, height, soLuong, loai };

    if (!isOther) {
      if (isAnPhu) {
        entry.stt = sttAnPhu++;
        result.anPhu.push(entry);
      } else {
        entry.stt = sttCaiDau++;
        result.caiDau.push(entry);
      }
    } else {
      if (isAnPhu) {
        entry.stt = sttAnPhuOther++;
        result.anPhuOther.push(entry);
      } else {
        entry.stt = sttCaiDauOther++;
        result.caiDauOther.push(entry);
      }
    }
  }

  result.errors = [...sizesOfError];
  return result;
}

export function calcDienTich(entry: FileEntry): number {
  const raw = entry.soLuong * entry.width * entry.height;
  return Math.round(raw * 100) / 100;
}
