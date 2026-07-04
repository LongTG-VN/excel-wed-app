// src/app/api/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { buildExcelFromTemplate } from "@/lib/excelExporter";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orders, templateBase64 } = body;

    if (!orders || !Array.isArray(orders)) {
      return NextResponse.json({ error: "Dữ liệu orders không hợp lệ." }, { status: 400 });
    }

    let templateBuffer: Buffer;
    if (templateBase64) {
      // Use custom uploaded template
      templateBuffer = Buffer.from(templateBase64, "base64");
    } else {
      // Use default template from public directory
      const templatePath = path.join(process.cwd(), "public", "template.xlsx");
      if (!fs.existsSync(templatePath)) {
        return NextResponse.json({ error: "Không tìm thấy file template mặc định." }, { status: 500 });
      }
      templateBuffer = fs.readFileSync(templatePath);
    }

    const excelBuffer = await buildExcelFromTemplate(orders, templateBuffer);

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="KetQua.xlsx"`,
      },
    });
  } catch (err: any) {
    console.error("Export error:", err);
    return NextResponse.json({ error: `Lỗi khi xuất file Excel: ${err.message}` }, { status: 500 });
  }
}
