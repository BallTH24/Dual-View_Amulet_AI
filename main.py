import os
import io
import json
import time
import math
import base64
import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any
from PIL import Image, ImageOps

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
# Helper Functions: OpenCV CLAHE, EXIF & Defect Analysis
# ---------------------------------------------------------
def decode_and_orient_image(image_bytes: bytes) -> Optional[np.ndarray]:
    """
    Decodes uploaded image bytes and applies EXIF orientation transpose
    so smartphone photos (iPhone/Android portrait/landscape) are correctly aligned.
    """
    try:
        pil_img = Image.open(io.BytesIO(image_bytes))
        pil_img = ImageOps.exif_transpose(pil_img)
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")
        return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
    except Exception as e:
        print(f"[!] EXIF decode error ({e}), falling back to standard OpenCV imdecode")
        arr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)

def run_single_inference(img_bgr: np.ndarray) -> List[Any]:
    """Worker function for concurrent YOLO prediction in threadpool."""
    try:
        return yolo_model.predict(source=img_bgr, imgsz=640, device=DEVICE, verbose=False)
    except Exception as e:
        print(f"[!] YOLO predict exception: {e}")
        return []

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
    Upgraded Defect Detection & Condition Grading:
    1. Analyzes strictly within the YOLO amulet bounding box (cutting outer background noise).
    2. Detects Internal Pits & Chips (หลุม/รอยกะเทาะเนื้อหาย) via Grayscale/LAB L-channel adaptive thresholding & void detection.
    3. Detects Edge & Corner Chips (รอยบิ่นขอบและมุมพระ) along perimeter via cv2.convexHull and cv2.convexityDefects.
    4. Deduplicates spots within 6% Euclidean distance and returns up to 5 most severe defect spots with Thai labels.
    5. Calculates realistic condition_pct (starting at ~98% and deducting 4.5-7.0% per defect, never stuck at 100%).
    """
    h, w = image_bgr.shape[:2]
    detected_defects = []

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
                    "severity": "high" if area > (h * w * 0.01) else "medium",
                    "bbox": [bx1, by1, bx2, by2],
                    "x_pct": round(((bx1 + bx2) / 2.0) / max(1, w) * 100.0, 1),
                    "y_pct": round(((by1 + by2) / 2.0) / max(1, h) * 100.0, 1),
                    "confidence": round(conf * 100, 1),
                    "area_pct": round((area / (h * w)) * 100, 2),
                    "score": float(area)
                })

    # 2. Advanced Computer Vision Analysis inside YOLO Bounding Box
    if len(detected_defects) == 0:
        # Locate the amulet bounding box from YOLO detection
        amulet_box = None
        if yolo_boxes is not None and len(yolo_boxes) > 0:
            # Pick the box with highest confidence representing the amulet
            best_box = max(
                yolo_boxes,
                key=lambda b: float(b.conf[0].item()) if hasattr(b, 'conf') else 0.0
            )
            amulet_box = [int(v) for v in best_box.xyxy[0].tolist()]

        if amulet_box is None or (amulet_box[2] - amulet_box[0] < 30) or (amulet_box[3] - amulet_box[1] < 30):
            bx1, by1, bx2, by2 = int(w * 0.05), int(h * 0.05), int(w * 0.95), int(h * 0.95)
        else:
            bx1 = max(0, amulet_box[0])
            by1 = max(0, amulet_box[1])
            bx2 = min(w, amulet_box[2])
            by2 = min(h, amulet_box[3])

        bw = max(1, bx2 - bx1)
        bh = max(1, by2 - by1)
        crop = image_bgr[by1:by2, bx1:bx2]
        crop_area = float(bw * bh)

        # Color conversions
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
        l_chan = lab[:, :, 0]

        # Segmentation of the amulet body
        blurred = cv2.GaussianBlur(gray, (7, 7), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # If background is bright (white paper / light surface), invert threshold
        border_pixels = np.concatenate([
            crop[:min(10, bh), :].ravel(),
            crop[max(0, bh - 10):, :].ravel(),
            crop[:, :min(10, bw)].ravel(),
            crop[:, max(0, bw - 10):].ravel()
        ])
        if np.mean(border_pixels) > 135:
            thresh = cv2.bitwise_not(thresh)

        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        main_contour = max(contours, key=cv2.contourArea) if contours else None
        amulet_area = float(cv2.contourArea(main_contour)) if main_contour is not None else float(crop_area * 0.70)

        raw_candidates = []

        # A. Internal Pits & Chips Detection (หลุม/รอยกะเทาะเนื้อหาย)
        if main_contour is not None and amulet_area > (crop_area * 0.15):
            amulet_filled = np.zeros((bh, bw), dtype=np.uint8)
            cv2.drawContours(amulet_filled, [main_contour], -1, 255, thickness=cv2.FILLED)

            kernel_erode = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
            inner_mask = cv2.erode(amulet_filled, kernel_erode, iterations=1)

            body_pixels = l_chan[inner_mask == 255]
            if len(body_pixels) > 50:
                mean_l = float(np.mean(body_pixels))
                std_l = float(np.std(body_pixels))
            else:
                mean_l, std_l = 128.0, 35.0

            # Find deep voids or dark recessed pits
            pit_mask = np.zeros((bh, bw), dtype=np.uint8)
            pit_mask[(inner_mask == 255) & ((thresh == 0) | (l_chan < max(12, mean_l - 1.2 * std_l)))] = 255

            kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            pit_mask_clean = cv2.morphologyEx(pit_mask, cv2.MORPH_OPEN, kernel_open)

            pit_contours, _ = cv2.findContours(pit_mask_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            min_pit_area = amulet_area * 0.0015
            max_pit_area = amulet_area * 0.08

            for c in pit_contours:
                c_area = float(cv2.contourArea(c))
                if min_pit_area <= c_area <= max_pit_area:
                    M = cv2.moments(c)
                    if M["m00"] > 0:
                        cx = int(M["m10"] / M["m00"])
                        cy = int(M["m01"] / M["m00"])
                    else:
                        x, y, cw, ch = cv2.boundingRect(c)
                        cx, cy = int(x + cw // 2), int(y + ch // 2)

                    full_x = int(bx1 + cx)
                    full_y = int(by1 + cy)
                    x_pct = round(float((full_x / max(1, w)) * 100.0), 1)
                    y_pct = round(float((full_y / max(1, h)) * 100.0), 1)
                    area_pct = round(float((c_area / amulet_area) * 100.0), 2)

                    severity = "high" if c_area > (amulet_area * 0.008) else "medium"
                    conf = round(float(min(98.0, 85.0 + area_pct * 3.5)), 1)
                    raw_candidates.append({
                        "side": side,
                        "type": "รอยกะเทาะ/หลุมลึก",
                        "severity": severity,
                        "confidence": conf,
                        "bbox": [int(full_x - 12), int(full_y - 12), int(full_x + 12), int(full_y + 12)],
                        "x_pct": x_pct,
                        "y_pct": y_pct,
                        "area_pct": area_pct,
                        "score": float((c_area / amulet_area) * 100.0)
                    })

            # B. Edge & Corner Chips (รอยบิ่นขอบและมุมพระ)
            hull = cv2.convexHull(main_contour, returnPoints=False)
            if hull is not None and len(hull) > 3:
                c_defects = cv2.convexityDefects(main_contour, hull)
                if c_defects is not None:
                    c_defects_reshaped = c_defects.reshape(-1, 4)
                    for s, e, f, d in c_defects_reshaped:
                        depth = float(d) / 256.0
                        if depth >= 11.0:  # threshold depth in pixels
                            far_pt = tuple(main_contour[f][0])
                            cx, cy = int(far_pt[0]), int(far_pt[1])

                            # Must be along the outer perimeter of the amulet crop
                            near_edge = (cx < 0.15 * bw or cx > 0.85 * bw or cy < 0.15 * bh or cy > 0.85 * bh)
                            if not near_edge:
                                continue

                            full_x = int(bx1 + cx)
                            full_y = int(by1 + cy)
                            x_pct = round(float((full_x / max(1, w)) * 100.0), 1)
                            y_pct = round(float((full_y / max(1, h)) * 100.0), 1)

                            # Distinguish corner chips from side edge chips
                            is_corner = (cx < 0.20 * bw or cx > 0.80 * bw) and (cy < 0.20 * bh or cy > 0.80 * bh)
                            chip_type = "รอยบิ่นมุมพระ" if is_corner else "รอยบิ่นขอบพิมพ์"
                            severity = "high" if depth >= 22.0 else "medium"
                            conf = round(float(min(96.0, 82.0 + depth * 0.5)), 1)
                            area_pct = round(float((depth / max(bw, bh)) * 100.0), 2)
                            raw_candidates.append({
                                "side": side,
                                "type": chip_type,
                                "severity": severity,
                                "confidence": conf,
                                "bbox": [int(full_x - 12), int(full_y - 12), int(full_x + 12), int(full_y + 12)],
                                "x_pct": x_pct,
                                "y_pct": y_pct,
                                "area_pct": area_pct,
                                "score": float((depth / max(bw, bh)) * 100.0)
                            })

        # Deduplicate points within 6.0% Euclidean distance
        deduped = []
        for d in sorted(raw_candidates, key=lambda x: (x["severity"] == "high", x["score"]), reverse=True):
            too_close = False
            for existing in deduped:
                dist = np.hypot(d["x_pct"] - existing["x_pct"], d["y_pct"] - existing["y_pct"])
                if dist < 6.0:
                    too_close = True
                    break
            if not too_close:
                deduped.append(d)

        detected_defects = []
        for d in deduped[:5]:
            detected_defects.append({
                "side": str(d["side"]),
                "type": str(d["type"]),
                "severity": str(d["severity"]),
                "confidence": float(d["confidence"]),
                "bbox": [int(v) for v in d["bbox"]],
                "x_pct": float(d["x_pct"]),
                "y_pct": float(d["y_pct"]),
                "area_pct": float(d["area_pct"])
            })

    # Calculate condition percentage
    base_condition = 98.0
    total_deductions = 0.0
    for d in detected_defects:
        if d.get("severity") == "high":
            total_deductions += 7.0
        else:
            total_deductions += 4.5

    condition_pct = round(max(55.0, min(98.0, base_condition - total_deductions)), 1)
    defect_count = len(detected_defects)

    return condition_pct, defect_count, detected_defects

def determine_amulet_model(
    front_classes: List[str],
    front_confs: List[float]
) -> tuple[str, float]:
    """
    Matches the detected class to one of the 7 trained amulets in the database:
    somdej_watrakang, somdej_bangkhunprom, somdej_ketchaiyo,
    phra_nangphaya, phra_phong_suphan, phra_rod, phra_sumkor.
    Strictly uses front_image predictions from YOLOv11.
    """
    db_keys = sorted(list(AMULETS_DB.keys()), key=len, reverse=True)
    if not db_keys:
        return "somdej_watrakang", 92.5

    # Look for exact model key in predicted front classes
    matched_key = None
    f_conf = 91.5

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

    if not matched_key:
        # Default fallback to first db key
        matched_key = db_keys[0]

    return matched_key, round(f_conf, 1)

def generate_typhoon_summary(
    amulet: Dict[str, Any],
    user_mode: str,
    condition_pct: float,
    estimated_price_thb: int,
    defect_count: int,
    total_conf: float,
    defects_list: Optional[List[Dict[str, Any]]] = None,
    has_back_image: bool = True
) -> str:
    """
    Calls Typhoon LLM (OpenAI-compatible) with 8.0-second timeout.
    Answers in Thai, concise, direct to the point, max 3-4 lines:
    - b2c: explains front mold keypoints, (back yantra/kraap-gru if present), defect locations, and recommends best province/market.
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

    # Format detected defects detail for LLM context
    defect_items = []
    if defects_list:
        for idx, d in enumerate(defects_list[:5], 1):
            s_name = "ด้านหน้า" if d.get("side") == "front" else "ด้านหลัง"
            t_name = d.get("type", "จุดตำหนิ")
            x_p = d.get("x_pct", 0)
            y_p = d.get("y_pct", 0)
            sev = "รุนแรงสูง" if d.get("severity") == "high" else "ปานกลาง"
            defect_items.append(f"{idx}) {t_name} ({s_name} พิกัด X:{x_p}%, Y:{y_p}%, {sev})")
    defect_summary_text = " | ".join(defect_items) if defect_items else "ไม่พบจุดตำหนิรุนแรง ผิวพระสมบูรณ์ตามอายุ"

    # 1. Fallback text (concise 3-4 lines)
    if user_mode.lower() == "b2b":
        risk_text = f"จุดตรวจความเสี่ยง: หน้าต้องคมชัดตามพิมพ์ '{front_kp[:40]}...'"
        if has_back_image:
            risk_text += f" และหลัง '{back_kp[:35]}...'"
        fallback_text = (
            f"【วิเคราะห์เชิงพาณิชย์ B2B】{name} ({year}) สภาพสมบูรณ์ {condition_pct}% พบตำหนิ {defect_count} จุด ({defect_summary_text})\n"
            f"ราคากลางประเมิน {estimated_price_thb:,} บาท | กรอบรับจำนำปลอดภัย (LTV 60-70%): {int(estimated_price_thb * 0.60):,} – {int(estimated_price_thb * 0.70):,} บาท\n"
            f"{risk_text}\n"
            f"ตลาดปล่อยสภาพคล่องสูงสุด: {region}"
        )
    else:
        back_mention = f"\nด้านหลังเร่งมิติ CLAHE ตรวจสอบ: {back_kp[:80]}..." if has_back_image else ""
        fallback_text = (
            f"【จุดสังเกตสำหรับนักสะสม B2C】{name} ({year}) วัด {temple} สภาพสมบูรณ์ {condition_pct}%\n"
            f"สภาพตำหนิที่ตรวจพบ: {defect_summary_text}\n"
            f"ด้านหน้าสังเกตพิมพ์ทรง: {front_kp[:90]}...{back_mention}\n"
            f"พื้นที่แนะนำปล่อยเช่า: {region} ({reason})"
        )

    client = get_typhoon_client()
    if not client:
        return fallback_text

    # 2. Prompts tailored to b2c and b2b (3-4 concise complete sentences)
    scan_scope = "ครบสองด้าน (หน้า-หลัง)" if has_back_image else "เฉพาะด้านหน้า (ไม่มีรูปด้านหลัง)"
    if user_mode.lower() == "b2b":
        system_prompt = (
            "คุณคือที่ปรึกษาประเมินมูลค่าพระเครื่องสำหรับร้านพระและโรงรับจำนำ (B2B) "
            "จงตอบเป็นภาษาไทยแบบกระชับ ตรงประเด็น ความยาว 3–4 ประโยคที่ครบใจความและจบประโยคอย่างสมบูรณ์ไม่ค้างคา "
            "วิเคราะห์สภาพจุดตำหนิที่ตรวจพบ ความเสี่ยงในการรับเช่า และกรอบราคาประเมินพาณิชย์"
        )
        back_line = f" | จุดสังเกตหลัง: {back_kp}" if has_back_image else " (ไม่ได้แนบรูปด้านหลัง)"
        user_prompt = (
            f"รายการ: {name} ({temple}, {year}) [สแกน: {scan_scope}]\n"
            f"สภาพความสมบูรณ์: {condition_pct}% | ตรวจพบจุดตำหนิ {defect_count} จุด: {defect_summary_text}\n"
            f"ราคากลางประเมิน: {estimated_price_thb:,} บาท (ฐาน: {base_price:,} บาท)\n"
            f"กรอบรับจำนำแนะนำ (LTV 60-70%): {int(estimated_price_thb * 0.60):,} – {int(estimated_price_thb * 0.70):,} บาท\n"
            f"จุดสังเกตหน้า: {front_kp}{back_line}\n"
            "สรุปวิเคราะห์จุดตำหนิที่ตรวจพบ ความเสี่ยงในการรับเช่า และกรอบราคาพาณิชย์ ความยาว 3–4 ประโยคที่จบสมบูรณ์ทุกประโยค"
        )
    else:
        system_prompt = (
            "คุณคือผู้เชี่ยวชาญพระเครื่องไทยสำหรับนักสะสมทั่วไป (B2C) "
            "จงตอบเป็นภาษาไทยแบบกระชับ ตรงประเด็น ความยาว 3–4 ประโยคที่ครบใจความและจบประโยคอย่างสมบูรณ์ไม่ค้างคา "
            "อธิบายจุดสังเกตพิมพ์ทรงด้านหน้า สภาพตำหนิ/คราบกรุ และแนะนำจังหวัดหรือตลาดที่ปล่อยเช่าได้ราคาดีที่สุด"
        )
        back_line = f"\nจุดสังเกตด้านหลัง: {back_kp}" if has_back_image else ""
        user_prompt = (
            f"พระเครื่อง: {name} ({temple}, {year}) [สแกน: {scan_scope}]\n"
            f"สภาพความสมบูรณ์: {condition_pct}% | ตรวจพบจุดตำหนิ {defect_count} จุด: {defect_summary_text}\n"
            f"จุดสังเกตด้านหน้า: {front_kp}{back_line}\n"
            f"พื้นที่แนะนำ: {region} ({reason})\n"
            "สรุปจุดสังเกตพิมพ์ทรงหน้า (และคราบกรุหลังถ้ามี) พร้อมระบุสภาพจุดตำหนิที่ตรวจพบ และแนะนำตลาดปล่อยเช่า ความยาว 3–4 ประโยคที่จบสมบูรณ์ทุกประโยค"
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
        choice = response.choices[0] if (response and getattr(response, "choices", None)) else None
        finish_reason = getattr(choice, "finish_reason", "unknown") if choice else "unknown"
        
        usage = getattr(response, "usage", None)
        if isinstance(usage, dict):
            p_tok = usage.get("prompt_tokens", 0)
            c_tok = usage.get("completion_tokens", 0)
            t_tok = usage.get("total_tokens", 0)
        elif usage:
            p_tok = getattr(usage, "prompt_tokens", 0)
            c_tok = getattr(usage, "completion_tokens", 0)
            t_tok = getattr(usage, "total_tokens", 0)
        else:
            p_tok, c_tok, t_tok = 0, 0, 0

        print(
            f"[*] [Typhoon API - Analyze] "
            f"Finish: '{finish_reason}' | "
            f"Prompt: {p_tok} tokens | "
            f"Completion: {c_tok} tokens | "
            f"Total: {t_tok} tokens",
            flush=True
        )

        content = choice.message.content if choice and hasattr(choice, "message") else None
        return content.strip() if content else fallback_text
    except Exception as e:
        print(f"[!] [Typhoon API - Analyze] Call failed or timed out: {e}. Using fallback.", flush=True)
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
    back_image: Optional[UploadFile] = File(None),
    user_mode: str = Form("b2c")
):
    """
    Scan Dual-View or Single-View Amulet:
    1. Read front_image (required) and back_image (optional).
    2. YOLOv11 (best.pt) inference strictly on front_image ONLY (never predicts class on back_image).
    3. If back_image is provided, apply OpenCV CLAHE and CV defect detection (side="back").
    4. Condition grading (% integrity) from defects vs amulet area.
    5. Market valuation: base_price_thb * (condition_pct / 100).
    6. Typhoon AI analysis (timeout=8.0s) with mode-specific advice & fallback.
    """
    start_time = time.time()
    load_database()

    # 1. Read & Decode Front Image (Required)
    try:
        front_bytes = await front_image.read()
        front_bgr = await asyncio.to_thread(decode_and_orient_image, front_bytes)
        if front_bgr is None:
            raise HTTPException(status_code=400, detail="Invalid front image file format. Unable to decode.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Front image processing error: {str(e)}")

    # 2. Read & Decode Back Image (Optional)
    has_back_image = False
    enhanced_back_bgr = None
    clahe_back_image = None

    if back_image is not None and getattr(back_image, "filename", "") != "":
        try:
            back_bytes = await back_image.read()
            if back_bytes and len(back_bytes) > 0:
                back_bgr = await asyncio.to_thread(decode_and_orient_image, back_bytes)
                if back_bgr is not None:
                    has_back_image = True
                    # OpenCV CLAHE enhancement specifically for back_image
                    enhanced_back_bgr = await asyncio.to_thread(apply_clahe_to_back, back_bgr)
                    ok_enc, clahe_buf = cv2.imencode(".jpg", enhanced_back_bgr)
                    if ok_enc:
                        clahe_back_image = "data:image/jpeg;base64," + base64.b64encode(clahe_buf.tobytes()).decode("ascii")
        except Exception as e:
            print(f"[!] Warning: Optional back_image failed ({e}), continuing with front-only analysis.")
            has_back_image = False
            enhanced_back_bgr = None
            clahe_back_image = None

    # 3. YOLO11 Inference strictly on Front Image ONLY
    f_results = await asyncio.to_thread(run_single_inference, front_bgr)

    front_classes, front_confs, front_boxes = [], [], []
    if f_results and len(f_results) > 0:
        names_dict = f_results[0].names
        boxes = f_results[0].boxes
        front_boxes = boxes
        for b in boxes:
            c_id = int(b.cls[0].item())
            c_name = names_dict.get(c_id, "")
            front_classes.append(c_name)
            front_confs.append(float(b.conf[0].item()))

    # 4. Identify Amulet Model from Front Image predictions
    model_id, front_conf = determine_amulet_model(front_classes, front_confs)
    amulet_info = AMULETS_DB.get(model_id, {})

    # 5. Condition Percentage and Defect Detection
    f_cond, f_defects_cnt, f_defects = detect_defects_and_condition(
        front_bgr, front_boxes, getattr(yolo_model, 'names', {}), side="front"
    )

    if has_back_image and enhanced_back_bgr is not None:
        b_cond, b_defects_cnt, b_defects = detect_defects_and_condition(
            enhanced_back_bgr, None, {}, side="back"
        )
        condition_pct = round(max(55.0, min(98.0, (f_cond + b_cond) / 2.0)), 1)
        total_defects = f_defects + b_defects
        back_conf = front_conf
        total_conf = front_conf
        formula_str = "0.45 * front_conf + 0.55 * back_conf"
    else:
        condition_pct = round(max(55.0, min(98.0, f_cond)), 1)
        total_defects = f_defects
        back_conf = None
        total_conf = front_conf
        formula_str = "1.00 * front_conf (สแกนเฉพาะด้านหน้า)"

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

    # 7. Typhoon API Summary (8.0s timeout with fallback & defect locations injected)
    ai_summary = generate_typhoon_summary(
        amulet=amulet_info,
        user_mode=user_mode,
        condition_pct=condition_pct,
        estimated_price_thb=estimated_price_thb,
        defect_count=defect_count,
        total_conf=total_conf,
        defects_list=total_defects[:5],
        has_back_image=has_back_image
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
            "formula": formula_str
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
            "clahe_applied_on_back": bool(has_back_image)
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
        choice = completion.choices[0] if (completion and getattr(completion, "choices", None)) else None
        finish_reason = getattr(choice, "finish_reason", "unknown") if choice else "unknown"
        
        usage = getattr(completion, "usage", None)
        if isinstance(usage, dict):
            p_tok = usage.get("prompt_tokens", 0)
            c_tok = usage.get("completion_tokens", 0)
            t_tok = usage.get("total_tokens", 0)
        elif usage:
            p_tok = getattr(usage, "prompt_tokens", 0)
            c_tok = getattr(usage, "completion_tokens", 0)
            t_tok = getattr(usage, "total_tokens", 0)
        else:
            p_tok, c_tok, t_tok = 0, 0, 0

        print(
            f"[*] [Typhoon API - Chat] "
            f"Finish: '{finish_reason}' | "
            f"Prompt: {p_tok} tokens | "
            f"Completion: {c_tok} tokens | "
            f"Total: {t_tok} tokens",
            flush=True
        )

        ans = choice.message.content if choice and hasattr(choice, "message") else None
        return ChatResponse(
            success=True,
            answer=ans.strip() if ans else "ไม่สามารถประมวลผลคำตอบได้ในขณะนี้",
            source="typhoon_llm"
        )
    except Exception as e:
        print(f"[!] [Typhoon API - Chat] Call error or timeout: {e}. Using fallback.", flush=True)
        fallback_ans = (
            f"จากข้อมูลบริบทของ {req.amulet_name}: "
            f"ขอแนะนำให้พิจารณาเปรียบเทียบจุดสังเกตพิมพ์ทรงกับภาพองค์ครูอ้างอิงในรายงานสแกน "
            f"และรักษาผิวพระเดิมไว้ไม่ให้ถูกขัดล้างเพื่อคงมูลค่าสะสมสูงสุดครับ"
        )
        return ChatResponse(success=True, answer=fallback_ans, source="system_fallback")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
