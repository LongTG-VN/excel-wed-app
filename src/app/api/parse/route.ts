// app/api/parse/route.ts
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { parseZipFileList } from "@/lib/parser";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Không có file nào được upload" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Lấy tên folder gốc (tên ZIP hoặc folder đầu tiên)
    const rootName = file.name.replace(/\.zip$/i, "");

    // Thu thập tất cả đường dẫn file (bỏ qua folder rỗng & .git)
    const filePaths: string[] = [];
    zip.forEach((relativePath, zipEntry) => {
      if (!zipEntry.dir && !relativePath.includes(".git/")) {
        // Chỉ lấy file .cdr (hoặc bất kỳ file nào trong subfolder)
        filePaths.push(relativePath);
      }
    });

    if (filePaths.length === 0) {
      return NextResponse.json(
        { error: "ZIP không chứa file nào hợp lệ" },
        { status: 400 }
      );
    }

    const result = parseZipFileList(filePaths, rootName);

    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Lỗi khi đọc file ZIP" }, { status: 500 });
  }
}
