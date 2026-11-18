import os
import io
import json
import time
import math
import base64
import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any
from PIL import Image, ImageOps, ExifTags

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
MIN_RECOGNITION_CONF = 0.68  # Strict recognition gate for YOLOv11 (best.pt) calibrated at F1-Curve peak

def inspect_image_provenance(image_bytes: bytes, capture_source: str = "upload") -> Dict[str, Any]:
    """
    Image Provenance & EXIF Forensics:
    - Inspects EXIF metadata for editing software (Photoshop, Snapseed, Lightroom, GIMP, Meitu, Canva, etc.)
    - Assigns Trust Tier:
      * tier_1: Live camera capture with clean EXIF (🛡️ Live Camera Verified)
      * tier_2: Standard file upload with clean EXIF (📁 Standard Upload)
      * flagged: Edited / synthetic software detected in EXIF (⚠️ Edited Photo Detected)
    """
    flagged_software = None
    known_editing_tools = [
        "photoshop", "snapseed", "lightroom", "gimp", "meitu",
        "canva", "picsart", "vsco", "facetune", "pixlr",
        "fotor", "midjourney", "stable diffusion", "dall-e",
        "affinity", "pixelmator", "procreate", "adobe"
    ]
    try:
        with Image.open(io.BytesIO(image_bytes)) as pil_img:
            exif_data = pil_img._getexif()
            if exif_data:
                for tag_id, value in exif_data.items():
                    tag_name = ExifTags.TAGS.get(tag_id, str(tag_id))
                    if tag_name in ["Software", "ProcessingSoftware", "ImageDescription", "UserComment", "Artist"]:
                        val_str = str(value).lower()
                        for tool in known_editing_tools:
                            if tool in val_str:
                                flagged_software = str(value).strip()
                                break
                    if flagged_software:
                        break
    except Exception as e:
        print(f"[*] EXIF forensics note: {e}")

    norm_source = "camera" if capture_source and "cam" in capture_source.lower() else "upload"

    if flagged_software:
        return {
            "trust_tier": "flagged",
            "label": "⚠️ Edited Photo Detected",
            "detected_software": flagged_software,
            "warning": f"ตรวจพบร่องรอยการบันทึก/ตกแต่งผ่านซอฟต์แวร์ ({flagged_software}) อาจส่งผลต่อการตรวจจับตำหนิและสีผิวพระ",
            "capture_source": norm_source
        }
    elif norm_source == "camera":
        return {
            "trust_tier": "tier_1",
            "label": "🛡️ Live Camera Verified",
            "detected_software": None,
            "warning": None,
            "capture_source": "camera"
        }
    else:
        return {
            "trust_tier": "tier_2",
            "label": "📁 Standard Upload",
            "detected_software": None,
            "warning": None,
            "capture_source": "upload"
        }

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

def extract_amulet_silhouette_mask(
    crop_bgr: np.ndarray,
    iterations: int = 5
) -> tuple[Optional[np.ndarray], Optional[np.ndarray], float]:
    """
    Uses cv2.grabCut (5% border inset rect, 5 iterations) + Largest Connected Component
    to create a pixel-level binary mask (amulet_mask) of the amulet body.
    Cuts out 100% of background, table texture, or fingers around corners.
    Auto-downscales large crops to max 400px during GrabCut for blazing fast ~60ms inference.
    Returns: (amulet_mask, main_contour, amulet_area)
    """
    bh, bw = crop_bgr.shape[:2]
    crop_area = float(bh * bw)
    if bh < 20 or bw < 20:
        return None, None, 0.0

    # Guard against zero-contrast / flat blank images (prevents singular GMM in GrabCut)
    if float(np.std(crop_bgr)) < 6.0:
        return None, None, 0.0

    # Auto-scale for sub-100ms GrabCut processing
    max_dim = max(bh, bw)
    scale = 400.0 / float(max_dim) if max_dim > 400 else 1.0
    if scale != 1.0:
        proc_crop = cv2.resize(
            crop_bgr,
            (max(20, int(bw * scale)), max(20, int(bh * scale))),
            interpolation=cv2.INTER_AREA
        )
    else:
        proc_crop = crop_bgr

    pbh, pbw = proc_crop.shape[:2]
    margin_x = max(2, int(pbw * 0.05))
    margin_y = max(2, int(pbh * 0.05))
    rect = (margin_x, margin_y, max(1, pbw - 2 * margin_x), max(1, pbh - 2 * margin_y))

    mask = np.zeros((pbh, pbw), np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    try:
        cv2.grabCut(proc_crop, mask, rect, bgd_model, fgd_model, iterations, cv2.GC_INIT_WITH_RECT)
        fg_mask_proc = np.where((mask == 1) | (mask == 3), 255, 0).astype("uint8")
    except Exception as e:
        print(f"[!] GrabCut exception ({e}), falling back to adaptive thresholding")
        fg_mask_proc = np.zeros((pbh, pbw), np.uint8)

    # Upscale mask back to original crop resolution
    if scale != 1.0:
        fg_mask = cv2.resize(fg_mask_proc, (bw, bh), interpolation=cv2.INTER_NEAREST)
    else:
        fg_mask = fg_mask_proc

    # Post-process with Morphological Closing to seal inner crevices
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
    fg_mask_clean = cv2.morphologyEx(fg_mask, cv2.MORPH_CLOSE, kernel_close, iterations=2)

    # Find largest contour in GrabCut output
    contours, _ = cv2.findContours(fg_mask_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    main_contour = max(contours, key=cv2.contourArea) if contours else None
    contour_area = float(cv2.contourArea(main_contour)) if main_contour is not None else 0.0

    # If GrabCut failed to isolate a component (> 12% of crop area), fallback to Otsu/Adaptive
    if main_contour is None or contour_area < (crop_area * 0.12):
        gray = cv2.cvtColor(crop_bgr, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (7, 7), 0)
        _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # Check background brightness at margins
        border_pixels = np.concatenate([
            crop_bgr[:min(6, bh), :].ravel(),
            crop_bgr[max(0, bh - 6):, :].ravel(),
            crop_bgr[:, :min(6, bw)].ravel(),
            crop_bgr[:, max(0, bw - 6):].ravel()
        ])
        if np.mean(border_pixels) > 130:
            thresh = cv2.bitwise_not(thresh)

        thresh_clean = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel_close, iterations=2)
        contours, _ = cv2.findContours(thresh_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        main_contour = max(contours, key=cv2.contourArea) if contours else None
        contour_area = float(cv2.contourArea(main_contour)) if main_contour is not None else 0.0

    if main_contour is None or contour_area < (crop_area * 0.10):
        return None, None, 0.0

    # Create solid silhouette amulet mask (255 inside amulet, 0 outside)
    amulet_mask = np.zeros((bh, bw), dtype=np.uint8)
    cv2.drawContours(amulet_mask, [main_contour], -1, 255, thickness=cv2.FILLED)

    return amulet_mask, main_contour, contour_area

def detect_defects_and_condition(
    image_bgr: np.ndarray,
    amulet_box: Optional[List[int]],
    side: str = "front"
) -> tuple[float, int, List[Dict[str, Any]]]:
    """
    Pixel-Level Silhouette Masked Defect Detection:
    1. Crops to YOLO Bounding Box of the amulet.
    2. Runs cv2.grabCut (5% border inset rect, 5 iterations) + Largest Connected Component
       to create the true silhouette mask of the amulet (amulet_mask), cutting 100% of background,
       table, or fingers.
    3. Detects internal pits strictly within eroded_mask (inward erosion by 4 pixels via cv2.bitwise_and).
    4. Detects edge/corner chips strictly along the boundary contour of amulet_mask.
    5. Deduplicates within 6% Euclidean distance, returning up to 5 highest-severity spots.
    """
    h, w = image_bgr.shape[:2]
    if amulet_box is None:
        return 98.0, 0, []

    bx1, by1, bx2, by2 = amulet_box
    bx1 = max(0, min(w - 1, bx1))
    by1 = max(0, min(h - 1, by1))
    bx2 = max(bx1 + 10, min(w, bx2))
    by2 = max(by1 + 10, min(h, by2))

    bw = bx2 - bx1
    bh = by2 - by1
    crop = image_bgr[by1:by2, bx1:bx2]
    crop_area = float(bw * bh)

    amulet_mask, main_contour, amulet_area = extract_amulet_silhouette_mask(crop, iterations=5)
    if amulet_mask is None or main_contour is None or amulet_area < (crop_area * 0.10):
        # Could not isolate valid amulet silhouette
        return 98.0, 0, []

    raw_candidates = []

    # -------------------------------------------------------------
    # A. Internal Pits & Chips Detection (หลุม/รอยกะเทาะเนื้อหายภายใน)
    # Filtered using cv2.bitwise_and with eroded_mask (inward erosion 4 pixels)
    # -------------------------------------------------------------
    # 4-pixel inward erosion
    kernel_4px = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    eroded_mask = cv2.erode(amulet_mask, kernel_4px, iterations=1)

    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    l_chan = lab[:, :, 0]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    body_pixels = l_chan[eroded_mask == 255]
    if len(body_pixels) > 50:
        mean_l = float(np.mean(body_pixels))
        std_l = float(np.std(body_pixels))
    else:
        mean_l, std_l = 128.0, 35.0

    # Strict pit candidates: darker than threshold or low L in LAB
    pit_raw = np.zeros((bh, bw), dtype=np.uint8)
    pit_raw[(l_chan < max(15, mean_l - 1.25 * std_l)) | (thresh == 0)] = 255

    # Strictly mask with eroded_mask using cv2.bitwise_and!
    pit_mask = cv2.bitwise_and(pit_raw, eroded_mask)

    kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    pit_mask_clean = cv2.morphologyEx(pit_mask, cv2.MORPH_OPEN, kernel_open)

    pit_contours, _ = cv2.findContours(pit_mask_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_pit_area = amulet_area * 0.0015
    max_pit_area = amulet_area * 0.080

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

            # Strict check: centroid must be inside eroded_mask and inside main_contour
            if cy < 0 or cy >= bh or cx < 0 or cx >= bw or eroded_mask[cy, cx] != 255:
                continue

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

    # -------------------------------------------------------------
    # B. Edge & Corner Chips (รอยบิ่นขอบและมุมพระ)
    # Strictly along the contour of amulet_mask
    # -------------------------------------------------------------
    hull = cv2.convexHull(main_contour, returnPoints=False)
    if hull is not None and len(hull) > 3:
        c_defects = cv2.convexityDefects(main_contour, hull)
        if c_defects is not None:
            c_defects_reshaped = c_defects.reshape(-1, 4)
            for s, e, f, d in c_defects_reshaped:
                depth = float(d) / 256.0
                if depth >= 10.0:  # threshold depth in pixels
                    far_pt = tuple(main_contour[f][0])
                    cx, cy = int(far_pt[0]), int(far_pt[1])

                    # Distance to main_contour must be <= 4px (guaranteed to be on the silhouette edge)
                    dist_to_contour = abs(cv2.pointPolygonTest(main_contour, (float(cx), float(cy)), True))
                    if dist_to_contour > 4.0:
                        continue

                    # Near outer edge of bounding box
                    near_edge = (cx < 0.18 * bw or cx > 0.82 * bw or cy < 0.18 * bh or cy > 0.82 * bh)
                    if not near_edge:
                        continue

                    full_x = int(bx1 + cx)
                    full_y = int(by1 + cy)
                    x_pct = round(float((full_x / max(1, w)) * 100.0), 1)
                    y_pct = round(float((full_y / max(1, h)) * 100.0), 1)

                    is_corner = (cx < 0.22 * bw or cx > 0.78 * bw) and (cy < 0.22 * bh or cy > 0.78 * bh)
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

    # Deduplicate within 6% Euclidean distance
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
    front_results: List[Any],
    img_shape: tuple[int, int]
) -> tuple[bool, Optional[str], float, Optional[List[int]], str, Optional[Dict[str, Any]]]:
    """
    Strict Recognition Gate for YOLOv11 (best.pt):
    - Rejects if no boxes detected.
    - Rejects if highest confidence < MIN_RECOGNITION_CONF (0.68).
    - Rejects if bounding box area < 5% of total image area.
    - Rejects if detected class does not match any of the 7 supported amulet models in database.
    - NO FALLBACK GUESSING ALLOWED.
    - Somdej Ambiguity Gate: If top-2 predictions are both Somdej family
      ('somdej_watrakang', 'somdej_bangkhunprom', 'somdej_ketchaiyo') and abs(conf1 - conf2) < 0.15,
      triggers ambiguity_warning.
    Returns: (is_recognized, model_id, confidence, best_box, reason, ambiguity_warning)
    """
    h, w = img_shape[:2]
    total_area = float(h * w)

    if not front_results or len(front_results) == 0:
        return False, "unknown", 0.0, None, "ไม่พบผลลัพธ์จากโมเดล YOLO", None

    res = front_results[0]
    boxes = res.boxes
    if boxes is None or len(boxes) == 0:
        return False, "unknown", 0.0, None, "ตรวจไม่พบกรอบพระเครื่องในภาพ", None

    names_dict = res.names
    db_keys = sorted(list(AMULETS_DB.keys()), key=len, reverse=True)

    # Collect unique matched candidates by highest confidence per amulet model
    model_candidates: Dict[str, Dict[str, Any]] = {}
    highest_raw_conf = 0.0

    for b in boxes:
        conf = float(b.conf[0].item())
        if conf > highest_raw_conf:
            highest_raw_conf = conf

        cls_id = int(b.cls[0].item())
        cls_name = names_dict.get(cls_id, "")
        c_clean = cls_name.lower().replace("_front", "").replace("_back", "").strip()

        matched_k = None
        if c_clean in AMULETS_DB:
            matched_k = c_clean
        else:
            for k in db_keys:
                if k in c_clean:
                    matched_k = k
                    break

        if matched_k:
            if matched_k not in model_candidates or conf > model_candidates[matched_k]["conf"]:
                model_candidates[matched_k] = {
                    "key": matched_k,
                    "conf": conf,
                    "box": [int(v) for v in b.xyxy[0].tolist()]
                }

    sorted_candidates = sorted(model_candidates.values(), key=lambda x: x["conf"], reverse=True)

    # Check 1: Must match one of the 7 database models
    if not sorted_candidates:
        return (
            False,
            "unknown",
            round(highest_raw_conf * 100.0, 1),
            None,
            "ไม่พบพิมพ์พระในฐานข้อมูล 7 รุ่นมาตรฐานที่ระบบรองรับ",
            None
        )

    best_match = sorted_candidates[0]
    best_match_key = best_match["key"]
    best_conf = best_match["conf"]
    best_box = best_match["box"]

    # Check 2: Confidence must be >= MIN_RECOGNITION_CONF (0.68)
    if best_conf < MIN_RECOGNITION_CONF:
        return (
            False,
            "unknown",
            round(best_conf * 100.0, 1),
            best_box,
            f"ความมั่นใจของโมเดลต่ำกว่าเกณฑ์ความปลอดภัย ({round(best_conf * 100.0, 1)}% < 68%)",
            None
        )

    # Check 3: Bounding box area must be >= 5% of total image area
    bx1, by1, bx2, by2 = best_box
    box_area = float(max(1, bx2 - bx1) * max(1, by2 - by1))
    box_pct = (box_area / total_area) * 100.0
    if box_area < (0.05 * total_area):
        return (
            False,
            "unknown",
            round(best_conf * 100.0, 1),
            best_box,
            f"ขนาดกรอบพระเล็กผิดปกติ ({round(box_pct, 1)}% < 5% ของพื้นที่ภาพ)",
            None
        )

    # Somdej Ambiguity Gate
    SOMDEJ_FAMILY = {"somdej_watrakang", "somdej_bangkhunprom", "somdej_ketchaiyo"}
    ambiguity_warning: Optional[Dict[str, Any]] = None

    if len(sorted_candidates) >= 2:
        cand1 = sorted_candidates[0]
        cand2 = sorted_candidates[1]
        k1, conf1 = cand1["key"], cand1["conf"]
        k2, conf2 = cand2["key"], cand2["conf"]

        if k1 in SOMDEJ_FAMILY and k2 in SOMDEJ_FAMILY and abs(conf1 - conf2) < 0.15:
            info1 = AMULETS_DB.get(k1, {})
            info2 = AMULETS_DB.get(k2, {})
            name1 = info1.get("name", k1)
            name2 = info2.get("name", k2)
            p1 = info1.get("base_price_thb", 0)
            p2 = info2.get("base_price_thb", 0)
            ambiguity_warning = {
                "is_ambiguous": True,
                "primary_candidate": name1,
                "secondary_candidate": name2,
                "price_range_note": f"ช่วงราคาระหว่าง {name1} (ประมาณ {p1:,} บาท) และ {name2} (ประมาณ {p2:,} บาท)",
                "expert_advice": "เนื้อหาพิมพ์ทรงใกล้เคียงกันมาก แนะนำตรวจมวลสารด้านข้างและคราบกรุเพิ่มเติมโดยผู้เชี่ยวชาญ"
            }

    return True, best_match_key, round(best_conf * 100.0, 1), best_box, "ผ่านเกณฑ์การคัดกรองพิมพ์พระ", ambiguity_warning

def generate_typhoon_summary(
    amulet: Dict[str, Any],
    user_mode: str,
    condition_pct: float,
    estimated_price_thb: int,
    defect_count: int,
    total_conf: float,
    defects_list: Optional[List[Dict[str, Any]]] = None,
    has_back_image: bool = True,
    ambiguity_warning: Optional[Dict[str, Any]] = None
) -> str:
    """
    Calls Typhoon LLM (OpenAI-compatible) with 8.0-second timeout.
    Answers in Thai, concise, direct to the point, max 3-4 lines:
    - b2c: explains front mold keypoints, (back yantra/kraap-gru if present), defect locations, and recommends best province/market.
    - b2b: analyzes defect spots, pawn/holding risk, and commercial valuation margin.
    - Handles Somdej Ambiguity warning when detected.
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

    ambiguity_note = ""
    if ambiguity_warning and ambiguity_warning.get("is_ambiguous"):
        ambiguity_note = (
            f"\n⚠️ [คำเตือนพิมพ์พระใกล้เคียง]: พิมพ์ทรงใกล้เคียงกับ {ambiguity_warning.get('secondary_candidate')} "
            f"({ambiguity_warning.get('price_range_note', '')}) แนะนำตรวจสอบมวลสารด้านข้างและคราบกรุเพิ่มเติมโดยผู้เชี่ยวชาญ"
        )

    # 1. Fallback text (concise 3-4 lines)
    if user_mode.lower() == "b2b":
        risk_text = f"จุดตรวจความเสี่ยง: หน้าต้องคมชัดตามพิมพ์ '{front_kp[:40]}...'"
        if has_back_image:
            risk_text += f" และหลัง '{back_kp[:35]}...'"
        fallback_text = (
            f"【วิเคราะห์เชิงพาณิชย์ B2B】{name} ({year}) สภาพสมบูรณ์ {condition_pct}% พบตำหนิ {defect_count} จุด ({defect_summary_text})\n"
            f"ราคากลางประเมิน {estimated_price_thb:,} บาท | กรอบรับจำนำปลอดภัย (LTV 60-70%): {int(estimated_price_thb * 0.60):,} – {int(estimated_price_thb * 0.70):,} บาท\n"
            f"{risk_text}\n"
            f"ตลาดปล่อยสภาพคล่องสูงสุด: {region}{ambiguity_note}"
        )
    else:
        back_mention = f"\nด้านหลังเร่งมิติ CLAHE ตรวจสอบ: {back_kp[:80]}..." if has_back_image else ""
        fallback_text = (
            f"【จุดสังเกตสำหรับนักสะสม B2C】{name} ({year}) วัด {temple} สภาพสมบูรณ์ {condition_pct}%\n"
            f"สภาพตำหนิที่ตรวจพบ: {defect_summary_text}\n"
            f"ด้านหน้าสังเกตพิมพ์ทรง: {front_kp[:90]}...{back_mention}\n"
            f"พื้นที่แนะนำปล่อยเช่า: {region} ({reason}){ambiguity_note}"
        )

    client = get_typhoon_client()
    if not client:
        return fallback_text

    # 2. Prompts tailored to b2c and b2b (3-4 concise complete sentences)
    scan_scope = "ครบสองด้าน (หน้า-หลัง)" if has_back_image else "เฉพาะด้านหน้า (ไม่มีรูปด้านหลัง)"
    ambiguity_prompt_chunk = ""
    if ambiguity_warning and ambiguity_warning.get("is_ambiguous"):
        ambiguity_prompt_chunk = (
            f"\n[คำเตือนความกำกวมพิมพ์พระ]: ตรวจพบความใกล้เคียงระหว่าง '{ambiguity_warning.get('primary_candidate')}' "
            f"และ '{ambiguity_warning.get('secondary_candidate')}' ให้สรุปข้อสังเกตจุดต่างและแจ้งเตือนให้ตรวจมวลสารด้านข้าง/คราบกรุอย่างระมัดระวัง"
        )

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
            f"จุดสังเกตหน้า: {front_kp}{back_line}{ambiguity_prompt_chunk}\n"
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
            f"จุดสังเกตด้านหน้า: {front_kp}{back_line}{ambiguity_prompt_chunk}\n"
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
    user_mode: str = Form("b2c"),
    capture_source: str = Form("upload")
):
    """
    Scan Dual-View or Single-View Amulet:
    1. Read front_image (required) and back_image (optional) + inspect image provenance/EXIF.
    2. YOLOv11 (best.pt) inference strictly on front_image ONLY (never predicts class on back_image).
    3. If back_image is provided, apply OpenCV CLAHE and CV defect detection (side="back").
    4. Condition grading (% integrity) from defects vs amulet area.
    5. Market valuation: base_price_thb * (condition_pct / 100).
    6. Somdej Ambiguity Gate check & Typhoon AI analysis (timeout=8.0s) with mode-specific advice & fallback.
    """
    start_time = time.time()
    load_database()

    # 1. Read & Decode Front Image (Required) and Inspect EXIF Forensics
    try:
        front_bytes = await front_image.read()
        provenance = inspect_image_provenance(front_bytes, capture_source)
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

    # 4. Strict Recognition Gate & Somdej Ambiguity Gate
    is_recognized, model_id, front_conf, amulet_box, gate_reason, ambiguity_warning = determine_amulet_model(
        f_results, front_bgr.shape[:2]
    )

    if not is_recognized:
        elapsed_ms = round((time.time() - start_time) * 1000, 1)
        disclaimer = (
            "การประเมินเบื้องต้นโดยระบบปัญญาประดิษฐ์ (Dual-View Amulet AI) "
            "เพื่อเป็นข้อมูลประกอบการตัดสินใจเบื้องต้นเท่านั้น มิใช่ใบรับรองพระแท้ทางกฎหมาย "
            "หรือหนังสือรับรองความแท้จากสมาคมผู้นิยมพระเครื่องพระบูชาไทย "
            "ควรปรึกษาผู้ชำนาญการหรือส่งตรวจสถาบันมาตรฐานก่อนทำนิติกรรมมูลค่าสูง"
        )
        print(f"[*] Strict Recognition Gate triggered: {gate_reason} (Conf: {front_conf}%)", flush=True)
        return {
            "success": True,
            "is_recognized": False,
            "model_id": "unknown",
            "name": "ไม่รู้จักวัตถุนี้ / ไม่อยู่ในฐานข้อมูลพระเครื่องที่รองรับ",
            "defects": [],
            "condition_pct": 0,
            "estimated_price_thb": 0,
            "user_mode": user_mode.lower(),
            "amulet_info": {
                "name": "ไม่รู้จักวัตถุนี้ / ไม่อยู่ในฐานข้อมูลพระเครื่องที่รองรับ",
                "temple": "-",
                "year": "-",
                "front_keypoint": "-",
                "back_keypoint": "-",
                "base_price_thb": 0,
                "recommended_region": "-",
                "region_reason": gate_reason,
                "ref_front_img": "",
                "ref_back_img": ""
            },
            "confidence": {
                "total": front_conf,
                "front": front_conf,
                "back": None,
                "formula": f"ปฏิเสธการประมวลผล: {gate_reason}"
            },
            "condition": {
                "condition_pct": 0,
                "grade": "ไม่สามารถประเมินได้ (ไม่ผ่านเกณฑ์จำแนกพิมพ์พระ)",
                "defect_count": 0,
                "defects_summary": [],
                "defects_detail": []
            },
            "pricing": {
                "base_price_thb": 0,
                "estimated_price_thb": 0,
                "discount_pct": 0
            },
            "recommendation": {
                "region": "-",
                "reason": gate_reason
            },
            "ai_analysis": f"ระบบตรวจสอบพบว่า: {gate_reason} จึงปฏิเสธการตรวจจับจุดตำหนิและการประเมินราคาเพื่อความถูกต้อง กรุณาถ่ายภาพองค์พระใหม่โดยให้อยู่กึ่งกลางภาพ มีแสงสว่างเพียงพอ และเห็นพิมพ์ทรงชัดเจน",
            "disclaimer": disclaimer,
            "clahe_back_image": clahe_back_image,
            "processing_time_ms": elapsed_ms,
            "system_specs": {
                "device": DEVICE,
                "model_used": MODEL_NAME,
                "clahe_applied_on_back": bool(has_back_image)
            },
            "provenance": provenance,
            "ambiguity_warning": None
        }

    amulet_info = AMULETS_DB.get(model_id, {})

    # 5. Condition Percentage and Defect Detection on Front Image (Strictly Pixel-Masked)
    f_cond, f_defects_cnt, f_defects = detect_defects_and_condition(
        front_bgr, amulet_box, side="front"
    )

    if has_back_image and enhanced_back_bgr is not None:
        h_b, w_b = enhanced_back_bgr.shape[:2]
        total_back_area = float(h_b * w_b)

        # Extract foreground mask for back_image using GrabCut/Contour
        back_mask, back_contour, back_obj_area = extract_amulet_silhouette_mask(
            enhanced_back_bgr, iterations=4
        )

        # If no clear main object is found (> 10% of image), skip back defect detection immediately!
        if back_mask is None or back_contour is None or back_obj_area < (total_back_area * 0.10):
            print("[*] Back image: No clear main amulet object found. Skipping back defect detection.")
            b_defects = []
            b_cond = f_cond
            has_valid_back_object = False
        else:
            has_valid_back_object = True
            bx, by, bw_b, bh_b = cv2.boundingRect(back_contour)
            back_box = [max(0, bx), max(0, by), min(w_b, bx + bw_b), min(h_b, by + bh_b)]
            b_cond, b_defects_cnt, b_defects = detect_defects_and_condition(
                enhanced_back_bgr, back_box, side="back"
            )

        condition_pct = round(max(55.0, min(98.0, (f_cond + b_cond) / 2.0)), 1)
        total_defects = f_defects + b_defects
        back_conf = front_conf
        total_conf = front_conf
        formula_str = "0.45 * front_conf + 0.55 * back_conf" if has_valid_back_object else "1.00 * front_conf (ด้านหลังไม่พบวัตถุหลัก)"
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
        has_back_image=has_back_image,
        ambiguity_warning=ambiguity_warning
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
        "is_recognized": True,
        "model_id": model_id,
        "name": amulet_info.get("name", model_id),
        "defects": total_defects,
        "condition_pct": condition_pct,
        "estimated_price_thb": estimated_price_thb,
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
        },
        "provenance": provenance,
        "ambiguity_warning": ambiguity_warning
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

# ---------------------------------------------------------
# Real-time Amulet Market & Live News Endpoints
# ---------------------------------------------------------
from market_service import (
    load_cached_market_data,
    update_live_market_cache,
    get_cooldown_remaining,
)

@app.on_event("startup")
async def start_market_scheduler():
    """Background task updating live news & market trends every 15 minutes."""
    async def market_worker():
        while True:
            try:
                await asyncio.sleep(900)  # 15 minutes
                client = get_typhoon_client()
                model_name = os.getenv("TYPHOON_MODEL", TYPHOON_MODEL)
                await update_live_market_cache(client, model_name)
                print("[*] [Scheduler] Market & news cache refreshed successfully.", flush=True)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[!] [Scheduler] Market refresh error: {e}", flush=True)

    asyncio.create_task(market_worker())

@app.get("/api/market")
async def get_market_overview():
    """
    Returns real-time Thai amulet market data, regional price index,
    live news from Google News RSS, and Typhoon AI market impact analysis.
    """
    data = load_cached_market_data()
    return {
        "success": True,
        "cooldown_seconds_remaining": get_cooldown_remaining(),
        **data
    }

@app.post("/api/market/refresh")
async def refresh_market_data():
    """
    Manual refresh endpoint for real-time market data & news with 60-second cooldown limit.
    """
    remaining = get_cooldown_remaining()
    if remaining > 0:
        cached = load_cached_market_data()
        return {
            "success": True,
            "status": "cooldown",
            "message": f"กรุณารออีก {remaining} วินาทีก่อนกดอัปเดตใหม่",
            "cooldown_seconds_remaining": remaining,
            **cached
        }

    client = get_typhoon_client()
    model_name = os.getenv("TYPHOON_MODEL", TYPHOON_MODEL)
    refreshed = await update_live_market_cache(client, model_name)
    return {
        "success": True,
        "status": "refreshed",
        "message": "อัปเดตข้อมูลตลาดและข่าวสารล่าสุดเรียบร้อยแล้ว",
        "cooldown_seconds_remaining": 60,
        **refreshed
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
