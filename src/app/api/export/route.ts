// app/api/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { buildExcelBuffer } from "@/lib/excelExporter";
import { ParseResult } from "@/lib/parser";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { data: ParseResult; rootName?: string };
    const { data } = body;

    if (!data) {
      return NextResponse.json({ error: "Không có dữ liệu" }, { status: 400 });
    }

    // Tạo 2 file Excel song song
    const [anPhuBuf, caiDauBuf] = await Promise.all([
      buildExcelBuffer(data.anPhu, data.anPhuOther),
      buildExcelBuffer(data.caiDau, data.caiDauOther),
    ]);

    // Đóng gói vào ZIP
    const zip = new JSZip();
    zip.file("AnPhu.xlsx", anPhuBuf);
    zip.file("CaiDau.xlsx", caiDauBuf);

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="KetQua.zip"`,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Lỗi khi tạo file Excel" }, { status: 500 });
  }
}
