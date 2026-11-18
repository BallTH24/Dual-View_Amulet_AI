"use client";

import React, { useState, useEffect } from "react";
import {
  Archive,
  Coins,
  Percent,
  Trash2,
  FileText,
  ShieldCheck,
  AlertTriangle,
  ArrowLeft,
  Camera,
  X,
  MapPin,
  Sparkles,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { VaultItem } from "@/lib/types";

interface AmuletVaultProps {
  onGoBack: () => void;
  onInspectNew: () => void;
  onVaultCountChange?: (count: number) => void;
}

const VAULT_STORAGE_KEY = "amulet_vault_v1";

export function loadVaultFromStorage(): VaultItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to load vault items:", e);
    return [];
  }
}

export function saveVaultToStorage(items: VaultItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("Failed to save to vault:", e);
  }
}

export default function AmuletVault({
  onGoBack,
  onInspectNew,
  onVaultCountChange,
}: AmuletVaultProps) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadVaultFromStorage();
    setItems(loaded);
    onVaultCountChange?.(loaded.length);
  }, []);

  const handleDeleteItem = (id: string) => {
    const next = items.filter((it) => it.id !== id);
    setItems(next);
    saveVaultToStorage(next);
    onVaultCountChange?.(next.length);
    setConfirmDeleteId(null);
    if (selectedItem?.id === id) {
      setSelectedItem(null);
    }
  };

  const handleClearAll = () => {
    if (window.confirm("คุณแน่ใจหรือไม่ว่าต้องการลบพระเครื่องทั้งหมดออกจากตู้พระ?")) {
      setItems([]);
      saveVaultToStorage([]);
      onVaultCountChange?.(0);
      setSelectedItem(null);
    }
  };

  const formatTHB = (val: number) =>
    new Intl.NumberFormat("th-TH").format(val);

  // Portfolio Summary Stats
  const totalCount = items.length;
  const totalValueTHB = items.reduce(
    (acc, it) => acc + (it.estimated_price_thb || 0),
    0
  );
  const avgCondition = totalCount
    ? (
        items.reduce((acc, it) => acc + (it.condition_pct || 0), 0) /
        totalCount
      ).toFixed(1)
    : "0.0";

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* 1. Header Card */}
      <div className="bg-[#1C1814] rounded-3xl border border-[#E6B85C]/35 p-5 sm:p-7 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-[#E6B85C]/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E6B85C]/15 border border-[#E6B85C]/30 text-xs font-bold text-[#E6B85C]">
              <Archive className="w-3.5 h-3.5" />
              <span>ตู้พระส่วนตัว &amp; ตัวติดตามพอร์ต (Digital Amulet Vault)</span>
            </div>
            <h2 className="font-signature text-3xl sm:text-4xl font-bold text-[#F7E5B8]">
              คอลเลกชันพระเครื่องของฉัน
            </h2>
            <p className="text-xs sm:text-sm text-[#C7BCAE]">
              จัดเก็บประวัติการสแกน ติดตามมูลค่าพอร์ตรวม และตรวจสอบใบรายงานผล AI ได้ทุกเวลา
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onGoBack}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 text-xs font-semibold text-[#F5EFE6] transition cursor-pointer touch-manipulation"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>กลับหน้าหลัก</span>
            </button>

            <button
              type="button"
              onClick={onInspectNew}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#E6B85C] hover:bg-[#F0C975] active:scale-[0.98] text-[#18130D] font-bold text-xs sm:text-sm shadow-md transition cursor-pointer touch-manipulation"
            >
              <Camera className="w-4 h-4" />
              <span>สแกนพระเพิ่ม</span>
            </button>
          </div>
        </div>

        {/* Portfolio Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-5 mt-5 border-t border-white/5 text-xs">
          <div className="p-4 rounded-2xl bg-[#12100E]/80 border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-[#8E8375]">
              <span>จำนวนพระในตู้</span>
              <Archive className="w-4 h-4 text-[#E6B85C]" />
            </div>
            <div className="font-signature text-3xl font-bold text-[#F5EFE6]">
              {totalCount}{" "}
              <span className="text-sm font-sans font-normal text-[#8E8375]">
                องค์
              </span>
            </div>
            <span className="text-[11px] text-[#A6998A] block">
              บันทึกในอุปกรณ์เครื่องนี้ (LocalStorage)
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#12100E]/80 border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-[#8E8375]">
              <span>มูลค่าประเมินรวมทั้งพอร์ต</span>
              <Coins className="w-4 h-4 text-[#E6B85C]" />
            </div>
            <div className="font-signature text-3xl font-bold text-[#E6B85C]">
              ฿ {formatTHB(totalValueTHB)}
            </div>
            <span className="text-[11px] text-[#A6998A] block">
              คำนวณจากราคากลาง x สภาพองค์พระ
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-[#12100E]/80 border border-white/5 space-y-1">
            <div className="flex items-center justify-between text-[#8E8375]">
              <span>ค่าสภาพเฉลี่ยทั้งตู้</span>
              <Percent className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="font-signature text-3xl font-bold text-emerald-400">
              {avgCondition}%
            </div>
            <span className="text-[11px] text-[#A6998A] block">
              ความสมบูรณ์ผิวพระเฉลี่ย
            </span>
          </div>
        </div>
      </div>

      {/* 2. Items List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3 className="font-signature text-2xl font-bold text-[#F7E5B8] flex items-center gap-2">
            <span>รายการพระเครื่องที่บันทึก ({items.length})</span>
          </h3>

          {items.length > 0 && (
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs text-rose-400 hover:text-rose-300 transition cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>ล้างตู้พระทั้งหมด</span>
            </button>
          )}
        </div>

        {items.length === 0 ? (
          <div className="bg-[#1C1814] rounded-3xl border border-white/10 p-10 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#E6B85C]/15 border border-[#E6B85C]/30 flex items-center justify-center text-[#E6B85C]">
              <Archive className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="font-signature text-2xl font-bold text-[#F5EFE6]">
                ยังไม่มีพระเครื่องในตู้พระส่วนตัว
              </h4>
              <p className="text-xs sm:text-sm text-[#8E8375] max-w-md mx-auto">
                เมื่อคุณถ่ายภาพสแกนตรวจพระเครื่อง ให้กดปุ่ม{" "}
                <span className="text-[#E6B85C] font-semibold">
                  &ldquo;บันทึกเข้าตู้พระส่วนตัว&rdquo;
                </span>{" "}
                เพื่อเก็บรายการไว้ในหน้านี้
              </p>
            </div>
            <button
              type="button"
              onClick={onInspectNew}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#E6B85C] hover:bg-[#F0C975] text-[#18130D] font-bold text-xs sm:text-sm shadow transition cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>เริ่มถ่ายภาพสแกนพระ</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((it) => {
              const isFlagged = it.trust_tier === "flagged";
              const isCamera = it.trust_tier === "tier_1";

              return (
                <div
                  key={it.id}
                  className="bg-[#1C1814] rounded-3xl border border-white/10 hover:border-[#E6B85C]/50 transition-all duration-200 p-4 flex flex-col justify-between space-y-4 shadow-lg group relative"
                >
                  {/* Top Thumbnail & Badges */}
                  <div className="space-y-3">
                    <div className="relative h-48 w-full rounded-2xl bg-[#12100E] border border-white/5 overflow-hidden flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={it.front_thumbnail}
                        alt={it.name}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                      />

                      {/* Trust Tier Badge */}
                      <div className="absolute top-2.5 left-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold shadow-md border ${
                            isFlagged
                              ? "bg-amber-500/90 text-amber-950 border-amber-300"
                              : isCamera
                              ? "bg-emerald-600/90 text-white border-emerald-400"
                              : "bg-sky-600/90 text-white border-sky-400"
                          }`}
                        >
                          {it.trust_label}
                        </span>
                      </div>

                      {/* Condition Badge */}
                      <div className="absolute top-2.5 right-2.5">
                        <span className="px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-emerald-400 text-[11px] font-bold border border-emerald-500/30">
                          {it.condition_pct}%
                        </span>
                      </div>
                    </div>

                    {/* Amulet Title & Details */}
                    <div>
                      <h4 className="font-signature text-xl font-bold text-[#F5EFE6] leading-snug line-clamp-1">
                        {it.name}
                      </h4>
                      <p className="text-xs text-[#8E8375] truncate mt-0.5">
                        {it.temple} • {it.year}
                      </p>
                    </div>

                    {/* Price and Condition */}
                    <div className="p-3 rounded-2xl bg-[#12100E] border border-white/5 flex items-center justify-between text-xs">
                      <div>
                        <span className="text-[10px] text-[#8E8375] block">
                          ราคาประเมิน
                        </span>
                        <span className="font-bold text-base text-[#E6B85C]">
                          ฿{formatTHB(it.estimated_price_thb)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[#8E8375] block">
                          ตำหนิที่ตรวจพบ
                        </span>
                        <span className="font-semibold text-[#C7BCAE]">
                          {it.defect_count} จุด
                        </span>
                      </div>
                    </div>

                    {/* Somdej Ambiguity Indicator if present */}
                    {it.ambiguity_warning && it.ambiguity_warning.is_ambiguous && (
                      <div className="px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span className="truncate">
                          ใกล้เคียง: {it.ambiguity_warning.secondary_candidate}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Footer Actions */}
                  <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2 text-xs">
                    <span className="text-[10px] text-[#6E6355]">
                      {it.saved_at_formatted}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedItem(it)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#E6B85C]/15 hover:bg-[#E6B85C]/25 text-[#E6B85C] text-xs font-semibold transition cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>ดูผล AI</span>
                      </button>

                      {confirmDeleteId === it.id ? (
                        <div className="flex items-center gap-1 animate-fade-in">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(it.id)}
                            className="px-2.5 py-1 rounded-full bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold cursor-pointer transition"
                          >
                            ยืนยันลบ
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-full bg-white/10 text-white text-[11px] cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(it.id)}
                          aria-label="ลบออกจากตู้"
                          className="p-1.5 rounded-full text-[#8E8375] hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Mini Report Modal (เมื่อกดดูผลสแกน) */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#1C1814] rounded-3xl border-2 border-[#E6B85C]/60 max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl text-[#F5EFE6]">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#E6B85C]/30 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      selectedItem.trust_tier === "flagged"
                        ? "bg-amber-500/20 text-amber-300 border-amber-400/40"
                        : selectedItem.trust_tier === "tier_1"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-400/40"
                        : "bg-sky-500/20 text-sky-300 border-sky-400/40"
                    }`}
                  >
                    {selectedItem.trust_label}
                  </span>
                  <span className="text-xs text-[#8E8375]">
                    บันทึกเมื่อ: {selectedItem.saved_at_formatted}
                  </span>
                </div>
                <h3 className="font-signature text-2xl sm:text-3xl font-bold text-[#F7E5B8]">
                  {selectedItem.name}
                </h3>
                <p className="text-xs text-[#9A8F80]">
                  {selectedItem.temple} • {selectedItem.year}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-[#C7BCAE] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Photos & Condition Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="h-52 rounded-2xl bg-[#12100E] border border-white/5 overflow-hidden flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selectedItem.front_thumbnail}
                  alt={selectedItem.name}
                  className="w-full h-full object-contain"
                />
              </div>

              <div className="p-4 rounded-2xl bg-[#12100E] border border-white/5 flex flex-col justify-between space-y-3 text-xs">
                <div>
                  <span className="text-[#8E8375] block text-[11px]">
                    ความสมบูรณ์องค์พระ
                  </span>
                  <span className="font-signature text-2xl font-bold text-emerald-400">
                    {selectedItem.condition_pct}%
                  </span>
                  <p className="text-[#B8AD9E] mt-0.5">
                    {selectedItem.condition_grade}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/5">
                  <span className="text-[#8E8375] block text-[11px]">
                    ราคาประเมินกลางตามสภาพ
                  </span>
                  <span className="font-signature text-2xl font-bold text-[#E6B85C]">
                    ฿ {formatTHB(selectedItem.estimated_price_thb)}
                  </span>
                </div>

                <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[#B8AD9E]">
                  <span>จุดตำหนิที่ตรวจพบ:</span>
                  <span className="font-bold text-[#F5EFE6]">
                    {selectedItem.defect_count} จุด
                  </span>
                </div>
              </div>
            </div>

            {/* Ambiguity Warning Card if applicable */}
            {selectedItem.ambiguity_warning &&
              selectedItem.ambiguity_warning.is_ambiguous && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                    <AlertTriangle className="w-4 h-4" />
                    <span>คำเตือนความกำกวมพิมพ์พระ (Somdej Ambiguity Gate)</span>
                  </div>
                  <p className="text-[#F5EFE6] leading-relaxed">
                    พิมพ์ทรงใกล้เคียงกับ:{" "}
                    <strong>{selectedItem.ambiguity_warning.secondary_candidate}</strong>
                  </p>
                  <p className="text-amber-200/90 text-[11px]">
                    {selectedItem.ambiguity_warning.price_range_note}
                  </p>
                  <p className="text-[#B8AD9E] text-[11px]">
                    💡 {selectedItem.ambiguity_warning.expert_advice}
                  </p>
                </div>
              )}

            {/* Typhoon AI Analysis */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[#E6B85C] text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>ผลวิเคราะห์โดย Typhoon AI</span>
              </div>
              <div className="p-4 rounded-2xl bg-[#12100E] border border-white/5 text-xs text-[#E8DFD1] leading-relaxed whitespace-pre-line">
                {selectedItem.analyze_response.ai_analysis}
              </div>
            </div>

            {/* Recommendation */}
            <div className="p-3 rounded-2xl bg-[#12100E] border border-white/5 text-xs space-y-1">
              <div className="flex items-center gap-1 text-[#E6B85C] font-semibold">
                <MapPin className="w-3.5 h-3.5" />
                <span>ตลาด / ภูมิภาคแนะนำ:</span>
              </div>
              <p className="text-[#F5EFE6] font-medium">
                {selectedItem.analyze_response.recommendation.region}
              </p>
              <p className="text-[#8E8375] text-[11px]">
                {selectedItem.analyze_response.recommendation.reason}
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => handleDeleteItem(selectedItem.id)}
                className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ลบออกจากตู้พระ</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-6 py-2.5 rounded-full bg-[#E6B85C] hover:bg-[#F0C975] text-[#18130D] text-xs font-bold transition cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
