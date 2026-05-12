# Bảng Kế Toán Tự Động - Next.js

Port từ Java (NetBeans) sang Next.js 14 App Router.

## Cách chạy

```bash
npm install
npm run dev
```

Mở http://localhost:3000

## Cách dùng

1. Nén folder tháng thành file `.zip`  
   Ví dụ: `T 04 - 25.zip` chứa:
   ```
   T 04 - 25/
     01.01/
       01.01 AP Băng rôn 200x55.cdr
       01.01 CD Tên sản phẩm 300x100x2 Day.cdr
     01.02/
       ...
   ```

2. Upload file ZIP vào trang web

3. Xem preview bảng dữ liệu đã parse

4. Click **Xuất Excel** → tải về `KetQua.zip` gồm:
   - `AnPhu.xlsx`
   - `CaiDau.xlsx`

## Quy tắc đặt tên file

```
[Ngày]  [Nhà]  [Tên sản phẩm]  [WxH hoặc WxHxSL]  [day?]  .cdr
01.01   AP     Băng rôn        200x55                        .cdr
01.01   CD     Hộp đèn         300x100x2             Day     .cdr
```

- `AP` = An Phú, `CD` = Cái Dầu
- Kích thước tính bằng cm (chia 100 thành m)
- Nếu có `x3` ở cuối kích thước → số lượng = 3
- Hậu tố `Day` → Loại dày (M2-Dày), không có → Loại thường (M2-Thường)

## Tech stack

- **Next.js 14** (App Router)
- **ExcelJS** - tạo file Excel (thay Apache POI)
- **JSZip** - đọc/ghi ZIP
- **TypeScript**

## Deploy lên Vercel

```bash
npm run build
# Push lên GitHub rồi import vào vercel.com
```
