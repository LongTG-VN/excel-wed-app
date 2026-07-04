# scripts/parse_zalo_images.py
import os
import re
import json
import cv2
import numpy as np
import sys
import argparse

# Set output to UTF-8
if hasattr(sys, 'stdout') and sys.stdout:
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass

# Load EasyOCR dynamically
try:
    import easyocr
    EASYOCR_AVAILABLE = True
except ImportError:
    EASYOCR_AVAILABLE = False

MANUAL_NAME_CORRECTIONS = {
    "Thắm Hồng_2026-06-29_image_1.jpg": "ĐC: số 368 đường Nguyễn Văn Thoại, phường Châu Đốc, AG",
    "Thắm Hồng_2026-06-29_image_5.jpg": "Hài",
    "Thắm Hồng_2026-06-29_image_7.jpg": "Đặng Khôi",
    "Thắm Hồng_2026-06-30_image_10.jpg": "Bún Cá Mập",
    "Thắm Hồng_2026-06-30_image_11.jpg": "Vỉnh",
    "Thắm Hồng_2026-06-30_image_15.jpg": "Điểm tâm sáng A TY",
    "Thắm Hồng_2026-06-30_image_9.jpg": "Hải Yến",
    "Thắm Hồng_2026-07-01_image_17.jpg": "Tâm - Thúy",
    "Thắm Hồng_2026-07-01_image_18.jpg": "Thùy Dương",
    "Thắm Hồng_2026-07-01_image_19.jpg": "Dì ba",
    "Thắm Hồng_2026-07-01_image_23.jpg": "Phước Nguyễn",
    "Thắm Hồng_2026-07-01_image_20.jpg": "Phê Bơ",
    "Thắm Hồng_2026-07-01_image_22.jpg": "Phê Bơ",
    "Thắm Hồng_2026-07-01_image_25.jpg": "Phê Bơ",
    "Thắm Hồng_2026-07-03_image_39.jpg": "THIÊN THIÊN BÁN NƯỚC ÉP TRÁI CÂY",
    "Thắm Hồng_2026-07-03_image_40.jpg": "THIÊN THIÊN BÁN NƯỚC ÉP TRÁI CÂY",
    "Thắm Hồng_2026-07-03_image_41.jpg": "ngọc Thanh",
    "Thắm Hồng_2026-07-03_image_42.jpg": "Cháo Trắng"
}

def parse_filename(filename):
    fn = filename.replace('\xa0', ' ').strip()
    name_part = os.path.splitext(fn)[0]
    parts = name_part.split('_')
    if len(parts) >= 2:
        customer = parts[0].strip()
        date = parts[1].strip()
        return customer, date
    return "Không rõ", "Không rõ"

def normalize_ocr_text(text):
    text = text.replace('\xa0', ' ').strip()
    text = re.sub(r'\b(\d+)[oO]\b', r'\g<1>0', text)
    text = re.sub(r'(\d)[oO](?=\b|[a-zA-s])', r'\g<1>0', text)
    text = re.sub(r'\br\s+([oOôöaăâeêiuyđáàảãạấầẩẫậếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụýỳỷỹỵ])', r'r\1', text, flags=re.IGNORECASE)
    text = re.sub(r'\b[I1\|]ung\b', 'lung', text)
    text = re.sub(r'\b[I1\|]ưng\b', 'lưng', text)
    return text

def clean_material(text):
    text_lower = text.lower()
    grey_back_indicators = [
        "lưng xám", "lung xam", "de xam", "đế xám", 
        "rỗng lưng", "rổng lưng", "rông lưng", "rống lưng", "rỔng lung", "rổng lung", "rỎng lung",
        "rổng Iung", "rỔng Iung", "rổng [ưng", "rông lung", "rỔng lung xám"
    ]
    for ind in grey_back_indicators:
        if ind in text_lower:
            return "Rồng Lưng Xám"
            
    materials_map = {
        "decal bế": "Decal bế",
        "decal be": "Decal bế",
        "decal cắt": "Decal cắt",
        "decal cat": "Decal cắt",
        "decal": "Decal",
        "hiflex": "Hiflex",
        "hamlet": "Hamlet (Hiflex)",
        "bạt": "Bạt",
        "bat": "Bạt",
        "pp": "PP",
        "mica": "Mica",
        "alu": "Alu",
        "formex": "Formex"
    }
    for key, val in materials_map.items():
        if key in text_lower:
            return val
    return "Không rõ"

def extract_quantity(text):
    text_lower = text.lower()
    match = re.search(r'(?:x\s*|\b)(\d+)\s*(?:tấm|cái|tờ|cuộn|bản|tẩm|tâm|tâmg|tâmg)\b', text_lower)
    if match:
        return int(match.group(1))
    return 1

def clean_dimensions_and_quantity(dim_str, text_clean):
    dim = dim_str.lower().replace(' ', '').replace('cm', '').replace('m', '')
    parts = dim.split('x')
    qty = 1
    if len(parts) == 3:
        third_part = parts[2]
        qty_phrase = re.compile(rf'{third_part}\s*(?:tấm|cái|tờ|cuộn|bản|tẩm|tâm|tâmg)\b', re.IGNORECASE)
        if qty_phrase.search(text_clean):
            dim = f"{parts[0]}x{parts[1]}"
            qty = int(third_part)
        else:
            dim = f"{parts[0]}x{parts[1]}x{parts[2]}"
    elif len(parts) == 2:
        qty = extract_quantity(text_clean)
    return dim, qty

def extract_design_name(results, dim_regex):
    candidates = []
    ignore_keywords = [
        "decal", "hiflex", "hamlet", "bạt", "bat", "pp", "mica", "alu", "formex",
        "lưng xám", "lung xam", "de xam", "đế xám", "rỗng lưng", "rổng lưng", "rổng lung", "rộng lưng",
        "tấm", "cái", "tờ", "cuộn", "bản", "tẩm", "tâm", "tâmg"
    ]
    request_keywords = [
        "dạ", "ơi", "in kỹ", "con cám ơn", "cám ơn", "con cam on", "giúp con", "dùm con",
        "khách khó", "chữ nhỏ", "nhờ k", "nền đen", "in theo khổ", "theo khổ"
    ]
    
    for bbox, text, conf in results:
        text_clean = text.strip()
        text_lower = text_clean.lower()
        if dim_regex.search(text_clean) and len(text_clean) < 35:
            continue
        if re.match(r'^[\d\s\W_]+$', text_clean) or len(text_clean) <= 1:
            continue
        is_material_or_qty = False
        for kw in ignore_keywords:
            if kw in text_lower:
                if len(text_clean) < 25:
                    is_material_or_qty = True
                    break
        if is_material_or_qty:
            continue
        is_request = False
        for kw in request_keywords:
            if kw in text_lower:
                is_request = True
                break
        if is_request:
            continue
        norm_key = re.sub(r'\s+', '', text_lower)
        if norm_key in ["x", "*", "+", "-", "/", "xtam", "decal"]:
            continue
            
        y_coords = [p[1] for p in bbox]
        y_min = min(y_coords)
        y_max = max(y_coords)
        height = y_max - y_min
        
        candidates.append({
            "text": text_clean,
            "y_min": y_min,
            "y_max": y_max,
            "height": height,
            "norm_key": norm_key
        })
        
    if not candidates:
        return "Không rõ"
        
    anchor_candidate = max(candidates, key=lambda c: c["height"])
    anchor_y_top = anchor_candidate["y_min"]
    
    inside_candidates = []
    for c in candidates:
        if c["y_max"] >= anchor_y_top - 15:
            inside_candidates.append(c)
            
    if not inside_candidates:
        return "Không rõ"
        
    max_height_inside = max(c["height"] for c in inside_candidates)
    
    main_words = []
    seen_normalized = set()
    for c in inside_candidates:
        if c["height"] >= max_height_inside * 0.85:
            norm_key = c["norm_key"]
            if norm_key not in seen_normalized:
                seen_normalized.add(norm_key)
                word = c["text"]
                word = re.sub(r'([a-zđéèảãẹốồổỗộớờởỡợíìỉĩịúùủũụýỳỷỹỵ])([A-ZĐÉÈẢÃẸỐỒỔỖỘỚỜỞỠỢÍÌỈĨỊÚÙỦŨỤÝỲỶỸÝ])', r'\1 \2', word)
                main_words.append(word)
                
    if main_words:
        return " ".join(main_words)
    return "Không rõ"

def process_image(reader, image_path, customer, date):
    print(f"Đang xử lý ảnh: {os.path.basename(image_path)}")
    try:
        img = cv2.imdecode(np.fromfile(image_path, dtype=np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            print(f"Lỗi: Không thể tải hoặc giải mã ảnh {os.path.basename(image_path)}")
            return []
        results = reader.readtext(img)
    except Exception as e:
        print(f"Lỗi khi chạy OCR trên file {os.path.basename(image_path)}: {e}")
        return []
        
    items = []
    dim_regex = re.compile(r'\b\d+(?:\.\d+)?\s*(?:cm|m)?\s*[xX*]\s*\d+(?:\.\d+)?\s*(?:cm|m)?(?:\s*[xX*]\s*\d+(?:\.\d+)?\s*(?:cm|m)?)?\b')
    
    normalized_results = []
    for bbox, text, conf in results:
        norm_text = normalize_ocr_text(text)
        normalized_results.append((bbox, norm_text, conf))
        
    design_name = extract_design_name(normalized_results, dim_regex)
    fn_clean = os.path.basename(image_path).replace('\xa0', ' ').strip()
    if fn_clean in MANUAL_NAME_CORRECTIONS:
        design_name = MANUAL_NAME_CORRECTIONS[fn_clean]
        
    if not design_name or design_name == "Không rõ":
        design_name = "none"
    
    full_text = " ".join([r[1] for r in normalized_results])
    
    for bbox, text_clean, conf in normalized_results:
        dims = dim_regex.findall(text_clean)
        if dims:
            dim_str, qty = clean_dimensions_and_quantity(dims[0], text_clean)
            mat = clean_material(text_clean)
            if mat == "Không rõ":
                mat = clean_material(full_text)
                
            items.append({
                "Tên": design_name,
                "Kích thước": dim_str,
                "Số lượng": qty,
                "Chất liệu": mat,
                "Văn bản gốc trên dòng": text_clean
            })
            
    return items

def main():
    if not EASYOCR_AVAILABLE:
        print("Lỗi: Thư viện easyocr chưa được cài đặt.")
        sys.exit(1)
        
    parser = argparse.ArgumentParser(description="OCR and parse Zalo images to JSON.")
    parser.add_argument("-i", "--input-dir", type=str, required=True, help="Folder containing Zalo images")
    parser.add_argument("-o", "--output-file", type=str, required=True, help="Path to output JSON file")
    args = parser.parse_args()
    
    image_dir = args.input_dir
    output_file = args.output_file
    
    if not os.path.exists(image_dir):
        print(f"Lỗi: Thư mục đầu vào không tồn tại: {image_dir}")
        sys.exit(1)
        
    print("Khởi tạo EasyOCR Reader...")
    reader = easyocr.Reader(['vi', 'en'])
    
    all_files = os.listdir(image_dir)
    image_files = [f for f in all_files if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    
    print(f"Tìm thấy {len(image_files)} tệp ảnh để xử lý.")
    cleaned_records = []
    
    for idx, f in enumerate(image_files):
        image_path = os.path.join(image_dir, f)
        customer, date = parse_filename(f)
        items = process_image(reader, image_path, customer, date)
        if items:
            for item in items:
                record = {
                    "File gốc": f,
                    "Ngày đặt": date,
                    "Tên": item["Tên"],
                    "Kích thước": item["Kích thước"],
                    "Số lượng": item["Số lượng"],
                    "Chất liệu": item["Chất liệu"],
                    "Dòng chữ quét được": item["Văn bản gốc trên dòng"]
                }
                cleaned_records.append(record)
                print(f"  -> Trích xuất thành công: {item['Tên']} | {item['Kích thước']} | {item['Chất liệu']} | SL: {item['Số lượng']}")
        else:
            print(f"  -> Bỏ qua file: {f}")
            
    with open(output_file, 'w', encoding='utf-8') as out_f:
        json.dump(cleaned_records, out_f, ensure_ascii=False, indent=2)
    print(f"\nĐã ghi dữ liệu thành công ra tệp: {output_file}")

if __name__ == "__main__":
    main()
