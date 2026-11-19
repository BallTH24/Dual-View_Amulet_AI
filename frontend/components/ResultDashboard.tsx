"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  MapPin,
  Award,
  Send,
  Copy,
  Check,
  Eye,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  CircleDot,
  Search,
  FileText,
  Printer,
  X,
  ShieldCheck,
  Archive,
  BookmarkCheck,
} from "lucide-react";
import {
  AnalyzeResponse,
  ChatMessage,
  DefectSpot,
  UserMode,
  VaultItem,
} from "@/lib/types";
import {
  chatWithTyphoon,
  extractDefectSpots,
  resolveRefImageUrl,
} from "@/lib/api";

interface ResultDashboardProps {
  result: AnalyzeResponse;
  userMode: UserMode;
  frontPreview: string | null;
  backPreview: string | null;
  apiBase: string;
  useMock: boolean;
  onScanAgain: () => void;
  onOpenCertModal: () => void;
  onSavedToVault?: () => void;
}

async function downscaleImage(src: string, maxSize = 400): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      resolve(src);
      return;
    }
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, w);
        canvas.height = Math.max(1, h);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.75));
        } else {
          resolve(src);
        }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    } catch {
      resolve(src);
    }
  });
}

export default function ResultDashboard({
  result,
  userMode,
  frontPreview,
  backPreview,
  apiBase,
  useMock,
  onScanAgain,
  onOpenCertModal,
  onSavedToVault,
}: ResultDashboardProps) {
  const defects = extractDefectSpots(result);
  const [selectedDefectId, setSelectedDefectId] = useState<number | null>(
    defects[0]?.id ?? null
  );
  const [showCircles, setShowCircles] = useState(true);
  const [showClahe, setShowClahe] = useState(false);
  const [showRefSide, setShowRefSide] = useState(false);
  const [showLoupe, setShowLoupe] = useState(false);
  const [showCertCard, setShowCertCard] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);

  const [isSavedToVault, setIsSavedToVault] = useState(false);
  const [savingVault, setSavingVault] = useState(false);

  // Check if item is already saved in vault
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem("amulet_vault_v1");
      if (raw) {
        const list: VaultItem[] = JSON.parse(raw);
        const exists = list.some(
          (it) => it.model_id === result.model_id && Math.abs(it.condition_pct - result.condition.condition_pct) < 0.1
        );
        if (exists) setIsSavedToVault(true);
      }
    } catch {
      // ignore
    }
  }, [result]);

  const handleSaveToVault = async () => {
    if (isSavedToVault || savingVault) return;
    if (typeof window === "undefined") return;
    setSavingVault(true);
    try {
      const frontThumb = frontPreview ? await downscaleImage(frontPreview, 400) : "";
      const backThumb = displayedBackImage ? await downscaleImage(displayedBackImage, 400) : null;

      const now = new Date();
      const formattedDate = now.toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      const vaultItem: VaultItem = {
        id: `vault-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        saved_at: now.toISOString(),
        saved_at_formatted: formattedDate,
        name: result.amulet_info.name,
        temple: result.amulet_info.temple,
        year: result.amulet_info.year,
        model_id: result.model_id,
        condition_pct: result.condition.condition_pct,
        condition_grade: result.condition.grade,
        estimated_price_thb: result.pricing.estimated_price_thb,
        defect_count: result.condition.defect_count,
        front_thumbnail: frontThumb,
        back_thumbnail: backThumb,
        trust_tier: result.provenance?.trust_tier || "tier_2",
        trust_label: result.provenance?.label || "📁 Standard Upload",
        detected_software: result.provenance?.detected_software || null,
        forensics_notes: result.provenance?.forensics_notes || [],
        ambiguity_warning: result.ambiguity_warning || null,
        analyze_response: result,
      };

      const existingRaw = localStorage.getItem("amulet_vault_v1");
      const list: VaultItem[] = existingRaw ? JSON.parse(existingRaw) : [];
      list.unshift(vaultItem);
      localStorage.setItem("amulet_vault_v1", JSON.stringify(list));
      setIsSavedToVault(true);
      onSavedToVault?.();
    } catch (e) {
      console.error("Failed to save to vault:", e);
    } finally {
      setSavingVault(false);
    }
  };

  const formatTHB = (val: number) =>
    new Intl.NumberFormat("th-TH").format(val);

  const handleSendChat = async (customPrompt?: string) => {
    const q = (customPrompt ?? question).trim();
    if (!q || chatLoading) return;

    setMessages((prev) => [...prev, { role: "user", content: q }]);
    if (!customPrompt) setQuestion("");
    setChatLoading(true);

    try {
      const contextInfo = `พระเครื่อง: ${result.amulet_info.name} วัด: ${result.amulet_info.temple} ปี: ${result.amulet_info.year} ความสมบูรณ์: ${result.condition.condition_pct}% ราคากลาง: ${result.pricing.estimated_price_thb.toLocaleString()} บาท จุดหน้า: ${result.amulet_info.front_keypoint} จุดหลัง: ${result.amulet_info.back_keypoint} ตลาดแนะนำ: ${result.recommendation.region} (${result.recommendation.reason})`;
      const answer = await chatWithTyphoon({
        apiBase,
        useMock,
        amuletName: result.amulet_info.name,
        contextInfo,
        question: q,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `ไม่สามารถติดต่อ Typhoon API ได้: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleCopyCaption = async () => {
    const captionPrompt = `ช่วยเขียนแคปชันโพสต์ขายพระเครื่องรุ่น ${result.amulet_info.name} สภาพความสมบูรณ์ ${result.condition.condition_pct}% ราคาประเมิน ${formatTHB(result.pricing.estimated_price_thb)} บาท ให้สั้นกระชับน่าเชื่อถือ`;
    setChatLoading(true);
    try {
      const caption = await chatWithTyphoon({
        apiBase,
        useMock,
        amuletName: result.amulet_info.name,
        contextInfo: `สภาพ ${result.condition.condition_pct}%, ราคา ${result.pricing.estimated_price_thb} บาท`,
        question: captionPrompt,
      });
      setMessages((prev) => [
        ...prev,
        { role: "user", content: "สร้างแคปชันโพสต์ขาย" },
        { role: "assistant", content: caption },
      ]);
      await navigator.clipboard?.writeText(caption);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2500);
    } finally {
      setChatLoading(false);
    }
  };

  const selectedDefect =
    defects.find((d) => d.id === selectedDefectId) ?? defects[0] ?? null;

  const displayedBackImage =
    showClahe && result.clahe_back_image ? result.clahe_back_image : backPreview;
  const hasBackView = Boolean(displayedBackImage);

  // Strict Recognition Gate check: unrecognized amulet or outside 7 supported models
  const isUnrecognized =
    result.is_recognized === false || result.model_id === "unknown";

  if (isUnrecognized) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Strict Recognition Gate Warning Card */}
        <div className="bg-[#1C1814] rounded-3xl border-2 border-rose-500/50 p-6 sm:p-8 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <div className="inline-block px-3 py-1 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 text-xs font-bold">
              ด่านคัดกรองพิมพ์พระ (Strict Recognition Gate)
            </div>
            <h2 className="font-signature text-2xl sm:text-3xl font-bold text-[#F7E5B8]">
              ไม่รู้จักวัตถุนี้ หรือไม่อยู่ใน 7 รุ่นพระเครื่องที่ระบบรองรับ
            </h2>
            <p className="text-xs sm:text-sm text-[#C7BCAE] max-w-xl mx-auto leading-relaxed">
              {result.ai_analysis ||
                "ระบบตรวจสอบแล้วพบว่า ภาพที่อัปโหลดไม่ใช่พระเครื่องใน 7 รุ่นมาตรฐาน หรือภาพไม่ชัดเจน / มีขนาดเล็กเกินไป (< 5% ของภาพ) ระบบจึงปฏิเสธการประเมินราคาและการตรวจจับตำหนิ เพื่อความถูกต้องและเป็นธรรม"}
            </p>
          </div>

          {/* Clean Uploaded Image Preview (No defect pins, no price) */}
          <div className="pt-2">
            <p className="text-xs text-[#8E8375] mb-3">
              ภาพที่ส่งตรวจ (ไม่มีการปักหมุดตำหนิและไม่คำนวณราคา):
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {frontPreview && (
                <div className="w-48 h-64 rounded-2xl bg-[#12100E] border border-white/10 overflow-hidden flex flex-col items-center justify-center p-2">
                  <span className="text-[11px] text-[#A6998A] mb-1 font-semibold">
                    ด้านหน้า
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={frontPreview}
                    alt="Front Image"
                    className="w-full h-52 object-contain rounded-lg"
                  />
                </div>
              )}
              {backPreview && (
                <div className="w-48 h-64 rounded-2xl bg-[#12100E] border border-white/10 overflow-hidden flex flex-col items-center justify-center p-2">
                  <span className="text-[11px] text-[#A6998A] mb-1 font-semibold">
                    ด้านหลัง
                  </span>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={backPreview}
                    alt="Back Image"
                    className="w-full h-52 object-contain rounded-lg"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Supported Models reference list */}
          <div className="bg-[#12100E] rounded-2xl border border-white/10 p-4 text-left space-y-2">
            <h4 className="text-xs font-bold text-[#E6B85C]">
              7 รุ่นพระเครื่องมาตรฐานที่ระบบรองรับในปัจจุบัน:
            </h4>
            <div className="flex flex-wrap gap-2">
              {[
                "1. พระสมเด็จวัดระฆัง",
                "2. พระสมเด็จบางขุนพรหม",
                "3. พระสมเด็จเกศไชโย",
                "4. พระนางพญา",
                "5. พระผงสุพรรณ",
                "6. พระรอด",
                "7. พระซุ้มกอ",
              ].map((m) => (
                <span
                  key={m}
                  className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-[#C7BCAE]"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          {/* Re-scan button */}
          <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
            <button
              type="button"
              onClick={onScanAgain}
              className="inline-flex items-center justify-center gap-2 px-7 py-3 rounded-full bg-[#E6B85C] hover:bg-[#F0C975] active:scale-[0.98] text-[#18130D] font-bold text-sm shadow-lg transition cursor-pointer touch-manipulation"
            >
              <RotateCcw className="w-4 h-4" />
              <span>ถ่ายหรืออัปโหลดภาพใหม่</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* 1. Primary Focus: Defect Inspection Photo View with Circles */}
      <section className="bg-[#1C1814] rounded-3xl border border-[#E6B85C]/30 p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-[#E6B85C]">
              ความมั่นใจรวม {result.confidence.total.toFixed(1)}% (หน้า{" "}
              {result.confidence.front.toFixed(0)}%
              {result.confidence.back != null ? ` • หลัง ${result.confidence.back.toFixed(0)}%` : ""}
              )
              {result.system_specs
                ? ` • ${result.system_specs.model_used} (${result.system_specs.device})`
                : ""}
            </span>
            <h2 className="font-signature text-2xl sm:text-3xl font-bold text-[#F7E5B8] mt-0.5">
              {result.amulet_info.name}
            </h2>
            <p className="text-xs sm:text-sm text-[#B8AD9E]">
              {result.amulet_info.temple} • {result.amulet_info.year}
            </p>

            {/* Image Provenance & AI Forensics Trust Tier Badge & Notes */}
            {result.provenance && (
              <div className="mt-2.5 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${
                      result.provenance.trust_tier === "flagged"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                        : result.provenance.trust_tier === "unverified_metadata"
                        ? "bg-amber-500/20 text-amber-300 border-amber-400/50"
                        : result.provenance.trust_tier === "tier_1"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-400/50"
                        : "bg-sky-500/20 text-sky-300 border-sky-400/50"
                    }`}
                  >
                    {result.provenance.label}
                  </span>
                  {result.provenance.detected_software && (
                    <span className="text-[11px] text-rose-300 font-medium">
                      ตรวจพบ: {result.provenance.detected_software}
                    </span>
                  )}
                </div>

                {/* Red alert box for Flagged */}
                {result.provenance.trust_tier === "flagged" && (
                  <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/50 text-xs text-rose-200 space-y-1.5">
                    <div className="flex items-center gap-2 font-bold text-rose-300 text-sm">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>คำเตือนความน่าเชื่อถือของภาพ (AI Forensics Warning)</span>
                    </div>
                    {result.provenance.warning && (
                      <p className="text-rose-200/90 leading-relaxed">{result.provenance.warning}</p>
                    )}
                    {result.provenance.forensics_notes && result.provenance.forensics_notes.length > 0 && (
                      <ul className="list-disc list-inside space-y-0.5 pt-1 text-[11px] text-rose-300/90 font-mono">
                        {result.provenance.forensics_notes.map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Amber banner for Unverified Metadata */}
                {result.provenance.trust_tier === "unverified_metadata" && (
                  <div className="p-3 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-200 space-y-1">
                    <div className="flex items-center gap-2 font-bold text-amber-300 text-xs sm:text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>ข้อสังเกตข้อมูลภาพ (Unverified Camera Metadata)</span>
                    </div>
                    {result.provenance.warning && (
                      <p className="text-amber-200/90 leading-relaxed text-[11px]">{result.provenance.warning}</p>
                    )}
                    {result.provenance.forensics_notes && result.provenance.forensics_notes.length > 0 && (
                      <ul className="list-disc list-inside space-y-0.5 pt-0.5 text-[11px] text-amber-300/80">
                        {result.provenance.forensics_notes.map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Minimal View Toggles */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCircles(!showCircles)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                showCircles
                  ? "bg-rose-500/20 text-rose-300 border border-rose-400/50"
                  : "bg-white/5 text-[#B8AD9E]"
              }`}
            >
              <CircleDot className="w-3.5 h-3.5" />
              <span>วงกลมตำหนิ ({defects.length})</span>
            </button>

            {hasBackView && (
              <button
                type="button"
                onClick={() => setShowClahe(!showClahe)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                  showClahe
                    ? "bg-[#E6B85C] text-[#18130D]"
                    : "bg-white/5 text-[#B8AD9E]"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>ส่อง CLAHE</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowLoupe(!showLoupe)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer ${
                showLoupe
                  ? "bg-amber-400 text-[#18130D] shadow-md shadow-amber-400/20"
                  : "bg-white/5 text-[#B8AD9E]"
              }`}
            >
              <Search className="w-3.5 h-3.5" />
              <span>แว่นส่องพระ 3x</span>
            </button>

            <button
              type="button"
              onClick={() => setShowRefSide(!showRefSide)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${
                showRefSide
                  ? "bg-[#E6B85C] text-[#18130D]"
                  : "bg-white/5 text-[#B8AD9E]"
              }`}
            >
              เทียบองค์ครู
            </button>
          </div>
        </div>

        {/* Front & Back Photos with Interactive Defect Circles & 3x Loupe */}
        <div
          className={`grid gap-4 ${
            hasBackView ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 max-w-lg mx-auto"
          }`}
        >
          <DefectPhotoFrame
            title={hasBackView ? "ด้านหน้า (แตะวงกลมเพื่อดูจุดตำหนิ)" : "ด้านหน้า (ผลการตรวจจับพิมพ์และตำหนิ)"}
            imageSrc={frontPreview}
            isClahe={false}
            showCircles={showCircles}
            showLoupe={showLoupe}
            spots={defects.filter((d) => d.side === "front")}
            selectedId={selectedDefectId}
            onSelectSpot={setSelectedDefectId}
          />
          {hasBackView && (
            <DefectPhotoFrame
              title={
                showClahe && result.clahe_back_image
                  ? "ด้านหลัง (OpenCV CLAHE จริง)"
                  : "ด้านหลัง (แตะวงกลมเพื่อดูจุดตำหนิ)"
              }
              imageSrc={displayedBackImage}
              isClahe={showClahe && !result.clahe_back_image}
              showCircles={showCircles}
              showLoupe={showLoupe}
              spots={defects.filter((d) => d.side === "back")}
              selectedId={selectedDefectId}
              onSelectSpot={setSelectedDefectId}
            />
          )}
        </div>

        {/* Defect Breakdown List */}
        {defects.length > 0 && (
          <div className="rounded-2xl bg-[#12100E] p-4 space-y-2.5">
            <div className="text-xs font-semibold text-[#E6B85C]">
              จุดสังเกตและตำหนิที่ตรวจพบ ({result.condition.defect_count} จุด •{" "}
              {result.condition.grade}):
            </div>
            <div className="flex flex-wrap gap-2">
              {defects.map((spot) => {
                const isSelected = selectedDefect?.id === spot.id;
                return (
                  <button
                    key={spot.id}
                    type="button"
                    onClick={() => setSelectedDefectId(spot.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs transition cursor-pointer flex items-center gap-2 ${
                      isSelected
                        ? "bg-rose-500/20 text-rose-200 border border-rose-400/60 font-semibold"
                        : "bg-white/5 text-[#C7BCAE] hover:bg-white/10"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {spot.id}
                    </span>
                    <span>
                      {spot.label} ({spot.side === "front" ? "หน้า" : "หลัง"})
                    </span>
                    {spot.severity === "high" ? (
                      <span className="text-[10px] px-1.5 py-0.5 bg-rose-500/30 text-rose-300 rounded border border-rose-500/40 font-semibold">
                        ความเสี่ยงสูง
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 font-medium">
                        ปานกลาง
                      </span>
                    )}
                    {spot.confidence && (
                      <span
                        className="text-[10px] text-rose-300/90 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20"
                        title="ความชัดเจนในการตรวจจับรอยตำหนิของโมเดล (มิใช่ความสมบูรณ์พระ)"
                      >
                        ความชัดรอย {spot.confidence.toFixed(0)}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedDefect && (
              <div className="mt-1 p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] text-[#B8AD9E] flex flex-wrap items-center justify-between gap-2">
                <span>
                  🔍 จุดที่ {selectedDefect.id}:{" "}
                  <strong className="text-[#F5EFE6]">{selectedDefect.label}</strong>{" "}
                  ({selectedDefect.side === "front" ? "ด้านหน้า" : "ด้านหลัง"})
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[#8E8375]">
                    ระดับความเสี่ยง:{" "}
                    <strong
                      className={
                        selectedDefect.severity === "high" ? "text-rose-400" : "text-amber-400"
                      }
                    >
                      {selectedDefect.severity === "high" ? "ความเสี่ยงสูง" : "ปานกลาง"}
                    </strong>
                  </span>
                  <span className="text-rose-300 font-medium bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                    ความชัดเจนรอย:{" "}
                    {selectedDefect.confidence ? `${selectedDefect.confidence.toFixed(0)}%` : "-"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Keypoints & Reference Side-by-Side Drawer */}
        <div
          className={`grid gap-3 text-xs ${
            hasBackView ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
          }`}
        >
          <div className="rounded-2xl bg-[#12100E] p-3.5 space-y-1">
            <div className="font-semibold text-[#E6B85C]">จุดสังเกตด้านหน้า</div>
            <p className="text-[#C7BCAE] leading-relaxed">
              {result.amulet_info.front_keypoint}
            </p>
          </div>
          {hasBackView && (
            <div className="rounded-2xl bg-[#12100E] p-3.5 space-y-1">
              <div className="font-semibold text-[#E6B85C]">
                จุดสังเกตด้านหลัง (CLAHE)
              </div>
              <p className="text-[#C7BCAE] leading-relaxed">
                {result.amulet_info.back_keypoint}
              </p>
            </div>
          )}
        </div>

        {showRefSide && (
          <div className="rounded-2xl bg-[#12100E] border border-white/10 p-4 space-y-3">
            <div className="text-xs font-bold text-[#E6B85C]">
              {hasBackView
                ? "เทียบภาพองค์ครูมาตรฐาน (หน้าชนหน้า – หลังชนหลัง)"
                : "เทียบภาพองค์ครูมาตรฐาน (ด้านหน้า)"}
            </div>
            <div
              className={`grid gap-4 ${
                hasBackView ? "grid-cols-2" : "grid-cols-1 max-w-xs mx-auto"
              }`}
            >
              <RefBox
                label="องค์ครูด้านหน้า"
                src={resolveRefImageUrl(apiBase, result.amulet_info.ref_front_img)}
                fallbackName={result.amulet_info.ref_front_img}
              />
              {hasBackView && (
                <RefBox
                  label="องค์ครูด้านหลัง"
                  src={resolveRefImageUrl(apiBase, result.amulet_info.ref_back_img)}
                  fallbackName={result.amulet_info.ref_back_img}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {/* Somdej Ambiguity Warning Banner if applicable */}
      {result.ambiguity_warning && result.ambiguity_warning.is_ambiguous && (
        <section className="bg-gradient-to-r from-amber-500/15 via-[#1C1814] to-amber-500/10 border-2 border-amber-500/50 rounded-3xl p-5 sm:p-6 space-y-3 shadow-xl">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>แจ้งเตือนพิมพ์พระใกล้เคียง (Somdej Ambiguity Gate)</span>
          </div>
          <p className="text-xs sm:text-sm text-[#F5EFE6] leading-relaxed">
            โมเดลตรวจพบว่าองค์พระมีลักษณะพิมพ์ทรงใกล้เคียงกันมากระหว่าง{" "}
            <strong className="text-[#F7E5B8]">{result.ambiguity_warning.primary_candidate}</strong> (อันดับ 1) และ{" "}
            <strong className="text-[#F7E5B8]">{result.ambiguity_warning.secondary_candidate}</strong> (อันดับ 2) โดยมีค่าความมั่นใจห่างกันไม่เกิน 15%
          </p>
          <div className="p-3.5 rounded-2xl bg-[#12100E]/85 border border-amber-500/25 text-xs space-y-1.5">
            <div className="text-amber-300 font-semibold">
              📊 {result.ambiguity_warning.price_range_note}
            </div>
            <div className="text-[#C7BCAE]">
              💡 <strong>คำแนะนำผู้เชี่ยวชาญ:</strong> {result.ambiguity_warning.expert_advice}
            </div>
          </div>
        </section>
      )}

      {/* 2. Price, Completeness % & Best Region Card */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#1C1814] rounded-3xl border border-white/10 p-5 space-y-3">
          <div className="flex items-center justify-between text-xs text-[#9A8F80]">
            <span>ราคาประเมินตามสภาพ ({result.condition.condition_pct}%)</span>
            <span>
              ราคากลางสวย: ฿{formatTHB(result.pricing.base_price_thb)}
            </span>
          </div>
          <div className="font-signature text-3xl font-bold text-[#E6B85C]">
            ฿ {formatTHB(result.pricing.estimated_price_thb)} บาท
          </div>
          <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#E6B85C] rounded-full transition-all"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(0, result.condition.condition_pct)
                )}%`,
              }}
            />
          </div>
        </div>

        <div className="bg-[#1C1814] rounded-3xl border border-white/10 p-5 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#E6B85C]">
            <MapPin className="w-4 h-4 shrink-0" />
            <span>จังหวัด / ภูมิภาคที่แนะนำให้นำไปขาย</span>
          </div>
          <div className="text-sm font-bold text-[#F5EFE6]">
            {result.recommendation.region}
          </div>
          <p className="text-xs text-[#B8AD9E] leading-relaxed">
            {result.recommendation.reason}
          </p>
        </div>
      </section>

      {/* 3. Typhoon AI Q&A */}
      <section className="bg-[#1C1814] rounded-3xl border border-white/10 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#E6B85C]" />
            <h3 className="font-signature text-xl font-bold text-[#F7E5B8]">
              คำแนะนำจากผู้ช่วย AI (Typhoon)
            </h3>
          </div>

          {userMode === "b2b" && (
            <button
              type="button"
              onClick={handleCopyCaption}
              disabled={chatLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#E6B85C]/15 hover:bg-[#E6B85C]/25 text-[#E6B85C] text-xs font-semibold transition cursor-pointer"
            >
              {copiedCaption ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>คัดลอกแคปชันแล้ว</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>สร้างแคปชันขาย</span>
                </>
              )}
            </button>
          )}
        </div>

        <div className="rounded-2xl bg-[#12100E] p-4 text-xs sm:text-sm text-[#E8DFD1] leading-relaxed whitespace-pre-line break-words">
          {result.ai_analysis}
        </div>

        {messages.length > 0 && (
          <div className="space-y-2.5">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`p-3.5 rounded-2xl text-xs sm:text-sm whitespace-pre-line break-words leading-relaxed ${
                  m.role === "user"
                    ? "bg-[#E6B85C]/15 text-[#F7E5B8] ml-6 sm:ml-12 border border-[#E6B85C]/30"
                    : "bg-[#12100E] text-[#E8DFD1] mr-6 sm:mr-12 border border-white/5"
                }`}
              >
                {m.content}
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendChat();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="พิมพ์ถามจุดสังเกตหรือข้อมูลเพิ่มเติม..."
            className="flex-1 px-4 py-2.5 rounded-full border border-white/10 bg-[#12100E] text-[#F5EFE6] text-xs sm:text-sm focus:outline-none focus:border-[#E6B85C]/60"
          />
          <button
            type="submit"
            disabled={chatLoading || !question.trim()}
            className="px-5 py-2.5 rounded-full bg-[#E6B85C] text-[#18130D] text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>ถาม AI</span>
          </button>
        </form>
      </section>

      {/* Bottom Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onScanAgain}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-semibold text-[#F5EFE6] transition cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-[#E6B85C]" />
          <span>ถ่าย / สแกนองค์ใหม่</span>
        </button>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleSaveToVault}
            disabled={isSavedToVault || savingVault}
            className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition cursor-pointer ${
              isSavedToVault
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                : "bg-[#E6B85C]/15 hover:bg-[#E6B85C]/25 text-[#E6B85C] border border-[#E6B85C]/40"
            }`}
          >
            {isSavedToVault ? (
              <>
                <BookmarkCheck className="w-4 h-4 text-emerald-400" />
                <span>บันทึกในตู้พระแล้ว</span>
              </>
            ) : (
              <>
                <Archive className="w-4 h-4 text-[#E6B85C]" />
                <span>{savingVault ? "กำลังบันทึก..." : "💾 บันทึกเข้าตู้พระส่วนตัว"}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowCertCard(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-xs sm:text-sm font-semibold text-[#F7E5B8] border border-[#E6B85C]/40 transition cursor-pointer"
          >
            <FileText className="w-4 h-4 text-[#E6B85C]" />
            <span>ใบสรุปผลสแกน AI</span>
          </button>

          <button
            type="button"
            onClick={onOpenCertModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#E6B85C] hover:bg-[#F0C975] text-[#18130D] text-xs sm:text-sm font-bold shadow cursor-pointer"
          >
            <Award className="w-4 h-4" />
            <span>ส่งต่อออกบัตรรับรอง (Check Cer)</span>
          </button>
        </div>
      </div>

      {/* Printable Digital Certificate Modal */}
      {showCertCard && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1C1814] rounded-3xl border-2 border-[#E6B85C]/60 max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl text-[#F5EFE6]">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#E6B85C]/30 pb-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[#E6B85C]">
                  <ShieldCheck className="w-6 h-6" />
                  <span className="text-xs uppercase tracking-widest font-bold">
                    Official AI Inspection Certificate
                  </span>
                  {result.provenance && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        result.provenance.trust_tier === "flagged"
                          ? "bg-rose-500/20 text-rose-300 border-rose-500/50"
                          : result.provenance.trust_tier === "unverified_metadata"
                          ? "bg-amber-500/20 text-amber-300 border-amber-400/50"
                          : result.provenance.trust_tier === "tier_1"
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-400/50"
                          : "bg-sky-500/20 text-sky-300 border-sky-400/50"
                      }`}
                    >
                      {result.provenance.label}
                    </span>
                  )}
                </div>
                <h3 className="font-signature text-2xl sm:text-3xl font-bold text-[#F7E5B8]">
                  ใบรายงานผลการตรวจส่องพระเครื่อง
                </h3>
                <p className="text-xs text-[#9A8F80]">
                  รหัสอ้างอิง: #SCAN-{result.model_id.toUpperCase()}-2569 • ตรวจสอบโดย Dual-View Amulet AI
                </p>

                {/* Provenance Alert in Certificate */}
                {result.provenance &&
                  (result.provenance.trust_tier === "flagged" ||
                    result.provenance.trust_tier === "unverified_metadata") && (
                    <div
                      className={`mt-2 p-2.5 rounded-xl border text-xs space-y-1 ${
                        result.provenance.trust_tier === "flagged"
                          ? "bg-rose-950/40 border-rose-500/40 text-rose-200"
                          : "bg-amber-950/30 border-amber-500/30 text-amber-200"
                      }`}
                    >
                      <div className="font-bold flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{result.provenance.label}</span>
                      </div>
                      {result.provenance.warning && (
                        <p className="text-[11px] opacity-90">{result.provenance.warning}</p>
                      )}
                      {result.provenance.forensics_notes &&
                        result.provenance.forensics_notes.length > 0 && (
                          <ul className="list-disc list-inside space-y-0.5 text-[10px] opacity-80 pt-0.5 font-mono">
                            {result.provenance.forensics_notes.map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ul>
                        )}
                    </div>
                  )}
              </div>

              <button
                type="button"
                onClick={() => setShowCertCard(false)}
                className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#C7BCAE] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photos & Core Specs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 text-center">
                <div className="h-44 rounded-xl bg-[#0B0A08] border border-[#E6B85C]/30 overflow-hidden flex items-center justify-center p-1">
                  {frontPreview && (
                    <img src={frontPreview} alt="หน้า" className="w-full h-full object-contain" />
                  )}
                </div>
                <span className="text-[11px] text-[#C7BCAE]">ด้านหน้า (พิมพ์ทรง)</span>
              </div>

              <div className="space-y-1 text-center">
                <div className="h-44 rounded-xl bg-[#0B0A08] border border-[#E6B85C]/30 overflow-hidden flex items-center justify-center p-1">
                  {displayedBackImage && (
                    <img src={displayedBackImage} alt="หลัง" className="w-full h-full object-contain" />
                  )}
                </div>
                <span className="text-[11px] text-[#C7BCAE]">ด้านหลัง (คราบกรุ/มิติยันต์)</span>
              </div>
            </div>

            {/* Amulet Info Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-[#12100E] border border-white/5 text-xs">
              <div>
                <span className="text-[#8E8375]">ชื่อพระเครื่อง:</span>
                <p className="font-bold text-[#F7E5B8]">{result.amulet_info.name}</p>
              </div>
              <div>
                <span className="text-[#8E8375]">วัด / แหล่งกำเนิด:</span>
                <p className="font-semibold text-[#E8DFD1]">{result.amulet_info.temple}</p>
              </div>
              <div>
                <span className="text-[#8E8375]">ยุคสมัย / ปี:</span>
                <p className="font-semibold text-[#E8DFD1]">{result.amulet_info.year}</p>
              </div>
              <div>
                <span className="text-[#8E8375]">ความมั่นใจ AI:</span>
                <p className="font-bold text-emerald-400">{result.confidence.total.toFixed(1)}%</p>
              </div>
              <div>
                <span className="text-[#8E8375]">สภาพความสมบูรณ์:</span>
                <p className="font-bold text-[#E6B85C]">{result.condition.condition_pct}% ({result.condition.grade})</p>
              </div>
              <div>
                <span className="text-[#8E8375]">ราคาประเมินกลาง:</span>
                <p className="font-bold text-[#F7E5B8]">฿{formatTHB(result.pricing.estimated_price_thb)} บาท</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <span className="text-[11px] text-[#8E8375]">
                * ผลการวิเคราะห์เบื้องต้นเพื่อประกอบการตัดสินใจ
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") window.print();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E6B85C] hover:bg-[#F0C975] text-[#18130D] text-xs font-bold transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>พิมพ์ / บันทึก (Print)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCertCard(false)}
                  className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-xs text-[#C7BCAE] transition cursor-pointer"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legal Disclaimer */}
      <footer className="flex items-start gap-2.5 rounded-2xl bg-[#1A1610] border border-[#E6B85C]/20 p-3.5 text-xs text-[#C7BCAE]">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#E6B85C]" />
        <span>{result.disclaimer}</span>
      </footer>
    </div>
  );
}

function DefectPhotoFrame({
  title,
  imageSrc,
  isClahe,
  showCircles,
  showLoupe,
  spots,
  selectedId,
  onSelectSpot,
}: {
  title: string;
  imageSrc: string | null;
  isClahe: boolean;
  showCircles: boolean;
  showLoupe: boolean;
  spots: DefectSpot[];
  selectedId: number | null;
  onSelectSpot: (id: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!showLoupe || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    setLoupePos({ x, y });
  };

  const handleMouseLeave = () => {
    setLoupePos(null);
  };

  return (
    <div className="rounded-2xl bg-[#12100E] border border-white/10 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-[#E6B85C]">{title}</span>
        {showLoupe && (
          <span className="text-[11px] text-amber-400 font-bold bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
            🔍 เลื่อนเมาส์เพื่อส่องขยาย 3x
          </span>
        )}
      </div>
      <div className="rounded-xl bg-[#0B0A08] border border-white/5 overflow-hidden flex items-center justify-center min-h-[19rem] max-h-96 p-2">
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative inline-block max-h-80 w-auto select-none"
        >
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt={title}
              className={`max-h-80 w-auto object-contain block mx-auto rounded-lg transition ${
                isClahe ? "clahe-preview" : ""
              }`}
            />
          ) : (
            <div className="h-64 w-48 flex items-center justify-center text-xs text-[#8E8375]">
              ไม่มีภาพ
            </div>
          )}

          {/* 3x Digital Loupe Lens */}
          {showLoupe && loupePos && imageSrc && (
            <div
              style={{
                left: `${loupePos.x}px`,
                top: `${loupePos.y}px`,
                backgroundImage: `url(${imageSrc})`,
                backgroundRepeat: "no-repeat",
                backgroundSize: "320%",
                backgroundPosition: `${(loupePos.x / (containerRef.current?.offsetWidth || 1)) * 100}% ${(loupePos.y / (containerRef.current?.offsetHeight || 1)) * 100}%`,
              }}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full border-4 border-[#E6B85C] shadow-[0_0_24px_rgba(230,184,92,0.7)] z-30 bg-[#12100E]"
            >
              <div className="absolute inset-0 rounded-full border border-white/20 flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[#E6B85C]" />
              </div>
              <span className="absolute bottom-1 right-2 text-[9px] font-bold text-[#E6B85C] bg-black/80 px-1 rounded">
                3x
              </span>
            </div>
          )}

          {/* Interactive Circular Defect Markers */}
          {showCircles &&
            spots.map((spot) => {
              const isActive = selectedId === spot.id;
              const size = spot.radiusPx * 2;
              return (
                <button
                  key={spot.id}
                  type="button"
                  onClick={() => onSelectSpot(spot.id)}
                  title={`${spot.label} (${spot.side === "front" ? "ด้านหน้า" : "ด้านหลัง"})`}
                  style={{
                    left: `${spot.xPct}%`,
                    top: `${spot.yPct}%`,
                    width: `${size}px`,
                    height: `${size}px`,
                  }}
                  className={`defect-ring -translate-x-1/2 -translate-y-1/2 absolute rounded-full border-[3px] flex items-center justify-center transition cursor-pointer z-20 ${
                    isActive
                      ? "border-rose-400 bg-rose-500/25 shadow-[0_0_16px_rgba(244,63,94,0.8)] scale-110"
                      : "border-[#E6B85C] bg-[#E6B85C]/15 hover:border-rose-400"
                  }`}
                >
                  <span className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow">
                    {spot.id}
                  </span>
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function RefBox({
  label,
  src,
  fallbackName,
}: {
  label: string;
  src: string | null;
  fallbackName: string;
}) {
  const [err, setErr] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="h-44 rounded-xl bg-[#0B0A08] border border-white/10 overflow-hidden flex items-center justify-center p-2 text-center">
        {src && !err ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={label}
            onError={() => setErr(true)}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="space-y-1 text-[#9A8F80]">
            <div className="w-14 h-20 mx-auto rounded-t-3xl rounded-b-xl border border-dashed border-[#E6B85C]/50 bg-[#1C1814] flex items-center justify-center text-[11px] font-bold text-[#E6B85C]">
              องค์ครู
            </div>
            <div className="text-[10px] opacity-75 truncate max-w-[120px]">
              {fallbackName}
            </div>
          </div>
        )}
      </div>
      <div className="text-[11px] text-center text-[#B8AD9E]">{label}</div>
    </div>
  );
}
