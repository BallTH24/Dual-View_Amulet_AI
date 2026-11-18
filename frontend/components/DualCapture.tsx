"use client";

import React, { useRef, useState } from "react";
import {
  Camera,
  Upload,
  Sparkles,
  CheckCircle2,
  Image as ImageIcon,
} from "lucide-react";
import { DEMO_AMULETS } from "@/lib/api";
import { FocusIntent } from "@/lib/types";

interface DualCaptureProps {
  intent: FocusIntent;
  useMock: boolean;
  selectedPresetId: string;
  onSelectPresetId: (id: string) => void;
  frontFile: File | null;
  backFile: File | null;
  frontPreview: string | null;
  backPreview: string | null;
  onSelectFront: (file: File) => void;
  onSelectBack: (file: File) => void;
  onLoadDemoImages: () => void;
  onAnalyze: () => void;
}

const INTENT_TITLES: Record<FocusIntent, string> = {
  inspect: "ถ่ายรูปตรวจพระ & ดูวงกลมตำหนิ",
  market: "ถ่ายรูปเช็คราคากลาง & ภาคที่ขายดี",
  assistant: "ถ่ายรูปเพื่อเทียบองค์ครู & ถาม AI",
};

export default function DualCapture({
  intent,
  useMock,
  selectedPresetId,
  onSelectPresetId,
  frontFile,
  backFile,
  frontPreview,
  backPreview,
  onSelectFront,
  onSelectBack,
  onLoadDemoImages,
  onAnalyze,
}: DualCaptureProps) {
  const canSubmit = Boolean(frontFile);
  const hasBoth = Boolean(frontFile && backFile);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Card */}
      <div className="bg-[#1C1814] rounded-3xl border border-white/10 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-signature text-2xl sm:text-3xl font-bold text-[#F7E5B8]">
              {INTENT_TITLES[intent]}
            </h2>
            <p className="text-xs sm:text-sm text-[#B8AD9E] mt-1">
              ถ่ายหรือเลือกรูปด้านหน้า (และด้านหลังถ้ามี) แล้วระบบจะตรวจจับพิมพ์ทรงและวงกลมจุดตำหนิให้ทันที
            </p>
          </div>

          <button
            type="button"
            onClick={onLoadDemoImages}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#E6B85C]/15 hover:bg-[#E6B85C]/25 text-[#E6B85C] text-xs font-semibold transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>ใช้ภาพตัวอย่างทดสอบ</span>
          </button>
        </div>

        {/* Clean 7-model strip (Mock selector when testing) */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
          <span className="text-xs text-[#9A8F80] mr-1">
            {useMock ? "เลือกรุ่นจำลอง (Demo 7 รุ่น):" : "รุ่นที่รองรับ:"}
          </span>
          {DEMO_AMULETS.map((item) => {
            const active = useMock && selectedPresetId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => useMock && onSelectPresetId(item.id)}
                className={`px-3 py-1 rounded-full text-xs transition ${
                  active
                    ? "bg-[#E6B85C] text-[#18130D] font-bold"
                    : "bg-[#12100E] text-[#C7BCAE] border border-white/10"
                } ${useMock ? "cursor-pointer hover:border-[#E6B85C]/50" : "cursor-default"}`}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Front & Back Photo Slots with Drag-and-Drop + Dedicated Camera/Upload */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <CaptureSlot
          title="1. ด้านหน้าองค์พระ (จำเป็น)"
          hint="ให้เห็นพิมพ์ทรงและเส้นซุ้มชัดเจน สำหรับ YOLOv11 ตรวจจำแนกพิมพ์พระ"
          preview={frontPreview}
          file={frontFile}
          onSelectFile={onSelectFront}
        />
        <CaptureSlot
          title="2. ด้านหลัง (ไม่บังคับ / แนะนำเพื่อดูคราบกรุ)"
          hint="ให้เห็นอักขระยันต์ มวลสาร หรือคราบกรุ (ไม่บังคับ — แนะนำเพื่อตรวจจุดตำหนิครบถ้วน)"
          preview={backPreview}
          file={backFile}
          onSelectFile={onSelectBack}
        />
      </div>

      {/* Single Primary Action */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#1C1814] rounded-3xl p-5 border border-[#E6B85C]/35">
        <div className="text-xs sm:text-sm">
          {hasBoth ? (
            <span className="inline-flex items-center gap-2 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-5 h-5" />
              พร้อมตรวจหาจุดตำหนิและคำนวณราคากลางครบทั้ง 2 ด้าน
            </span>
          ) : frontFile ? (
            <span className="inline-flex items-center gap-2 text-[#E6B85C] font-semibold">
              <CheckCircle2 className="w-5 h-5" />
              พร้อมตรวจเฉพาะด้านหน้า (สามารถแนบรูปด้านหลังเพิ่มได้)
            </span>
          ) : (
            <span className="text-[#B8AD9E]">
              ใส่รูปด้านหน้าเป็นอย่างน้อยก่อนกดตรวจ (หรือกด &ldquo;ใช้ภาพตัวอย่างทดสอบ&rdquo;)
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={!canSubmit}
          onClick={onAnalyze}
          className="w-full sm:w-auto px-8 py-3 rounded-full bg-[#E6B85C] hover:bg-[#F0C975] text-[#18130D] font-bold text-sm shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
        >
          ตรวจพระ &amp; หาตำหนิเลย →
        </button>
      </div>
    </div>
  );
}

function CaptureSlot({
  title,
  hint,
  preview,
  file,
  onSelectFile,
}: {
  title: string;
  hint: string;
  preview: string | null;
  file: File | null;
  onSelectFile: (file: File) => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onSelectFile(f);
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      onSelectFile(droppedFile);
    }
  };

  return (
    <div className="bg-[#1C1814] rounded-3xl border border-white/10 p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-signature text-xl font-bold text-[#F7E5B8]">
            {title}
          </h3>
          <p className="text-xs text-[#9A8F80]">{hint}</p>
        </div>
        {file && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
            ✓ ได้ภาพแล้ว
          </span>
        )}
      </div>

      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative h-64 rounded-2xl bg-[#12100E] border-2 border-dashed overflow-hidden flex items-center justify-center cursor-pointer group transition ${
          isDragOver
            ? "border-[#E6B85C] bg-[#E6B85C]/10 scale-[1.01]"
            : "border-[#E6B85C]/35 hover:border-[#E6B85C]/75"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={title}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center px-6 space-y-2 text-[#9A8F80]">
            <ImageIcon className="w-10 h-10 mx-auto text-[#E6B85C]/80 group-hover:scale-110 transition" />
            <div className="text-sm font-medium text-[#F5EFE6]">
              {isDragOver ? "ปล่อยไฟล์ภาพที่นี่" : "ลากรูปมาวาง หรือแตะเพื่อเลือกภาพ"}
            </div>
            <div className="text-[11px] text-[#7A6F62]">
              รองรับไฟล์ JPG, PNG, WebP ทุกขนาด (ปรับขนาดอัตโนมัติ)
            </div>
          </div>
        )}

        {/* Arch Guide */}
        <div className="pointer-events-none absolute inset-4 flex items-center justify-center">
          <div className="w-36 h-52 rounded-t-[4rem] rounded-b-2xl border-2 border-[#E6B85C]/40" />
        </div>
      </div>

      {/* Hidden Inputs: Separate camera vs gallery */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-[#E6B85C] hover:bg-[#F0C975] text-[#18130D] text-xs font-bold transition cursor-pointer shadow-md"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>เปิดกล้องถ่าย</span>
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-[#F5EFE6] text-xs font-semibold transition cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>เลือกไฟล์รูปภาพ</span>
        </button>
      </div>
    </div>
  );
}
