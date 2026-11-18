"use client";

import React, { useState, useEffect, useRef } from "react";

// Types
interface AmuletInfo {
  name: string;
  temple: string;
  year: string;
  front_keypoint: string;
  back_keypoint: string;
  base_price_thb: number;
  recommended_region: string;
  region_reason: string;
  ref_front_img: string;
  ref_back_img: string;
}

interface AnalysisResult {
  success: boolean;
  model_id: string;
  user_mode: "b2c" | "b2b";
  amulet_info: AmuletInfo;
  confidence: {
    total: number;
    front: number;
    back: number;
    formula: string;
  };
  condition: {
    condition_pct: number;
    grade: string;
    defect_count: number;
    defects_summary: string[];
  };
  pricing: {
    base_price_thb: number;
    estimated_price_thb: number;
    discount_pct: number;
  };
  recommendation: {
    region: string;
    reason: string;
  };
  ai_analysis: string;
  disclaimer: string;
  processing_time_ms: number;
  system_specs: {
    device: string;
    model_used: string;
    clahe_applied_on_back: boolean;
  };
}

interface ChatMessage {
  sender: "user" | "ai";
  text: string;
  time: string;
}

// Preset Amulet Demos for Instant Testing
const PRESET_AMULETS = [
  {
    id: "somdej_watrakang",
    name: "พระสมเด็จวัดระฆัง",
    desc: "พิมพ์ใหญ่ เกศทะลุซุ้ม หลังกาบหมาก",
    front_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80",
    back_url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "luangpu_thuad_97",
    name: "หลวงปู่ทวด 2497",
    desc: "เนื้อว่าน พิมพ์ใหญ่ วัดช้างให้",
    front_url: "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=600&q=80",
    back_url: "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "luangpu_toh_pidta",
    name: "พระปิดตา หลวงปู่โต๊ะ",
    desc: "รุ่นจัมโบ้ 1 วัดประดู่ฉิมพลี",
    front_url: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=600&q=80",
    back_url: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "luangphor_khoon_19",
    name: "เหรียญหลวงพ่อคูณ 19",
    desc: "รุ่นสร้างบารมี ปี 2519 วัดบ้านไร่",
    front_url: "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=600&q=80",
    back_url: "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=600&q=80",
  },
  {
    id: "wessuwan_chulamani",
    name: "ท้าวเวสสุวรรณ 45",
    desc: "รุ่นจำปี วัดจุฬามณี โค้ดเหล็ง",
    front_url: "https://images.unsplash.com/photo-1569098644584-210bcd375b59?auto=format&fit=crop&w=600&q=80",
    back_url: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=600&q=80",
  },
];

export default function Home() {
  // State
  const [userMode, setUserMode] = useState<"b2c" | "b2b">("b2c");
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);

  // Scanning & Timer
  const [isScanning, setIsScanning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [scanStepIndex, setScanStepIndex] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);

  // Result
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  // References
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const scanSteps = [
    "1. กำลังทำ Auto-Crop และรัน OpenCV CLAHE เร่งร่องยันต์ด้านหลัง...",
    "2. รัน YOLO11 Dual-View วิเคราะห์พิมพ์ทรงหน้าและโค้ดยันต์หลัง...",
    "3. คำนวณกรอบตำหนิ (Defect Grading) และสัดส่วนความสมบูรณ์ 50-100%...",
    "4. คำนวณราคากลาง วิเคราะห์ภูมิภาคปล่อยเช่า และสังเคราะห์ข้อคิดเห็น Typhoon AI...",
  ];

  // Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isScanning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isScanning, timerSeconds]);

  // Handle Preset Selection
  const handleSelectPreset = async (preset: typeof PRESET_AMULETS[0]) => {
    try {
      setFrontPreview(preset.front_url);
      setBackPreview(preset.back_url);

      // Convert URLs to File objects for form submission
      const [fBlob, bBlob] = await Promise.all([
        fetch(preset.front_url).then((r) => r.blob()),
        fetch(preset.back_url).then((r) => r.blob()),
      ]);

      const fFile = new File([fBlob], `${preset.id}_front.jpg`, { type: "image/jpeg" });
      const bFile = new File([bBlob], `${preset.id}_back.jpg`, { type: "image/jpeg" });

      setFrontFile(fFile);
      setBackFile(bFile);
      setScanError(null);
    } catch {
      // In case of CORS or offline, fallback to canvas generated image
      createDummyFiles(preset.id);
    }
  };

  const createDummyFiles = (id: string) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 640;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, 640, 640);
      ctx.fillStyle = "#d4af37";
      ctx.font = "bold 32px sans-serif";
      ctx.fillText(`Amulet: ${id}`, 100, 320);

      canvas.toBlob((blob) => {
        if (blob) {
          const fileF = new File([blob], `${id}_front.jpg`, { type: "image/jpeg" });
          const fileB = new File([blob], `${id}_back.jpg`, { type: "image/jpeg" });
          setFrontFile(fileF);
          setBackFile(fileB);
          setFrontPreview(canvas.toDataURL());
          setBackPreview(canvas.toDataURL());
        }
      });
    }
  };

  // Image Upload Handlers
  const handleFrontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFrontFile(file);
      setFrontPreview(URL.createObjectURL(file));
      setScanError(null);
    }
  };

  const handleBackUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBackFile(file);
      setBackPreview(URL.createObjectURL(file));
      setScanError(null);
    }
  };

  // Start Dual-View Scan Analysis
  const handleStartAnalysis = async () => {
    if (!frontFile || !backFile) {
      setScanError("กรุณาอัปโหลดภาพพระเครื่องให้ครบทั้ง 2 ด้าน (ด้านหน้า และ ด้านหลัง)");
      return;
    }

    setIsScanning(true);
    setTimerSeconds(60);
    setScanStepIndex(0);
    setScanError(null);
    setResult(null);

    // Step simulation progression
    const step1 = setTimeout(() => setScanStepIndex(1), 1200);
    const step2 = setTimeout(() => setScanStepIndex(2), 2600);
    const step3 = setTimeout(() => setScanStepIndex(3), 4200);

    try {
      const formData = new FormData();
      formData.append("front_image", frontFile);
      formData.append("back_image", backFile);
      formData.append("user_mode", userMode);

      // Backend API endpoint
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`การวิเคราะห์ขัดข้อง (${response.status})`);
      }

      const data: AnalysisResult = await response.json();
      setResult(data);

      // Pre-seed chat messages with welcome
      setChatMessages([
        {
          sender: "ai",
          text: `สวัสดีครับ! ผลการวิเคราะห์ ${data.amulet_info.name} เสร็จสมบูรณ์แล้ว ท่านมีข้อสงสัยเกี่ยวกับพิมพ์ทรง จุดสังเกต หรือการปล่อยเช่า สอบถามผมได้เลยครับ`,
          time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);

      // Scroll to result smoothly
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์";
      setScanError(`${msg} (ตรวจสอบว่า Backend uvicorn รันอยู่ที่พอร์ต 8000 หรือยัง)`);
    } finally {
      clearTimeout(step1);
      clearTimeout(step2);
      clearTimeout(step3);
      setIsScanning(false);
    }
  };

  // Send Chat Message
  const handleSendMessage = async (customText?: string) => {
    const qText = customText || chatInput;
    if (!qText.trim() || !result || isChatLoading) return;

    const userMsg: ChatMessage = {
      sender: "user",
      text: qText,
      time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!customText) setChatInput("");
    setIsChatLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const contextInfo = `พระเครื่อง: ${result.amulet_info.name} วัด: ${result.amulet_info.temple} ปี: ${result.amulet_info.year} ความสมบูรณ์: ${result.condition.condition_pct}% ราคากลาง: ${result.pricing.estimated_price_thb.toLocaleString()} บาท จุดหน้า: ${result.amulet_info.front_keypoint} จุดหลัง: ${result.amulet_info.back_keypoint} ตลาดแนะนำ: ${result.recommendation.region} (${result.recommendation.reason})`;

      const res = await fetch(`${apiUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amulet_name: result.amulet_info.name,
          context_info: contextInfo,
          question: qText,
        }),
      });

      const data = await res.json();
      const aiReply: ChatMessage = {
        sender: "ai",
        text: data.answer || "ขออภัย ไม่สามารถประมวลผลคำตอบได้ในขณะนี้",
        time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, aiReply]);
    } catch {
      const fallbackReply: ChatMessage = {
        sender: "ai",
        text: "เนื่องจากเซิร์ฟเวอร์มีผู้ใช้งานหนาแน่น แนะนำให้เปรียบเทียบจุดสังเกตด้านหน้าและหลังกับภาพองค์ครูอ้างอิง และออกบัตรรับรองจากสมาคมผู้นิยมพระเครื่องพระบูชาไทยครับ",
        time: new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
      };
      setChatMessages((prev) => [...prev, fallbackReply]);
    } finally {
      setIsChatLoading(false);
      setTimeout(() => {
        chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
      }, 100);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col justify-between selection:bg-amber-500/30">
      {/* Top Navigation */}
      <header className="border-b border-amber-500/20 bg-[#0c101a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <span className="text-xl font-black text-slate-950">พระ</span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500">
                  Dual-View Amulet AI
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  YOLO11 + Typhoon
                </span>
              </div>
              <p className="text-xs text-slate-400">ระบบสแกนพระเครื่อง 2 ด้าน ประเมินสภาพและราคากลางใน 1 นาที</p>
            </div>
          </div>

          <div className="hidden sm:flex items-center space-x-2 text-xs">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-slate-300">FastAPI Ready</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 py-8 w-full flex-1">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs mb-3">
            <span>✨ เทคโนโลยี Dual-View Vision + OpenCV CLAHE เร่งร่องยันต์</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-100 tracking-tight">
            ตรวจพิมพ์หน้า ชี้ขาดพิมพ์หลัง <span className="text-amber-400">แม่นยำใน 60 วินาที</span>
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
            ถ่ายภาพหรืออัปโหลดพระเครื่องทั้ง 2 ด้าน ระบบจะตรวจสอบความสมบูรณ์ คำนวณราคากลาง และชี้เป้าตลาดปล่อยเช่าทันที
          </p>
        </div>

        {/* 1. Mode Selector */}
        <section className="mb-8">
          <div className="bg-[#111624] border border-amber-500/20 rounded-2xl p-2 max-w-xl mx-auto flex shadow-xl">
            <button
              type="button"
              onClick={() => setUserMode("b2c")}
              className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all duration-200 ${
                userMode === "b2c"
                  ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/25"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <div className="text-left">
                <div className="text-xs uppercase tracking-wider font-semibold">โหมด B2C</div>
                <div className="text-[11px] opacity-90">ผู้ซื้อ-ขายมือใหม่ / ผู้ศรัทธา</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setUserMode("b2b")}
              className={`flex-1 py-3 px-4 rounded-xl flex items-center justify-center space-x-2 transition-all duration-200 ${
                userMode === "b2b"
                  ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold shadow-lg shadow-amber-500/25"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <div className="text-left">
                <div className="text-xs uppercase tracking-wider font-semibold">โหมด B2B</div>
                <div className="text-[11px] opacity-90">ร้านรับจำนำ / ร้านพระเครื่อง</div>
              </div>
            </button>
          </div>
        </section>

        {/* Preset Sample Quick Selector */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>⚡</span> ทดลองด้วยตัวอย่างพระเครื่องยอดนิยม 5 รุ่น (1-Click Demo)
            </span>
            <span className="text-[11px] text-slate-400">คลิกเพื่อโหลดภาพตัวอย่าง</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {PRESET_AMULETS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectPreset(item)}
                className="bg-[#121724] hover:bg-[#1b2336] border border-slate-800 hover:border-amber-500/40 rounded-xl p-2.5 text-left transition-all group"
              >
                <div className="text-xs font-bold text-slate-200 group-hover:text-amber-300 truncate">
                  {item.name}
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">{item.desc}</div>
              </button>
            ))}
          </div>
        </section>

        {/* 2. Dual-View Uploader */}
        <section className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Front Image (Obverse) */}
            <div className="bg-[#111726] border border-amber-500/20 rounded-2xl p-5 shadow-xl flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-100">ภาพด้านหน้า (Obverse)</h3>
                    <p className="text-[11px] text-slate-400">วิเคราะห์พิมพ์ทรง ซุ้ม เกศ ริ้วจีวร</p>
                  </div>
                </div>
                {frontPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setFrontFile(null);
                      setFrontPreview(null);
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300"
                  >
                    ลบภาพ
                  </button>
                )}
              </div>

              <div
                onClick={() => frontInputRef.current?.click()}
                className={`flex-1 min-h-[240px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-4 cursor-pointer transition-all relative overflow-hidden group ${
                  frontPreview
                    ? "border-amber-500/40 bg-slate-950/50"
                    : "border-slate-700 hover:border-amber-500/50 bg-[#0d121e]/60"
                }`}
              >
                <input
                  ref={frontInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFrontUpload}
                  className="hidden"
                />

                {frontPreview ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={frontPreview}
                      alt="Front View"
                      className="max-h-56 w-auto object-contain rounded-lg shadow-md"
                    />
                    <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded bg-black/70 backdrop-blur-sm text-[10px] text-amber-300 border border-amber-500/30">
                      ✓ พร้อมวิเคราะห์ด้านหน้า
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 group-hover:bg-amber-500/20 text-slate-400 group-hover:text-amber-400 flex items-center justify-center transition-colors">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="text-xs font-semibold text-slate-300">คลิกหรือลากภาพมาวางที่นี่</div>
                    <div className="text-[11px] text-slate-500">รองรับ JPG, PNG, WEBP หรือถ่ายจากกล้อง</div>
                  </div>
                )}
              </div>
            </div>

            {/* Back Image (Reverse) */}
            <div className="bg-[#111726] border border-amber-500/20 rounded-2xl p-5 shadow-xl flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs">
                    2
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-slate-100">ภาพด้านหลัง (Reverse)</h3>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        CLAHE Auto
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">ตรวจร่องยันต์ โค้ดตอก รอยตัดขอบข้าง</p>
                  </div>
                </div>
                {backPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setBackFile(null);
                      setBackPreview(null);
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300"
                  >
                    ลบภาพ
                  </button>
                )}
              </div>

              <div
                onClick={() => backInputRef.current?.click()}
                className={`flex-1 min-h-[240px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center p-4 cursor-pointer transition-all relative overflow-hidden group ${
                  backPreview
                    ? "border-amber-500/40 bg-slate-950/50"
                    : "border-slate-700 hover:border-amber-500/50 bg-[#0d121e]/60"
                }`}
              >
                <input
                  ref={backInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBackUpload}
                  className="hidden"
                />

                {backPreview ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={backPreview}
                      alt="Back View"
                      className="max-h-56 w-auto object-contain rounded-lg shadow-md"
                    />
                    <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded bg-black/70 backdrop-blur-sm text-[10px] text-amber-300 border border-amber-500/30">
                      ✓ พร้อมเร่งคอนทราสต์ CLAHE
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-2">
                    <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 group-hover:bg-amber-500/20 text-slate-400 group-hover:text-amber-400 flex items-center justify-center transition-colors">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="text-xs font-semibold text-slate-300">คลิกหรือลากภาพมาวางที่นี่</div>
                    <div className="text-[11px] text-slate-500">ระบบจะทำการเร่งมิติร่องยันต์อัตโนมัติ</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {scanError && (
            <div className="mt-4 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-2">
              <svg className="w-4 h-4 shrink-0 text-rose-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{scanError}</span>
            </div>
          )}

          {/* Action Trigger Button */}
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              disabled={isScanning}
              onClick={handleStartAnalysis}
              className={`w-full sm:w-auto min-w-[320px] py-4 px-8 rounded-2xl font-black text-base uppercase tracking-wider flex items-center justify-center space-x-3 shadow-2xl transition-all duration-300 ${
                isScanning
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 shadow-amber-500/30 hover:scale-[1.02] active:scale-[0.98]"
              }`}
            >
              {isScanning ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>กำลังสแกนและประมวลผล...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 text-slate-950" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <span>เริ่มวิเคราะห์ใน 1 นาที (Dual-View AI)</span>
                </>
              )}
            </button>
          </div>
        </section>

        {/* 3. Processing Timer Card (Shown during scan) */}
        {isScanning && (
          <section className="mb-8 bg-[#111726] border border-amber-500/40 rounded-2xl p-6 shadow-2xl animate-fade-in relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 animate-pulse"></div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center space-x-5">
                <div className="relative w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-400 flex items-center justify-center animate-spin"></div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-amber-400 font-bold">Processing Timeline</div>
                  <h4 className="text-base font-bold text-slate-100">{scanSteps[scanStepIndex]}</h4>
                  <p className="text-xs text-slate-400 mt-1">กำลังรันบน YOLO11 + OpenCV CLAHE + Typhoon LLM</p>
                </div>
              </div>

              <div className="text-center sm:text-right">
                <div className="text-3xl font-black text-amber-400 font-mono tracking-tight">
                  {timerSeconds}s
                </div>
                <div className="text-[11px] text-slate-400">เป้าหมายเสร็จสิ้นใน 60 วินาที</div>
              </div>
            </div>

            <div className="mt-5 w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-yellow-400 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, ((60 - timerSeconds) / 60) * 100 + 10)}%` }}
              ></div>
            </div>
          </section>
        )}

        {/* 4. Result Dashboard */}
        {result && (
          <div ref={resultRef} className="space-y-8 animate-fade-in">
            {/* Header Result Card */}
            <div className="bg-[#111726] border border-amber-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      ผลการระบุรุ่นพระเครื่อง
                    </span>
                    <span className="text-xs text-slate-400">
                      โหมด: {result.user_mode.toUpperCase()}
                    </span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-amber-100 via-amber-300 to-yellow-500">
                    {result.amulet_info.name}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 mt-1">
                    {result.amulet_info.temple} • สร้างราวปี {result.amulet_info.year}
                  </p>
                </div>

                <div className="bg-[#182136] rounded-2xl p-4 border border-amber-500/20 flex items-center space-x-4">
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">ความมั่นใจรวม 2 ด้าน</div>
                    <div className="text-2xl font-black text-amber-400 font-mono">
                      {result.confidence.total}%
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400">
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Confidence Weight Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                <div className="bg-[#0e1320] p-3.5 rounded-xl border border-slate-800">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300">ด้านหน้า (น้ำหนัก 45%):</span>
                    <span className="text-amber-400 font-bold font-mono">{result.confidence.front}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full rounded-full"
                      style={{ width: `${result.confidence.front}%` }}
                    ></div>
                  </div>
                </div>

                <div className="bg-[#0e1320] p-3.5 rounded-xl border border-slate-800">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-300">ด้านหลัง CLAHE (น้ำหนัก 55%):</span>
                    <span className="text-amber-400 font-bold font-mono">{result.confidence.back}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-400 h-full rounded-full"
                      style={{ width: `${result.confidence.back}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Condition & Pricing Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Condition Grading Card */}
              <div className="bg-[#111726] border border-amber-500/20 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      เปอร์เซ็นต์ความสมบูรณ์ (Condition Grading)
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      Defect Analysis
                    </span>
                  </div>

                  <div className="flex items-baseline space-x-3 mb-2">
                    <span className="text-4xl font-extrabold text-amber-400 font-mono">
                      {result.condition.condition_pct}%
                    </span>
                    <span className="text-xs font-semibold text-emerald-400">
                      {result.condition.grade}
                    </span>
                  </div>

                  <p className="text-xs text-slate-400 mb-4">
                    ตรวจพบลักษณะรอยสึกหรอ/ตำหนิตามธรรมชาติรวม {result.condition.defect_count} จุด
                  </p>

                  <div className="space-y-1.5">
                    <div className="text-[11px] text-slate-400">จุดสังเกตและสภาพผิวที่ตรวจพบ:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.condition.defects_summary.length > 0 ? (
                        result.condition.defects_summary.map((def, idx) => (
                          <span
                            key={idx}
                            className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-950/40 text-amber-300 border border-amber-500/30"
                          >
                            • {def}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-950/40 text-emerald-300 border border-emerald-500/30">
                          ✓ ผิวเดิมสมบูรณ์ ไม่พบรอยสึกหรอวิกฤต
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] text-slate-400">
                  สูตรคำนวณ: ตัดคะแนนตามสัดส่วนพื้นที่ Defect Bounding Box เทียบกับขนาดพระ
                </div>
              </div>

              {/* Pricing Card */}
              <div className="bg-[#111726] border border-amber-500/20 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      ราคากลางประเมินตามสภาพ (Market Valuation)
                    </h3>
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      THB
                    </span>
                  </div>

                  <div className="bg-[#0b0f19] p-4 rounded-2xl border border-amber-500/20 mb-4">
                    <div className="text-[11px] text-slate-400">ราคาประเมินตามสภาพจริง ({result.condition.condition_pct}%):</div>
                    <div className="text-3xl sm:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-amber-300 to-yellow-400 font-mono mt-1">
                      ฿{result.pricing.estimated_price_thb.toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                    <span>ราคาฐานสภาพแชมป์ 100%:</span>
                    <span className="text-slate-200 font-mono">
                      ฿{result.pricing.base_price_thb.toLocaleString()}
                    </span>
                  </div>

                  {result.user_mode === "b2b" && (
                    <div className="mt-4 p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs">
                      <div className="font-bold text-amber-300 mb-1">คำแนะนำสำหรับร้านรับจำนำ (B2B):</div>
                      <div className="text-slate-300">
                        กรอบวงเงินรับจำนำปลอดภัย (LTV 60–70%):{" "}
                        <span className="font-mono text-amber-200 font-bold">
                          ฿{Math.round(result.pricing.estimated_price_thb * 0.6).toLocaleString()} – ฿{Math.round(result.pricing.estimated_price_thb * 0.7).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-800 text-[11px] text-slate-400">
                  อ้างอิงจากฐานข้อมูลการเช่าหาในสมาคมฯ และปรับลดหลั่นตาม Condition Grading
                </div>
              </div>
            </div>

            {/* Recommended Region for Best Liquidation */}
            <div className="bg-gradient-to-r from-[#121929] to-[#1c1829] border border-amber-500/30 rounded-3xl p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 text-xl">
                    📍
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100">
                      แนะนำภูมิภาคและตลาดที่ปล่อยเช่าได้ราคาสูงสุด
                    </h3>
                    <p className="text-xs text-amber-400 font-semibold">{result.recommendation.region}</p>
                  </div>
                </div>
                <span className="text-[11px] px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30 self-start sm:self-auto">
                  High Liquidity Zone
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed bg-black/30 p-4 rounded-xl border border-slate-800">
                {result.recommendation.reason}
              </p>
            </div>

            {/* Dual Comparison Gallery (User Photo vs Reference Image) */}
            <div className="bg-[#111726] border border-amber-500/20 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>🔍</span> เปรียบเทียบภาพถ่ายกับองค์ครูอ้างอิง (Master Reference Comparison)
                </h3>
                <span className="text-xs text-slate-400">Dual-View Calibration</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Front Comparison */}
                <div className="bg-[#0b0f19] p-4 rounded-2xl border border-slate-800">
                  <div className="text-xs font-bold text-amber-300 mb-3 flex items-center justify-between">
                    <span>ด้านหน้า (Obverse)</span>
                    <span className="text-[11px] text-slate-400">พิมพ์ทรงและมวลสาร</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <div className="h-40 bg-black/40 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800 mb-1">
                        {frontPreview ? (
                          <img src={frontPreview} alt="User Front" className="h-full w-auto object-contain" />
                        ) : (
                          <span className="text-xs text-slate-500">ภาพผู้ใช้</span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">ภาพถ่ายที่สแกน</span>
                    </div>

                    <div className="text-center">
                      <div className="h-40 bg-black/40 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800 mb-1">
                        <img
                          src={result.amulet_info.ref_front_img}
                          alt="Ref Front"
                          className="h-full w-auto object-contain"
                        />
                      </div>
                      <span className="text-[10px] text-amber-300">องค์ครูอ้างอิงสากล</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                    <span className="text-amber-400 font-semibold">จุดสังเกตด้านหน้า:</span> {result.amulet_info.front_keypoint}
                  </p>
                </div>

                {/* Back Comparison */}
                <div className="bg-[#0b0f19] p-4 rounded-2xl border border-slate-800">
                  <div className="text-xs font-bold text-amber-300 mb-3 flex items-center justify-between">
                    <span>ด้านหลัง (Reverse - CLAHE)</span>
                    <span className="text-[11px] text-emerald-400">Enhanced Yantra</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <div className="h-40 bg-black/40 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800 mb-1">
                        {backPreview ? (
                          <img src={backPreview} alt="User Back" className="h-full w-auto object-contain" />
                        ) : (
                          <span className="text-xs text-slate-500">ภาพผู้ใช้</span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">ภาพหลังผ่าน CLAHE</span>
                    </div>

                    <div className="text-center">
                      <div className="h-40 bg-black/40 rounded-xl overflow-hidden flex items-center justify-center border border-slate-800 mb-1">
                        <img
                          src={result.amulet_info.ref_back_img}
                          alt="Ref Back"
                          className="h-full w-auto object-contain"
                        />
                      </div>
                      <span className="text-[10px] text-amber-300">องค์ครูอ้างอิงสากล</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-300 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                    <span className="text-amber-400 font-semibold">จุดสังเกตด้านหลัง:</span> {result.amulet_info.back_keypoint}
                  </p>
                </div>
              </div>
            </div>

            {/* Typhoon AI Deep Analysis */}
            <div className="bg-[#111726] border border-amber-500/20 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center text-slate-950 font-black text-xs">
                    AI
                  </div>
                  <h3 className="text-base font-bold text-slate-100">
                    รายงานสังเคราะห์จุดสังเกตโดย Typhoon AI (Thai LLM)
                  </h3>
                </div>
                <span className="text-xs text-amber-400 font-semibold">Timeout 4s Fallback Ready</span>
              </div>

              <div className="bg-[#0b0f19] p-5 rounded-2xl border border-slate-800 text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-line">
                {result.ai_analysis}
              </div>
            </div>

            {/* Interactive Q&A Chat */}
            <div className="bg-[#111726] border border-amber-500/20 rounded-3xl p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>💬</span> ถาม-ตอบข้อสงสัยเพิ่มเติมกับผู้เชี่ยวชาญ AI
                </h3>
                <span className="text-xs text-slate-400">Typhoon Amulet Assistant</span>
              </div>

              {/* Chat Message Box */}
              <div
                ref={chatScrollRef}
                className="bg-[#0a0d14] rounded-2xl p-4 border border-slate-800 h-64 overflow-y-auto space-y-3 mb-3"
              >
                {chatMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs sm:text-sm ${
                        msg.sender === "user"
                          ? "bg-amber-500 text-slate-950 font-medium rounded-br-none"
                          : "bg-[#182136] text-slate-200 border border-slate-700/60 rounded-bl-none leading-relaxed whitespace-pre-line"
                      }`}
                    >
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 px-1">{msg.time}</span>
                  </div>
                ))}

                {isChatLoading && (
                  <div className="flex items-center space-x-2 text-slate-400 text-xs py-2">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce"></div>
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]"></div>
                    <span>Typhoon AI กำลังพิมพ์คำตอบ...</span>
                  </div>
                )}
              </div>

              {/* Quick Prompt Chips */}
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  "จุดสังเกตชี้ขาดแท้-เก๊ขององค์นี้มีตรงไหนบ้าง?",
                  "หากต้องการส่งประกวดควรเก็บรักษาอย่างไร?",
                  "ราคากลางปีนี้มีแนวโน้มขึ้นหรือลง?",
                ].map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(chip)}
                    className="text-[11px] px-3 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700 transition-colors"
                  >
                    + {chip}
                  </button>
                ))}
              </div>

              {/* Chat Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="พิมพ์คำถามเกี่ยวกับพระเครื่ององค์นี้..."
                  className="flex-1 bg-[#0b0f19] border border-slate-700 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={isChatLoading || !chatInput.trim()}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 text-slate-950 font-bold text-xs sm:text-sm transition-colors"
                >
                  ส่งคำถาม
                </button>
              </div>
            </div>

            {/* 5. Ethical Disclaimer */}
            <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-amber-200/90 text-xs flex items-start space-x-3">
              <span className="text-lg">⚖️</span>
              <div className="leading-relaxed">
                <span className="font-bold text-amber-300">ข้อสงวนสิทธิ์ทางจริยธรรมและกฎหมาย (Ethical Disclaimer): </span>
                {result.disclaimer}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-[#07090e] py-6 text-center text-xs text-slate-500">
        <p>© 2026 Dual-View Amulet AI. All rights reserved.</p>
        <p className="mt-1 text-[11px] text-slate-600">
          Powered by YOLO11 Computer Vision, OpenCV CLAHE & OpenTyphoon LLM.
        </p>
      </footer>
    </div>
  );
}
