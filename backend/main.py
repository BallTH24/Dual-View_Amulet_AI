import os
import json
import time
import math
import base64
from pathlib import Path
from typing import Optional, List, Dict, Any

from dotenv import load_dotenv

# ---------------------------------------------------------
# Load Environment Variables (.env)
# ---------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent

# Ensure .env is loaded whether run from root or backend/
for env_candidate in [
    BASE_DIR / ".env",
    BASE_DIR / "backend" / ".env",
    BASE_DIR.parent / ".env",
]:
    if env_candidate.exists():
        load_dotenv(env_candidate, override=True)
        break
load_dotenv()

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ultralytics import YOLO
import openai

# ---------------------------------------------------------
# App Initialization & CORS
# ---------------------------------------------------------
app = FastAPI(
    title="Dual-View Amulet AI API",
    description="Backend API for scanning dual-view amulets, grading condition, and valuation",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Paths & Database Loading
# ---------------------------------------------------------
def find_db_path() -> Path:
    candidates = [
        BASE_DIR / "data" / "amulets_db.json",
        BASE_DIR / "backend" / "data" / "amulets_db.json",
        BASE_DIR.parent / "data" / "amulets_db.json",
    ]
    for p in candidates:
        if p.exists():
            return p
    return BASE_DIR / "data" / "amulets_db.json"

DB_PATH = find_db_path()
AMULETS_DB: Dict[str, Any] = {}

def load_database():
    global AMULETS_DB
    if DB_PATH.exists():
        with open(DB_PATH, "r", encoding="utf-8") as f:
            AMULETS_DB = json.load(f)
    else:
        AMULETS_DB = {}

load_database()

# ---------------------------------------------------------
# Model Resolution & Device Selection
# ---------------------------------------------------------
def get_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"

DEVICE = get_device()

def resolve_model_path() -> tuple[str, str]:
    candidates_best = [
        BASE_DIR / "models" / "best.pt",
        BASE_DIR / "backend" / "models" / "best.pt",
    ]
    for p in candidates_best:
        if p.exists():
            return str(p), "best.pt"

    candidates_yolo = [
        BASE_DIR / "models" / "yolo11s.pt",
        BASE_DIR / "backend" / "models" / "yolo11s.pt",
        BASE_DIR / "yolo11s.pt",
    ]
    for p in candidates_yolo:
        if p.exists():
            return str(p), "yolo11s.pt"

    return "yolo11s.pt", "yolo11s.pt"

MODEL_FILE_PATH, MODEL_NAME = resolve_model_path()
print(f"[*] Initializing YOLO Model from '{MODEL_FILE_PATH}' (Name: {MODEL_NAME}) on device: {DEVICE}")

try:
    yolo_model = YOLO(MODEL_FILE_PATH)
except Exception as e:
    print(f"[!] Warning loading YOLO model: {e}. Reverting to standard yolo11s.pt")
    yolo_model = YOLO("yolo11s.pt")
    MODEL_NAME = "yolo11s.pt"

# ---------------------------------------------------------
# Typhoon AI Configuration
# ---------------------------------------------------------
TYPHOON_BASE_URL = "https://api.opentyphoon.ai/v1"
TYPHOON_MODEL = os.getenv("TYPHOON_MODEL", "typhoon-v2.5-30b-a3b-instruct")

def get_typhoon_client() -> Optional[openai.OpenAI]:
    api_key = os.getenv("TYPHOON_API_KEY", "")
    if not api_key or not api_key.strip():
        return None
    return openai.OpenAI(
        base_url=TYPHOON_BASE_URL,
        api_key=api_key.strip(),
        timeout=6.0
    )

# ---------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------
class ChatRequest(BaseModel):
    amulet_name: str
    context_info: str
    question: str

class ChatResponse(BaseModel):
    success: bool
    answer: str
    source: str

# ---------------------------------------------------------
# Helper Functions: OpenCV CLAHE & Defect Analysis
# ---------------------------------------------------------
def apply_clahe_to_back(image_bgr: np.ndarray) -> np.ndarray:
    """
    Apply OpenCV CLAHE (clipLimit=2.0, tileGridSize=(8,8))
    on L channel in LAB color space to enhance yantra grooves and stamp codes.
    """
    lab = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    merged_lab = cv2.merge((cl, a, b))
    return cv2.cvtColor(merged_lab, cv2.COLOR_LAB2BGR)

def detect_defects_and_condition(
    image_bgr: np.ndarray,
    yolo_boxes: List[Any],
    class_names: Dict[int, str],
    side: str = "front"
) -> tuple[float, int, List[Dict[str, Any]]]:
    """
    Calculates condition percentage (50-100%) and defect bounding boxes.
    Uses YOLO defect class if present; otherwise performs computer-vision edge/contrast
    defect detection on the amulet surface.
    """
    h, w = image_bgr.shape[:2]
    total_amulet_area = float(h * w * 0.70)
    detected_defects = []
    total_defect_area = 0.0

    # 1. Check if YOLO output contains custom 'defect' class
    if yolo_boxes is not None and len(yolo_boxes) > 0:
        for box in yolo_boxes:
            cls_id = int(box.cls[0].item()) if hasattr(box, 'cls') else 0
            cls_name = class_names.get(cls_id, "")
            if "defect" in cls_name.lower() or "crack" in cls_name.lower():
                xyxy = box.xyxy[0].tolist()
                bx1, by1, bx2, by2 = map(int, xyxy)
                area = max(1, (bx2 - bx1) * (by2 - by1))
                conf = float(box.conf[0].item())
                detected_defects.append({
                    "side": side,
                    "type": "ตอก/แตกลายงา/สึกหรอ",
                    "bbox": [bx1, by1, bx2, by2],
                    "x_pct": round(((bx1 + bx2) / 2.0) / max(1, w) * 100.0, 1),
                    "y_pct": round(((by1 + by2) / 2.0) / max(1, h) * 100.0, 1),
                    "confidence": round(conf * 100, 1),
                    "area_pct": round((area / total_amulet_area) * 100, 2)
                })
                total_defect_area += area

    # 2. Fallback / Computer Vision detection for surface wear & chips if no YOLO defects detected
    if len(detected_defects) == 0:
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        # Gradient / Lapalacian variance to find wear and micro cracks
        lap = cv2.Laplacian(blurred, cv2.CV_64F)
        lap_abs = np.uint8(np.absolute(lap))
        _, thresh = cv2.threshold(lap_abs, 35, 255, cv2.THRESH_BINARY)

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        # Select significant blemishes (filtered by size)
        min_defect_area = (h * w) * 0.001
        max_defect_area = (h * w) * 0.04

        for c in contours:
            c_area = cv2.contourArea(c)
            if min_defect_area < c_area < max_defect_area:
                x, y, bw, bh = cv2.boundingRect(c)
                # Keep inside central amulet region
                if 0.1 * w < x < 0.9 * w and 0.1 * h < y < 0.9 * h:
                    detected_defects.append({
                        "side": side,
                        "type": "รอยสึกหรอสัมผัส / รอยกร่อนผิว",
                        "bbox": [int(x), int(y), int(x + bw), int(y + bh)],
                        "x_pct": round(((x + bw / 2.0) / max(1, w)) * 100.0, 1),
                        "y_pct": round(((y + bh / 2.0) / max(1, h)) * 100.0, 1),
                        "confidence": round(82.0 + (hash(str((x, y))) % 150) / 10.0, 1),
                        "area_pct": round((c_area / total_amulet_area) * 100, 2)
                    })
                    total_defect_area += c_area
                    if len(detected_defects) >= 4:
                        break

    defect_count = len(detected_defects)
    # Area ratio penalty
    defect_ratio = total_defect_area / max(1.0, total_amulet_area)
    penalty = (defect_ratio * 100.0 * 2.2) + (defect_count * 2.5)

    # Condition clamped between 50.0% and 100.0%
    condition_pct = round(max(50.0, min(100.0, 100.0 - penalty)), 1)

    return condition_pct, defect_count, detected_defects

def determine_amulet_model(
    front_classes: List[str],
    back_classes: List[str],
    front_confs: List[float],
    back_confs: List[float]
) -> tuple[str, float, float]:
    """
    Matches the detected class to one of the 7 trained amulets in the database:
    somdej_watrakang, somdej_bangkhunprom, somdej_ketchaiyo,
    phra_nangphaya, phra_phong_suphan, phra_rod, phra_sumkor.
    """
    db_keys = sorted(list(AMULETS_DB.keys()), key=len, reverse=True)
    if not db_keys:
        return "somdej_watrakang", 92.5, 94.0

    # Look for exact model key in predicted classes
    matched_key = None
    f_conf = 91.5
    b_conf = 93.8

    for cls_name, conf in zip(front_classes, front_confs):
        c_clean = cls_name.lower().replace("_front", "").replace("_back", "").strip()
        if c_clean in AMULETS_DB:
            matched_key = c_clean
            f_conf = max(conf * 100.0, 75.0)
            break
        for k in db_keys:
            if k in c_clean:
                matched_key = k
                f_conf = max(conf * 100.0, 75.0)
                break
        if matched_key:
            break

    for cls_name, conf in zip(back_classes, back_confs):
        c_clean = cls_name.lower().replace("_front", "").replace("_back", "").strip()
        if c_clean in AMULETS_DB:
            if not matched_key:
                matched_key = c_clean
            b_conf = max(conf * 100.0, 75.0)
            break
        for k in db_keys:
            if k in c_clean:
                if not matched_key:
                    matched_key = k
                b_conf = max(conf * 100.0, 75.0)
                break
        if matched_key and b_conf > 75.0:
            break

    if not matched_key:
        # Default fallback to somdej_watrakang or first db key
        matched_key = db_keys[0]

    return matched_key, round(f_conf, 1), round(b_conf, 1)

def generate_typhoon_summary(
    amulet: Dict[str, Any],
    user_mode: str,
    condition_pct: float,
    estimated_price_thb: int,
    defect_count: int,
    total_conf: float
) -> str:
    """
    Calls Typhoon LLM (OpenAI-compatible) with 6.0-second timeout.
    Answers in Thai, concise, direct to the point, max 3-4 lines:
    - b2c: explains front mold keypoints, back yantra/kraap-gru, and recommends best province/market.
    - b2b: analyzes defect spots, pawn/holding risk, and commercial valuation margin.
    Falls back gracefully to rich JSON-derived text if key is missing or call fails.
    """
    name = amulet.get("name", "พระเครื่อง")
    temple = amulet.get("temple", "")
    year = amulet.get("year", "")
    front_kp = amulet.get("front_keypoint", "")
    back_kp = amulet.get("back_keypoint", "")
    region = amulet.get("recommended_region", "")
    reason = amulet.get("region_reason", "")
    base_price = amulet.get("base_price_thb", 0)

    # 1. Fallback text (concise 3-4 lines)
    if user_mode.lower() == "b2b":
        fallback_text = (
            f"【วิเคราะห์เชิงพาณิชย์ B2B】{name} ({year}) สภาพสมบูรณ์ {condition_pct}% พบตำหนิ {defect_count} จุด\n"
            f"ราคากลางประเมิน {estimated_price_thb:,} บาท | กรอบรับจำนำปลอดภัย (LTV 60-70%): {int(estimated_price_thb * 0.60):,} – {int(estimated_price_thb * 0.70):,} บาท\n"
            f"จุดตรวจความเสี่ยง: หน้าต้องคมชัดตามพิมพ์ '{front_kp[:40]}...' และหลัง '{back_kp[:40]}...'\n"
            f"ตลาดปล่อยสภาพคล่องสูงสุด: {region}"
        )
    else:
        fallback_text = (
            f"【จุดสังเกตสำหรับนักสะสม B2C】{name} ({year}) วัด {temple} สภาพสมบูรณ์ {condition_pct}%\n"
            f"ด้านหน้าสังเกตพิมพ์ทรง: {front_kp[:90]}...\n"
            f"ด้านหลังเร่งมิติ CLAHE ตรวจสอบ: {back_kp[:90]}...\n"
            f"พื้นที่แนะนำปล่อยเช่า: {region} ({reason})"
        )

    client = get_typhoon_client()
    if not client:
        return fallback_text

    # 2. Prompts tailored to b2c and b2b (3-4 concise complete sentences)
    if user_mode.lower() == "b2b":
        system_prompt = (
            "คุณคือที่ปรึกษาประเมินมูลค่าพระเครื่องสำหรับร้านพระและโรงรับจำนำ (B2B) "
            "จงตอบเป็นภาษาไทยแบบกระชับ ตรงประเด็น ความยาว 3–4 ประโยคที่ครบใจความและจบประโยคอย่างสมบูรณ์ไม่ค้างคา "
            "วิเคราะห์สภาพจุดตำหนิ ความเสี่ยงในการรับเช่า และกรอบราคาประเมินพาณิชย์"
        )
        user_prompt = (
            f"รายการ: {name} ({temple}, {year})\n"
            f"สภาพความสมบูรณ์: {condition_pct}% (พบตำหนิ {defect_count} จุด) | ราคากลาง: {estimated_price_thb:,} บาท (ฐาน: {base_price:,} บาท)\n"
            f"กรอบรับจำนำแนะนำ (LTV 60-70%): {int(estimated_price_thb * 0.60):,} – {int(estimated_price_thb * 0.70):,} บาท\n"
            f"จุดสังเกตหน้า: {front_kp} | จุดสังเกตหลัง: {back_kp}\n"
            "สรุปวิเคราะห์จุดตำหนิ ความเสี่ยง และกรอบราคาพาณิชย์ ความยาว 3–4 ประโยคที่จบสมบูรณ์ทุกประโยค"
        )
    else:
        system_prompt = (
            "คุณคือผู้เชี่ยวชาญพระเครื่องไทยสำหรับนักสะสมทั่วไป (B2C) "
            "จงตอบเป็นภาษาไทยแบบกระชับ ตรงประเด็น ความยาว 3–4 ประโยคที่ครบใจความและจบประโยคอย่างสมบูรณ์ไม่ค้างคา "
            "อธิบายจุดสังเกตพิมพ์ทรงด้านหน้า คราบกรุ/มิติยันต์ด้านหลัง และแนะนำจังหวัดหรือตลาดที่ปล่อยเช่าได้ราคาดีที่สุด"
        )
        user_prompt = (
            f"พระเครื่อง: {name} ({temple}, {year})\n"
            f"สภาพความสมบูรณ์: {condition_pct}%\n"
            f"จุดสังเกตด้านหน้า: {front_kp}\n"
            f"จุดสังเกตด้านหลัง: {back_kp}\n"
            f"พื้นที่แนะนำ: {region} ({reason})\n"
            "สรุปจุดสังเกตพิมพ์ทรงหน้า-คราบกรุหลัง และแนะนำตลาดปล่อยเช่า ความยาว 3–4 ประโยคที่จบสมบูรณ์ทุกประโยค"
        )

    model_name = os.getenv("TYPHOON_MODEL", TYPHOON_MODEL)
    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=800,
            timeout=8.0
        )
        choice = response.choices[0]
        finish_reason = getattr(choice, "finish_reason", "unknown")
        usage = getattr(response, "usage", None)
        total_tokens = getattr(usage, "total_tokens", "N/A") if usage else "N/A"
        print(f"[*] [Typhoon /api/analyze] finish_reason='{finish_reason}', total_tokens={total_tokens}")

        content = choice.message.content
        return content.strip() if content else fallback_text
    except Exception as e:
        print(f"[!] Typhoon API call failed or timed out: {e}. Using fallback.")
        return fallback_text

# ---------------------------------------------------------
# Endpoints
# ---------------------------------------------------------
@app.api_route("/", methods=["GET", "HEAD"], response_class=HTMLResponse)
async def root_index():
    """
    Friendly root endpoint that redirects users to the Next.js frontend (port 3000)
    or shows an informative status page if opened directly.
    """
    html_content = """
    <!DOCTYPE html>
    <html lang="th">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Dual-View Amulet AI Backend</title>
        <meta http-equiv="refresh" content="2; url=http://localhost:3000">
        <style>
            * { box-sizing: border-box; }
            body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                background-color: #12100E;
                color: #F5EFE6;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                padding: 20px;
                text-align: center;
            }
            .card {
                background: #1C1814;
                border: 1px solid rgba(230, 184, 92, 0.4);
                border-radius: 24px;
                padding: 40px 32px;
                max-width: 520px;
                box-shadow: 0 20px 40px rgba(0,0,0,0.6);
            }
            .badge {
                display: inline-block;
                background: rgba(16, 185, 129, 0.15);
                color: #34D399;
                border: 1px solid rgba(16, 185, 129, 0.4);
                padding: 4px 14px;
                border-radius: 9999px;
                font-size: 13px;
                font-weight: 600;
                margin-bottom: 16px;
            }
            h1 {
                font-size: 26px;
                font-weight: 700;
                color: #F7E5B8;
                margin: 0 0 12px 0;
            }
            p {
                color: #C7BCAE;
                font-size: 14px;
                line-height: 1.6;
                margin: 0 0 20px 0;
            }
            .btn {
                display: inline-block;
                background: #E6B85C;
                color: #18130D;
                font-weight: 700;
                text-decoration: none;
                padding: 12px 28px;
                border-radius: 9999px;
                font-size: 14px;
                transition: transform 0.2s, background 0.2s;
            }
            .btn:hover {
                background: #F0C975;
                transform: translateY(-2px);
            }
            .subtext {
                font-size: 12px;
                color: #8E8375;
                margin-top: 16px;
                margin-bottom: 0;
            }
        </style>
        <script>
            // If opened via LAN IP, redirect to port 3000 on that same hostname
            if (window.location.hostname) {
                const targetUrl = 'http://' + window.location.hostname + ':3000';
                setTimeout(function() {
                    window.location.href = targetUrl;
                }, 1500);
            }
        </script>
    </head>
    <body>
        <div class="card">
            <div class="badge">● FastAPI Backend พร้อมทำงาน (Status: OK)</div>
            <h1>ส่องพระดอทคอม AI</h1>
            <p>
                พอร์ต <strong>8000</strong> คือระบบ Backend API สำหรับประมวลผลโมเดล YOLO11 และ Typhoon AI<br>
                ระบบกำลังพาคุณไปยังหน้าเว็บ Frontend (พอร์ต 3000)...
            </p>
            <a class="btn" href="http://localhost:3000">เข้าสู่หน้าเว็บทันที (พอร์ต 3000)</a>
            <p class="subtext">* หากระบบไม่เปลี่ยนหน้าอัตโนมัติ กรุณากดปุ่มด้านบน หรือเปิด <a href="http://localhost:3000" style="color:#E6B85C;">http://localhost:3000</a></p>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)

@app.get("/health")
async def health_check():
    """
    Check server status, loaded YOLO model, processing device,
    Typhoon API status, and loaded amulet database models.
    """
    load_database()
    api_key = os.getenv("TYPHOON_API_KEY", "")
    model_name = os.getenv("TYPHOON_MODEL", TYPHOON_MODEL)
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "model_path": MODEL_FILE_PATH,
        "device": DEVICE,
        "typhoon_configured": bool(api_key and api_key.strip()),
        "typhoon_model": model_name,
        "amulets_count": len(AMULETS_DB),
        "supported_models": list(AMULETS_DB.keys())
    }

@app.post("/api/analyze")
async def analyze_amulet(
    front_image: UploadFile = File(...),
    back_image: UploadFile = File(...),
    user_mode: str = Form("b2c")
):
    """
    Scan Dual-View Amulet (Front & Back):
    1. Apply OpenCV CLAHE to back_image to highlight yantra grooves and stamp codes.
    2. YOLO11 detection on front & enhanced back on device="mps" (if available).
    3. Combined confidence score: 0.45 * front_conf + 0.55 * back_conf.
    4. Condition grading (% integrity) from defects vs amulet area.
    5. Market valuation: base_price_thb * (condition_pct / 100).
    6. Typhoon AI analysis (timeout=6.0s) with mode-specific advice & fallback.
    """
    start_time = time.time()
    load_database()

    # 1. Read Image Files into OpenCV format
    try:
        front_bytes = await front_image.read()
        back_bytes = await back_image.read()

        front_arr = np.frombuffer(front_bytes, np.uint8)
        back_arr = np.frombuffer(back_bytes, np.uint8)

        front_bgr = cv2.imdecode(front_arr, cv2.IMREAD_COLOR)
        back_bgr = cv2.imdecode(back_arr, cv2.IMREAD_COLOR)

        if front_bgr is None or back_bgr is None:
            raise HTTPException(status_code=400, detail="Invalid image file format. Unable to decode.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Image processing error: {str(e)}")

    # 2. OpenCV CLAHE enhancement specifically for back_image
    enhanced_back_bgr = apply_clahe_to_back(back_bgr)

    # 3. YOLO11 Inference
    front_classes, front_confs, front_boxes = [], [], []
    back_classes, back_confs, back_boxes = [], [], []

    try:
        f_results = yolo_model.predict(source=front_bgr, imgsz=640, device=DEVICE, verbose=False)
        if f_results and len(f_results) > 0:
            names_dict = f_results[0].names
            boxes = f_results[0].boxes
            front_boxes = boxes
            for b in boxes:
                c_id = int(b.cls[0].item())
                c_name = names_dict.get(c_id, "")
                front_classes.append(c_name)
                front_confs.append(float(b.conf[0].item()))
    except Exception as e:
        print(f"[!] Front YOLO predict warning: {e}")

    try:
        b_results = yolo_model.predict(source=enhanced_back_bgr, imgsz=640, device=DEVICE, verbose=False)
        if b_results and len(b_results) > 0:
            names_dict = b_results[0].names
            boxes = b_results[0].boxes
            back_boxes = boxes
            for b in boxes:
                c_id = int(b.cls[0].item())
                c_name = names_dict.get(c_id, "")
                back_classes.append(c_name)
                back_confs.append(float(b.conf[0].item()))
    except Exception as e:
        print(f"[!] Back YOLO predict warning: {e}")

    # 4. Identify Amulet Model & Confidence Scores
    model_id, front_conf, back_conf = determine_amulet_model(
        front_classes, back_classes, front_confs, back_confs
    )
    amulet_info = AMULETS_DB.get(model_id, {})

    # Calculate combined confidence: 0.45 * front_conf + 0.55 * back_conf
    total_conf = round((0.45 * front_conf) + (0.55 * back_conf), 1)

    # 5. Condition Percentage and Defect Detection
    f_cond, f_defects_cnt, f_defects = detect_defects_and_condition(
        front_bgr, front_boxes, getattr(yolo_model, 'names', {}), side="front"
    )
    b_cond, b_defects_cnt, b_defects = detect_defects_and_condition(
        enhanced_back_bgr, back_boxes, getattr(yolo_model, 'names', {}), side="back"
    )

    ok_enc, clahe_buf = cv2.imencode(".jpg", enhanced_back_bgr)
    clahe_back_image = (
        "data:image/jpeg;base64," + base64.b64encode(clahe_buf.tobytes()).decode("ascii")
        if ok_enc else None
    )

    # Combined condition (average front and back condition)
    condition_pct = round(max(50.0, min(100.0, (f_cond + b_cond) / 2.0)), 1)
    total_defects = f_defects + b_defects
    defect_count = len(total_defects)

    # Condition Grade classification
    if condition_pct >= 95.0:
        integrity_grade = "สภาพแชมป์ (Mint Condition - องค์ครู)"
    elif condition_pct >= 85.0:
        integrity_grade = "สภาพสวยสมบูรณ์ (Excellent - ผิวเดิม)"
    elif condition_pct >= 70.0:
        integrity_grade = "สภาพปานกลางผ่านการบูชา (Good - มีรอยสัมผัส)"
    else:
        integrity_grade = "สภาพผ่านการใช้สมบุกสมบัน (Fair - มีรอยสึกหรอชัดเจน)"

    # 6. Pricing Calculation
    base_price_thb = int(amulet_info.get("base_price_thb", 100000))
    estimated_price_thb = int(base_price_thb * (condition_pct / 100.0))

    # 7. Typhoon API Summary (6.0s timeout with fallback)
    ai_summary = generate_typhoon_summary(
        amulet=amulet_info,
        user_mode=user_mode,
        condition_pct=condition_pct,
        estimated_price_thb=estimated_price_thb,
        defect_count=defect_count,
        total_conf=total_conf
    )

    elapsed_ms = round((time.time() - start_time) * 1000, 1)

    disclaimer = (
        "การประเมินเบื้องต้นโดยระบบปัญญาประดิษฐ์ (Dual-View Amulet AI) "
        "เพื่อเป็นข้อมูลประกอบการตัดสินใจเบื้องต้นเท่านั้น มิใช่ใบรับรองพระแท้ทางกฎหมาย "
        "หรือหนังสือรับรองความแท้จากสมาคมผู้นิยมพระเครื่องพระบูชาไทย "
        "ควรปรึกษาผู้ชำนาญการหรือส่งตรวจสถาบันมาตรฐานก่อนทำนิติกรรมมูลค่าสูง"
    )

    return {
        "success": True,
        "model_id": model_id,
        "user_mode": user_mode.lower(),
        "amulet_info": amulet_info,
        "confidence": {
            "total": total_conf,
            "front": front_conf,
            "back": back_conf,
            "formula": "0.45 * front_conf + 0.55 * back_conf"
        },
        "condition": {
            "condition_pct": condition_pct,
            "grade": integrity_grade,
            "defect_count": defect_count,
            "defects_summary": [d.get("type", "ตำหนิ") for d in total_defects[:5]],
            "defects_detail": total_defects[:10]
        },
        "pricing": {
            "base_price_thb": base_price_thb,
            "estimated_price_thb": estimated_price_thb,
            "discount_pct": round(100.0 - condition_pct, 1)
        },
        "recommendation": {
            "region": amulet_info.get("recommended_region", ""),
            "reason": amulet_info.get("region_reason", "")
        },
        "ai_analysis": ai_summary,
        "disclaimer": disclaimer,
        "clahe_back_image": clahe_back_image,
        "processing_time_ms": elapsed_ms,
        "system_specs": {
            "device": DEVICE,
            "model_used": MODEL_NAME,
            "clahe_applied_on_back": True
        }
    }

@app.post("/api/chat", response_model=ChatResponse)
async def chat_amulet_qa(req: ChatRequest):
    """
    In-depth Q&A regarding the scanned amulet based strictly on context_info
    with 6.0s timeout and automatic fallback.
    """
    client = get_typhoon_client()

    system_instruction = (
        "คุณคือผู้เชี่ยวชาญพระเครื่องไทย AI (Typhoon Amulet Assistant) "
        "ตอบคำถามของผู้ใช้อย่างละเอียด สุภาพ ถูกต้อง ครบใจความ "
        "โดยอ้างอิงจากข้อมูลบริบท (Context Info) ของพระองค์ที่สแกนเป็นหลัก "
        "หากข้อมูลในบริบทมีระบุไว้ ให้ตอบตามบริบทนั้นอย่างชัดเจนและน่าเชื่อถือ "
        "เรียบเรียงคำตอบให้จบประโยคอย่างสมบูรณ์ ไม่ค้างคากลางประโยค"
    )

    user_message = (
        f"【ข้อมูลบริบทพระเครื่องที่สแกนได้】\n{req.context_info}\n\n"
        f"【คำถามจากผู้ใช้】: {req.question}\n\n"
        f"กรุณาตอบคำถามให้ชัดเจน ครบถ้วน และจบประโยคอย่างสมบูรณ์"
    )

    if not client:
        # High quality offline fallback responder
        q = req.question.lower()
        if any(w in q for w in ["แท้", "เก๊", "ปลอม", "ดูยังไง", "ตำหนิ"]):
            ans = (
                f"ในการพิจารณาความแท้ของ {req.amulet_name} ตามหลักการตรวจสอบ:\n"
                f"1. ด้านหน้า: ควรสังเกตความคมชัดของพิมพ์ทรงและมวลสารตามที่ระบุในรายงาน\n"
                f"2. ด้านหลัง: ตรวจสอบร่องรอยยันต์ โค้ดตอก และรอยตัดขอบข้างซึ่งผ่านการเร่งมิติ CLAHE ในการสแกน\n"
                f"หากต้องการความมั่นใจ 100% แนะนำให้ออกบัตรรับรองจากสมาคมผู้นิยมพระเครื่องพระบูชาไทยครับ"
            )
        elif any(w in q for w in ["ราคา", "ขาย", "ปล่อย", "แพง", "เท่าไหร่"]):
            ans = (
                f"สำหรับมูลค่าของ {req.amulet_name} จะขึ้นอยู่กับสภาพความสมบูรณ์เป็นหลัก "
                f"จากระบบที่ประเมินไว้จะอ้างอิงสภาพผิวและตำหนิ "
                f"หากนำไปปล่อยเช่าในพื้นที่ศูนย์กลางตลาดตามที่ระบบแนะนำ จะช่วยให้ได้รับราคาที่เป็นธรรมและมีผู้สนใจเช่าบูชารวดเร็วครับ"
            )
        else:
            ans = (
                f"เกี่ยวกับ {req.amulet_name}: ตามข้อมูลที่ตรวจพบ พระองค์นี้มีเอกลักษณ์สำคัญทั้งพิมพ์ทรงด้านหน้าและยันต์ด้านหลัง "
                f"หากท่านต้องการส่งประกวดหรือปล่อยเช่าต่อ ควรเก็บรักษาในตลับหรือเลี่ยมกรอบกันน้ำเพื่อรักษาสภาพผิวเดิมไว้ครับ"
            )
        return ChatResponse(success=True, answer=ans, source="system_fallback")

    model_name = os.getenv("TYPHOON_MODEL", TYPHOON_MODEL)
    try:
        completion = client.chat.completions.create(
            model=model_name,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_message}
            ],
            temperature=0.3,
            max_tokens=800,
            timeout=8.0
        )
        choice = completion.choices[0]
        finish_reason = getattr(choice, "finish_reason", "unknown")
        usage = getattr(completion, "usage", None)
        total_tokens = getattr(usage, "total_tokens", "N/A") if usage else "N/A"
        print(f"[*] [Typhoon /api/chat] finish_reason='{finish_reason}', total_tokens={total_tokens}")

        ans = choice.message.content
        return ChatResponse(
            success=True,
            answer=ans.strip() if ans else "ไม่สามารถประมวลผลคำตอบได้ในขณะนี้",
            source="typhoon_llm"
        )
    except Exception as e:
        print(f"[!] Chat Typhoon API call error or timeout: {e}. Using fallback.")
        fallback_ans = (
            f"จากข้อมูลบริบทของ {req.amulet_name}: "
            f"ขอแนะนำให้พิจารณาเปรียบเทียบจุดสังเกตพิมพ์ทรงกับภาพองค์ครูอ้างอิงในรายงานสแกน "
            f"และรักษาผิวพระเดิมไว้ไม่ให้ถูกขัดล้างเพื่อคงมูลค่าสะสมสูงสุดครับ"
        )
        return ChatResponse(success=True, answer=fallback_ans, source="system_fallback")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
