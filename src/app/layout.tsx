import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bảng Kế Toán Tự Động",
  description: "Đọc tên file → xuất Excel kế toán",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
