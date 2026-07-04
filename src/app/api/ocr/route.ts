// src/app/api/ocr/route.ts
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import JSZip from "jszip";

async function unzipBuffer(buffer: Buffer, outDir: string) {
  const zip = await JSZip.loadAsync(buffer);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  for (const filename of Object.keys(zip.files)) {
    const file = zip.files[filename];
    if (!file.dir) {
      const fileBuf = await file.async("nodebuffer");
      // Clean filename from potential subfolder prefix to write files flatly in outDir
      const baseFilename = path.basename(filename);
      if (!baseFilename || baseFilename.startsWith(".")) continue;
      const outPath = path.join(outDir, baseFilename);
      fs.writeFileSync(outPath, fileBuf);
    }
  }
}

export async function POST(req: NextRequest) {
  const tempDir = path.join(process.cwd(), "temp_ocr_" + Date.now());
  const imagesDir = path.join(tempDir, "images");
  const outputJsonPath = path.join(tempDir, "output.json");
  
  try {
    const formData = await req.formData();
    const zipFile = formData.get("file") as File | null;
    
    if (!zipFile) {
      return NextResponse.json({ error: "Không tìm thấy file ZIP tải lên." }, { status: 400 });
    }
    
    // Create temporary workspace
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(imagesDir, { recursive: true });
    
    // Write upload ZIP buffer to disk and extract
    const arrayBuffer = await zipFile.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);
    console.log("Unzipping images file...");
    await unzipBuffer(zipBuffer, imagesDir);
    
    // Run Python OCR script
    const pythonPath = "python";
    const scriptPath = path.join(process.cwd(), "scripts", "parse_zalo_images.py");
    
    console.log(`Spawning Python process: ${pythonPath} ${scriptPath} -i ${imagesDir} -o ${outputJsonPath}`);
    const pyProcess = spawn(pythonPath, [scriptPath, "-i", imagesDir, "-o", outputJsonPath]);
    
    let pythonErr = "";
    
    pyProcess.stderr.on("data", (data) => {
      pythonErr += data.toString();
    });
    
    const code = await new Promise<number>((resolve) => {
      pyProcess.on("close", (code) => {
        resolve(code ?? 0);
      });
    });
    
    if (code !== 0) {
      console.error("Python OCR error:", pythonErr);
      return NextResponse.json({ error: `Lỗi OCR (Python): ${pythonErr}` }, { status: 500 });
    }
    
    // Read parsed JSON output
    if (!fs.existsSync(outputJsonPath)) {
      return NextResponse.json({ error: "Không tìm thấy kết quả từ bộ quét OCR." }, { status: 500 });
    }
    
    const jsonRaw = fs.readFileSync(outputJsonPath, "utf-8");
    const parsedData = JSON.parse(jsonRaw);
    
    console.log(`Successfully parsed ${parsedData.length} orders from images.`);
    return NextResponse.json({ orders: parsedData });
    
  } catch (err: any) {
    console.error("OCR API route error:", err);
    return NextResponse.json({ error: `Lỗi xử lý OCR: ${err.message}` }, { status: 500 });
  } finally {
    // Cleanup workspace
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log("Cleaned up temp directory:", tempDir);
      }
    } catch (cleanupErr) {
      console.error("Failed to cleanup temp directory:", cleanupErr);
    }
  }
}
