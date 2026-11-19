# 🪷 Amulet Engine

**แพลตฟอร์ม AI ตรวจสอบพิมพ์ทรง วิเคราะห์จุดตำหนิ นิติวิทยาศาสตร์ภาพถ่าย และประเมินราคากลางพระเครื่องแบบสองด้าน (B2C & B2B)**

Amulet Engine ผสานการทำงานของ **Deep Learning (YOLOv11s)**, **Explainable Computer Vision (OpenCV)**, **Digital Image Forensics** และ **Thai Large Language Model (Typhoon v2.5 30B)** เพื่อยกระดับการประเมินสภาพและมูลค่าพระเครื่องให้โปร่งใส ตรวจสอบย้อนกลับได้ และรองรับทั้งนักสะสมทั่วไป (**B2C**) รวมถึงร้านพระเครื่องและโรงรับจำนำ (**B2B**)

---

## ✨ ฟีเจอร์หลัก (Key Features)

### 1. การวิเคราะห์แบบสองด้าน (Dual-View Inspection Pipeline)
* **ด้านหน้า (Front View Classification):** จำแนกพิมพ์ทรงพระเครื่อง 7 รุ่นหลักด้วยโมเดล **YOLOv11s** (เร่งความเร็วผ่าน Apple Silicon MPS / GPU) พร้อม **Strict Recognition Gate (`conf >= 0.68`)** ตัดวัตถุที่ไม่ใช่พระเครื่องออกทันที และ **Somdej Ambiguity Gate** แจ้งเตือนพร้อมแสดงช่วงราคาเมื่อคะแนนความมั่นใจในกลุ่มพระสมเด็จ 3 วัดใกล้เคียงกัน
* **ด้านหลัง (Back View CLAHE Enhancement):** ปรับปรุงความคมชัดของร่องยันต์ รอยจาร และคราบกรุอัตโนมัติด้วยอัลกอริทึม **CLAHE** บนช่องความสว่าง (L-channel) ในปริภูมิสี **CIELAB** โดยไม่ทำให้สีเนื้อพระเดิมเพี้ยน

### 2. ระบบตรวจจับตำหนิเฉพาะตัวองค์พระ (Hybrid Explainable Defect Detection)
* **Pixel-Level Silhouette Masking:** ครอบตัดเฉพาะกรอบพระจาก YOLO แล้วแยกตัวองค์พระออกจากพื้นหลังด้วย `cv2.grabCut` ร่วมกับ **Morphological Closing** เพื่ออุดร่องซุ้มครอบแก้วและฐานพระ ป้องกันการปักหมุดออกนอกองค์พระหรือจับซุ้มผิดเป็นรอยบิ่น
* **การวิเคราะห์แผลภายในและขอบนอก:** ตรวจจับหลุม รอยกะเทาะ และรอยขีดข่วนภายในเนื้อพระผ่าน Eroded Mask และตรวจจับรอยบิ่นมุม/ขอบพระด้วย **Convex Hull & Convexity Defects** คัดเฉพาะจุดสำคัญสูงสุด 5 จุดพร้อมพิกัดระดับพิกเซล

### 3. ระบบนิติวิทยาศาสตร์ภาพถ่าย 3 ชั้น (3-Layer Image Forensics & Provenance)
ป้องกันการนำภาพที่สร้างจาก Generative AI หรือภาพที่ผ่านการรีทัชลบตำหนิมาหลอกอัปราคา โดยแบ่งระดับความน่าเชื่อถือบนใบรับรอง (`Tier 1`, `Tier 2`, `Unverified Metadata`, `Forensics Warning`):
1. **Deep Metadata & Camera Fingerprint:** ตรวจสอบ EXIF, PNG/WebP Chunks, XMP และป้ายมาตรฐาน C2PA เพื่อหาลายเซ็น AI/ซอฟต์แวร์แต่งภาพ รวมถึงตรวจสอบข้อมูลฮาร์ดแวร์กล้องจริง (`Make`, `Model`, `ISO`, `FNumber`)
2. **Error Level Analysis (ELA 8×8 Grid):** บีบอัดภาพซ้ำที่ JPEG Quality 90% เพื่อตรวจหาความผิดปกติของการบีบอัดเฉพาะจุดจากการลบหลุมหรือตัดต่อ
3. **Sensor Noise Residual:** วิเคราะห์เกรนสัญญาณรบกวนความถี่สูงของเซนเซอร์กล้องเพื่อแยกแยะพื้นผิวสังเคราะห์จากภาพ AI

### 4. การประเมินราคาและวิเคราะห์เชิงลึกด้วย Typhoon v2.5 30B
* **Dynamic Valuation & B2B LTV:** คำนวณเปอร์เซ็นต์ความสมบูรณ์และราคากลางตามสภาพจริง พร้อมแสดงกรอบวงเงินรับเช่า/รับจำนำเชิงพาณิชย์ (**LTV 60–70%**) ในโหมด B2B
* **Typhoon AI Synthesis & Q&A Chat:** สรุปจุดสังเกตพิมพ์ทรง ตำหนิ และคำแนะนำการปล่อยเช่าเป็นภาษาไทย พร้อมระบบแชตถาม-ตอบเชิงลึกอ้างอิงตามพระองค์ที่สแกน และระบบ **Offline Fallback** กรณีไม่มีอินเทอร์เน็ต

### 5. เครื่องมือสำหรับนักสะสมและแดชบอร์ดตลาดพระ (Vault & Market Intelligence)
* **Interactive 3x Digital Loupe:** แว่นส่องพระดิจิทัลกำลังขยาย 3 เท่า ใช้งานได้ทั้งเมาส์และหน้าจอสัมผัส
* **AI Scan Certificate (PDF):** ออกใบสรุปผลสแกนพร้อมรหัสอ้างอิง `#SCAN-...` ป้ายสถานะ Trust Tier และสั่งพิมพ์เป็น PDF ได้ทันที
* **Digital Amulet Vault:** ตู้พระส่วนตัวจัดเก็บบนเบราว์เซอร์ (`localStorage`) คำนวณจำนวนพระ มูลค่าพอร์ตโฟลิโอสะสม และความสมบูรณ์เฉลี่ย
* **Real-Time Market Intelligence:** ดึงข่าวสารวงการพระจาก Google News RSS อัตโนมัติทุก 15 นาทีผ่าน `APScheduler` เรียงลำดับจากใหม่ล่าสุด และให้ Typhoon AI สรุปแนวโน้มผลกระทบราคา ควบคู่กับตารางดัชนีราคากลางรายภูมิภาค

---

## 🏛️ รุ่นพระเครื่องที่รองรับ (7 Supported Models)

| Model ID | ชื่อรุ่นพระเครื่อง | วัด / กรุต้นกำเนิด |
| :--- | :--- | :--- |
| `somdej_watrakang` | พระสมเด็จวัดระฆังโฆสิตาราม พิมพ์ใหญ่ | วัดระฆังโฆสิตาราม กรุงเทพฯ |
| `somdej_bangkhunprom` | พระสมเด็จบางขุนพรหม พิมพ์ใหญ่ | วัดใหม่อมตรส กรุงเทพฯ |
| `somdej_ketchaiyo` | พระสมเด็จเกศไชโย พิมพ์ 7 ชั้น นิยม | วัดไชโยวรวิหาร จ.อ่างทอง |
| `phra_nangphaya` | พระนางพญา พิมพ์เข่าโค้ง | กรุวัดนางพญา จ.พิษณุโลก |
| `phra_phong_suphan` | พระผงสุพรรณ พิมพ์หน้าแก่ | วัดพระศรีรัตนมหาธาตุ จ.สุพรรณบุรี |
| `phra_rod` | พระรอด พิมพ์ใหญ่ | กรุวัดมหาวัน จ.ลำพูน |
| `phra_sumkor` | พระซุ้มกอ พิมพ์ใหญ่ มีกนก | กรุทุ่งเศรษฐี จ.กำแพงเพชร |

---

## 🏗️ สถาปัตยกรรมระบบ (System Architecture)

```text
[ Next.js 16 Frontend (Port 3000 - Dark Gold UI) ]
       │  (Reverse Proxy: /api/* ──► http://127.0.0.1:8000)
       ▼
[ FastAPI Backend (Port 8000 - Asyncio + ThreadPool) ]
       ├──► Image Forensics (Metadata/C2PA + 8x8 ELA + Noise Residual)
       ├──► YOLOv11s Inference (Front View on Apple M4 MPS / GPU)
       ├──► OpenCV Pipeline (Back LAB-CLAHE + GrabCut Hybrid Defect Detection)
       ├──► Typhoon v2.5 30B API (Grounded Synthesis & Interactive Chat)
       └──► APScheduler (15-min Google News RSS + AI Market Impact Cache)
```

---

## 🚀 การติดตั้งและเริ่มต้นใช้งาน (Local Setup)

### 1. ตั้งค่าและรัน Backend (FastAPI)
```bash
# สร้างและเปิดใช้งาน Virtual Environment
python3 -m venv .venv
source .venv/bin/activate

# ติดตั้งไลบรารีที่จำเป็น
pip install -r requirements.txt

# ตั้งค่า API Key ของ Typhoon (คัดลอกจากไฟล์ตัวอย่าง)
cp .env.example .env
# แก้ไขไฟล์ .env และใส่ค่า TYPHOON_API_KEY=your_api_key_here

# เริ่มการทำงานของ Backend (Port 8000)
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 2. ตั้งค่าและรัน Frontend (Next.js 16)
```bash
cd frontend
npm install

# รันโหมดพัฒนา (Port 3000)
npm run dev
```
เปิดเบราว์เซอร์ไปที่ `http://localhost:3000` (หรือผ่าน IP ในวง LAN เดียวกันเพื่อทดสอบกล้องมือถือ)

---

## 🌐 การเปิดลิงก์สาธารณะ HTTPS สำหรับทดสอบมือถือ (Cloudflare Tunnel)

เนื่องจาก Next.js ตั้งค่า `rewrites` ส่งต่อ `/api/:path*` และ `/health` ไปยัง FastAPI พอร์ต `8000` ภายในเครื่องไว้แล้ว สามารถเปิดอุโมงค์ HTTPS ผ่านพอร์ต `3000` เพียงเส้นเดียวได้ด้วยคำสั่ง:

```bash
# ติดตั้ง cloudflared (ทำครั้งแรกครั้งเดียว)
brew install cloudflared

# เปิดอุโมงค์สาธารณะพร้อมป้องกันเครื่องเข้าสู่โหมดพักหน้าจอ
caffeinate -dimsu cloudflared tunnel --url http://localhost:3000
```
นำลิงก์ `https://<your-tunnel>.trycloudflare.com` ที่ปรากฏใน Terminal ไปเปิดบนมือถือผ่านเครือข่าย 4G/5G เพื่อใช้งานกล้องถ่ายสดได้ทันที

---

## ⚠️ ข้อจำกัดความรับผิดชอบ (Ethical Disclaimer)
ผลการวิเคราะห์พิมพ์ทรง จุดตำหนิ และราคากลางจากระบบ **Amulet Engine** เป็นการประมวลผลเชิงสถิติและคอมพิวเตอร์วิทัศน์เพื่อใช้ประกอบการตัดสินใจเบื้องต้นเท่านั้น ไม่สามารถใช้แทนใบรับรองพระแท้จากสมาคมผู้นิยมพระเครื่องพระบูชาไทยหรือสถาบันรับรองมาตรฐานสากลได้
