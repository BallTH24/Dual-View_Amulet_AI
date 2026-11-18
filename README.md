# Dual-View Amulet AI

ระบบ Full-Stack Web Application สำหรับสแกนพระเครื่อง 2 ด้าน (**ด้านหน้า Obverse** และ **ด้านหลัง Reverse**) เพื่อระบุรุ่น ประเมินเปอร์เซ็นต์ความสมบูรณ์ (Condition Grading) คำนวณราคากลาง และแนะนำภูมิภาคที่ปล่อยเช่าได้ราคาสูงสุด ภายใน 1 นาที

---

## 🏛️ สถาปัตยกรรมระบบ (Architecture)

```
Dual-View Amulet AI
├── backend/ & root
│   ├── main.py                     # FastAPI Application (Endpoints: /health, /api/analyze, /api/chat)
│   ├── requirements.txt            # Python dependencies (fastapi, uvicorn, ultralytics, cv2, etc.)
│   ├── data/
│   │   └── amulets_db.json         # ฐานข้อมูลพระเครื่อง 8 รุ่นยอดนิยม (พร้อมจุดสังเกตและราคากลาง)
│   └── models/
│       ├── best.pt                 # ตำแหน่งวาง Custom Fine-Tuned Model
│       └── yolo11s.pt              # Fallback Model พร้อมใช้งานอัตโนมัติ
│
└── frontend/                       # Next.js (App Router) + Tailwind CSS
    ├── src/app/page.tsx            # Full-flow Dashboard ในหน้าเดียว (Mobile-First / Temple Modern)
    ├── src/app/globals.css         # Dark Gold / Temple Modern Theme
    └── package.json
```

---

## ⚡ คุณสมบัติเด่น (Key Features)

1. **Dual-View Analysis + OpenCV CLAHE:**
   - ประมวลผลภาพด้านหลังด้วย **OpenCV CLAHE (`clipLimit=2.0`, `tileGridSize=(8,8)`)** บนช่องสัญญาณ L (Luminance) ใน LAB color space เพื่อเร่งมิติความคมชัดของร่องยันต์และโค้ดตอกโดยไม่เสียสมดุลสีเดิม
2. **YOLO11 Computer Vision & Fallback:**
   - โหลดโมเดลจาก `./models/best.pt` และ Fallback ไปที่ `yolo11s.pt` อัตโนมัติ รองรับ Apple Silicon `device="mps"` (หรือ `cpu`) ที่ `imgsz=640`
3. **สูตรคำนวณคะแนนความมั่นใจรวม (Combined Confidence):**
   $$\text{Total Confidence} = (0.45 \times \text{front\_conf}) + (0.55 \times \text{back\_conf})$$
4. **การประเมินสภาพความสมบูรณ์ (Condition Grading):**
   - คำนวณเปอร์เซ็นต์ความสมบูรณ์ 50%–100% จากสัดส่วนพื้นที่ตำหนิ (`defect`) เทียบกับพื้นที่องค์พระ
   - ประเมินราคากลางตามสภาพ:
     $$\text{Estimated Price} = \text{int}\left(\text{Base Price} \times \frac{\text{Condition \%}}{100}\right)$$
5. **วิเคราะห์ภูมิภาคปล่อยเช่า (Regional Liquidity Recommendation):**
   - ชี้เป้าจังหวัดและศูนย์พระเครื่องที่มีความต้องการสะสมและกำลังซื้อสูงสุด
6. **บูรณาการ OpenTyphoon AI (Thai LLM):**
   - สรุปจุดสังเกต พุทธคุณ และกลยุทธ์การขายตามโหมดผู้ใช้ (`b2c` หรือ `b2b`) พร้อมระบบ **Timeout 4 วินาที และ Instant Fallback**
   - รองรับการสนทนาถาม-ตอบเชิงลึกหลังสแกนผ่าน `/api/chat`
7. **Ethical Disclaimer:**
   - แถบจริยธรรมและข้อสงวนสิทธิ์ทางกฎหมาย ระบุชัดเจนว่าเป็นการประเมินเบื้องต้นโดย AI มิใช่ใบรับรองพระแท้ทางกฎหมาย

---

## 🚀 วิธีการรันโปรเจกต์ (Quickstart)

### 1. รัน Backend API (FastAPI)
```bash
# 1. เข้าสู่ Virtual Environment
source backend/venv/bin/activate

# 2. ตั้งค่า Typhoon API Key (ทางเลือก: หากไม่ใส่ ระบบมี Fallback ออฟไลน์อัตโนมัติ)
export TYPHOON_API_KEY="your_typhoon_api_key"
export TYPHOON_MODEL="typhoon-v1.5x-70b-instruct"

# 3. เริ่มต้นรันเซิร์ฟเวอร์
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
- ทดสอบสุขภาพเซิร์ฟเวอร์: `http://localhost:8000/health`
- เอกสาร Swagger API: `http://localhost:8000/docs`

### 2. รัน Frontend (Next.js)
```bash
cd frontend
npm run dev
```
- เปิดเบราว์เซอร์ที่: `http://localhost:3000`

---

## 📡 รายละเอียด API Endpoints

### 1. `GET /health`
ตรวจสอบสถานะเซิร์ฟเวอร์ โมเดลที่โหลดอยู่ (`best.pt` หรือ `yolo11s.pt`) และอุปกรณ์ประมวลผล (`mps` หรือ `cpu`)

### 2. `POST /api/analyze`
- **Form Data:**
  - `front_image`: File (ภาพด้านหน้า)
  - `back_image`: File (ภาพด้านหลัง)
  - `user_mode`: `"b2c"` หรือ `"b2b"`
- **Response JSON:**
  - `model_id`: รหัสรุ่นพระเครื่อง
  - `amulet_info`: ข้อมูลวัด ปีสร้าง จุดสังเกตหน้า-หลัง
  - `confidence`: `{ total, front, back, formula }`
  - `condition`: `{ condition_pct, grade, defect_count, defects_summary }`
  - `pricing`: `{ base_price_thb, estimated_price_thb, discount_pct }`
  - `recommendation`: `{ region, reason }`
  - `ai_analysis`: บทวิเคราะห์สังเคราะห์โดย Typhoon AI
  - `disclaimer`: ข้อความจริยธรรมและข้อสงวนสิทธิ์

### 3. `POST /api/chat`
- **Request JSON:**
  ```json
  {
    "amulet_name": "พระสมเด็จวัดระฆังโฆสิตาราม พิมพ์ใหญ่",
    "context_info": "รายละเอียดและผลการสแกน...",
    "question": "จุดสังเกตชี้ขาดด้านหลังดูอย่างไร?"
  }
  ```
- **Response JSON:**
  ```json
  {
    "success": true,
    "answer": "คำตอบเชิงลึกจาก Typhoon AI...",
    "source": "typhoon_llm"
  }
  ```
