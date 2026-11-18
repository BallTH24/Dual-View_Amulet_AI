"use client";

import React, { useState, useEffect } from "react";
import {
  TrendingUp,
  RefreshCw,
  Newspaper,
  Sparkles,
  MapPin,
  Clock,
  CheckCircle2,
  ExternalLink,
  Camera,
  Coins,
  ArrowUpRight,
  ShieldCheck,
  Building2,
  ChevronRight,
  Filter,
} from "lucide-react";
import { MarketResponse, RegionalPriceItem } from "@/lib/types";
import { fetchMarketData, refreshMarketData } from "@/lib/api";

interface MarketBoardProps {
  apiBase: string;
  useMock: boolean;
  onGoBack: () => void;
  onInspectAmulet: () => void;
}

export default function MarketBoard({
  apiBase,
  useMock,
  onGoBack,
  onInspectAmulet,
}: MarketBoardProps) {
  const [marketData, setMarketData] = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [selectedRegionId, setSelectedRegionId] = useState<string>("all");
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  // Load market data on mount
  useEffect(() => {
    let mounted = true;
    fetchMarketData(apiBase, useMock)
      .then((data) => {
        if (mounted) {
          setMarketData(data);
          if (data.cooldown_seconds_remaining) {
            setCooldown(data.cooldown_seconds_remaining);
          }
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [apiBase, useMock]);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const handleRefresh = async () => {
    if (refreshing || cooldown > 0) return;
    setRefreshing(true);
    setRefreshNotice(null);

    try {
      const data = await refreshMarketData(apiBase, useMock);
      setMarketData(data);
      if (data.status === "cooldown") {
        setRefreshNotice(data.message || `กรุณารออีกสักครู่ก่อนกดอัปเดต`);
        setCooldown(data.cooldown_seconds_remaining || 60);
      } else {
        setRefreshNotice("อัปเดตข้อมูลตลาดและข่าวสารเรียบร้อยแล้ว");
        setCooldown(60);
        setTimeout(() => setRefreshNotice(null), 4000);
      }
    } catch (err) {
      console.error(err);
      setRefreshNotice("ไม่สามารถรีเฟรชข้อมูลได้ในขณะนี้");
    } finally {
      setRefreshing(false);
    }
  };

  const formatTHB = (val: number) =>
    new Intl.NumberFormat("th-TH").format(val);

  const filteredRegions: RegionalPriceItem[] =
    marketData?.regional_prices.filter((r) =>
      selectedRegionId === "all" ? true : r.region_id === selectedRegionId
    ) ?? [];

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* 1. Header Banner & Real-time Status */}
      <div className="bg-[#1C1814] rounded-3xl border border-[#E6B85C]/35 p-5 sm:p-7 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full bg-[#E6B85C]/10 blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E6B85C]/15 border border-[#E6B85C]/30 text-xs font-bold text-[#E6B85C]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Real-time Amulet Market Index</span>
            </div>
            <h2 className="font-signature text-3xl sm:text-4xl font-bold text-[#F7E5B8]">
              ตลาดพระเครื่อง &amp; ราคากลางเรียลไทม์
            </h2>
            <p className="text-xs sm:text-sm text-[#C7BCAE]">
              ดัชนีราคากลาง 7 รุ่นมาตรฐานแยกรายภูมิภาค/จังหวัด ข่าววงการพระสด
              และบทวิเคราะห์ผลกระทบโดย Typhoon AI
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={refreshing || cooldown > 0}
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 text-xs font-semibold text-[#F5EFE6] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#E6B85C] ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
              <span>
                {refreshing
                  ? "กำลังอัปเดต..."
                  : cooldown > 0
                  ? `รอ ${cooldown}s`
                  : "อัปเดตสด"}
              </span>
            </button>

            <button
              type="button"
              onClick={onInspectAmulet}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#E6B85C] hover:bg-[#F0C975] active:scale-[0.98] text-[#18130D] font-bold text-xs sm:text-sm shadow-md transition cursor-pointer touch-manipulation"
            >
              <Camera className="w-4 h-4" />
              <span>ตรวจพระของคุณ</span>
            </button>
          </div>
        </div>

        {refreshNotice && (
          <div className="mt-3 px-3.5 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold animate-fade-in">
            {refreshNotice}
          </div>
        )}

        {/* 4 Key Market Metrics */}
        {marketData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-5 mt-5 border-t border-white/5 text-xs">
            <div className="p-3 rounded-2xl bg-[#12100E]/70 border border-white/5 space-y-1">
              <span className="text-[#8E8375] block">ปิดการขายวันนี้</span>
              <span className="font-bold text-base text-[#F5EFE6]">
                {marketData.market_summary.active_listings_today} รายการ
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-[#12100E]/70 border border-white/5 space-y-1">
              <span className="text-[#8E8375] block">มูลค่าหมุนเวียนรวม</span>
              <span className="font-bold text-base text-[#E6B85C]">
                {marketData.market_summary.total_volume_formatted}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-[#12100E]/70 border border-white/5 space-y-1">
              <span className="text-[#8E8375] block">พระยอดนิยมสูงสุด</span>
              <span className="font-bold text-sm text-[#F7E5B8] truncate block">
                {marketData.market_summary.top_trending_model}
              </span>
            </div>
            <div className="p-3 rounded-2xl bg-[#12100E]/70 border border-white/5 space-y-1">
              <span className="text-[#8E8375] block">อัปเดตล่าสุด</span>
              <span className="font-semibold text-emerald-400 block">
                {marketData.last_updated_human}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Live News & Typhoon AI Market Insight Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Typhoon AI Market Insight Card */}
        <div className="lg:col-span-1 bg-gradient-to-br from-[#241B12] via-[#1C1814] to-[#16120E] rounded-3xl border border-[#E6B85C]/40 p-5 sm:p-6 shadow-xl flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-[#E6B85C] font-bold text-xs uppercase tracking-wide">
                <Sparkles className="w-4 h-4" />
                <span>Typhoon AI Insight</span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold">
                {marketData?.ai_insight.trend_label || "วิเคราะห์สด"}
              </span>
            </div>

            <h3 className="font-signature text-2xl font-bold text-[#F7E5B8]">
              แนวโน้มและผลกระทบราคา
            </h3>

            <p className="text-xs sm:text-sm text-[#E8DFD1] leading-relaxed">
              {marketData?.ai_insight.summary ||
                "กำลังดึงข้อมูลวิเคราะห์แนวโน้มตลาดพระเครื่องจาก Typhoon AI..."}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#12100E]/80 border border-[#E6B85C]/20 text-xs space-y-1">
            <span className="font-bold text-[#E6B85C] block">
              💡 คำแนะนำจากระบบ:
            </span>
            <p className="text-[#C7BCAE] leading-relaxed">
              {marketData?.ai_insight.recommendation ||
                "ตรวจสอบสภาพความสมบูรณ์องค์พระก่อนทำนิติกรรมปล่อยเช่า"}
            </p>
          </div>
        </div>

        {/* Live News Feed (Google News RSS) */}
        <div className="lg:col-span-2 bg-[#1C1814] rounded-3xl border border-white/10 p-5 sm:p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Newspaper className="w-4 h-4 text-[#E6B85C]" />
              <h3 className="font-signature text-2xl font-bold text-[#F7E5B8]">
                ข่าวสารวงการพระเครื่องเรียลไทม์
              </h3>
            </div>
            <span className="text-[11px] text-[#8E8375]">
              Google News RSS (ภาษาไทย)
            </span>
          </div>

          <div className="space-y-2.5">
            {marketData?.live_news.map((item) => (
              <a
                key={item.id}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start justify-between gap-3 p-3 rounded-2xl bg-[#12100E] border border-white/5 hover:border-[#E6B85C]/40 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px] font-semibold text-[#E6B85C]">
                      {item.category || "ข่าวสาร"}
                    </span>
                    <span className="text-[11px] text-[#8E8375]">
                      {item.source} • {item.published}
                    </span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-semibold text-[#F5EFE6] group-hover:text-[#F7E5B8] transition leading-snug">
                    {item.title}
                  </h4>
                </div>
                <ExternalLink className="w-4 h-4 text-[#8E8375] group-hover:text-[#E6B85C] shrink-0 mt-1 transition" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Regional & Provincial Price Index Table */}
      <section className="bg-[#1C1814] rounded-3xl border border-white/10 p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#E6B85C]" />
              <h3 className="font-signature text-2xl sm:text-3xl font-bold text-[#F7E5B8]">
                ดัชนีราคากลางแยกตามภูมิภาค &amp; จังหวัด
              </h3>
            </div>
            <p className="text-xs text-[#B8AD9E]">
              เปรียบเทียบส่วนต่างราคาปิดเช่าจริงกับราคากลางประเทศ
              พร้อมเวลาเปลี่ยนมือ (Liquidity)
            </p>
          </div>

          {/* Region Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "ทุกภาค" },
              { id: "bkk", label: "กรุงเทพฯ" },
              { id: "central", label: "ภาคกลาง" },
              { id: "north", label: "ภาคเหนือ" },
              { id: "isan", label: "ภาคอีสาน" },
              { id: "south", label: "ภาคใต้" },
            ].map((rf) => (
              <button
                key={rf.id}
                type="button"
                onClick={() => setSelectedRegionId(rf.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer touch-manipulation ${
                  selectedRegionId === rf.id
                    ? "bg-[#E6B85C] text-[#18130D] font-bold"
                    : "bg-[#12100E] text-[#B8AD9E] hover:text-[#F5EFE6] border border-white/10"
                }`}
              >
                {rf.label}
              </button>
            ))}
          </div>
        </div>

        {/* Region Cards with Model Pricing Table */}
        <div className="space-y-4">
          {filteredRegions.map((region) => (
            <div
              key={region.region_id}
              className="bg-[#12100E] rounded-2xl border border-white/10 p-4 sm:p-5 space-y-4"
            >
              {/* Region Overview Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-signature text-xl sm:text-2xl font-bold text-[#F5EFE6]">
                      {region.region_name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        region.benchmark_diff_pct >= 0
                          ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                      }`}
                    >
                      {region.benchmark_diff_pct >= 0 ? "+" : ""}
                      {region.benchmark_diff_pct}% เทียบราคากลาง
                    </span>
                  </div>
                  <p className="text-xs text-[#8E8375]">
                    จังหวัดหลัก: {region.provinces.join(" • ")}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="text-right">
                    <span className="text-[#8E8375] block text-[11px]">
                      สภาพคล่อง
                    </span>
                    <span className="font-bold text-[#E6B85C]">
                      {region.liquidity_rating}
                    </span>
                  </div>
                  <div className="hidden md:block h-6 w-[1px] bg-white/10" />
                  <div className="text-right hidden md:block">
                    <span className="text-[#8E8375] block text-[11px]">
                      ศูนย์กลางปล่อยเช่า
                    </span>
                    <span className="text-[#C7BCAE] max-w-[200px] truncate block">
                      {region.market_hub}
                    </span>
                  </div>
                </div>
              </div>

              {/* Models Comparison Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-[#8E8375]">
                      <th className="pb-2.5 font-semibold">รุ่นพระเครื่อง</th>
                      <th className="pb-2.5 font-semibold text-right">
                        ราคากลางประเทศ
                      </th>
                      <th className="pb-2.5 font-semibold text-right">
                        ราคาท้องถิ่น
                      </th>
                      <th className="pb-2.5 font-semibold text-right">
                        ส่วนต่าง
                      </th>
                      <th className="pb-2.5 font-semibold text-center">
                        เปลี่ยนมือ
                      </th>
                      <th className="pb-2.5 font-semibold">ข้อแนะนำพื้นที่</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {region.models.map((m) => (
                      <tr key={m.model_id} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 font-medium text-[#F5EFE6]">
                          {m.name}
                        </td>
                        <td className="py-2.5 text-right text-[#A6998A]">
                          ฿{formatTHB(m.national_avg_thb)}
                        </td>
                        <td className="py-2.5 text-right font-bold text-[#E6B85C]">
                          ฿{formatTHB(m.regional_avg_thb)}
                        </td>
                        <td className="py-2.5 text-right font-semibold">
                          <span
                            className={
                              m.diff_pct >= 0
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }
                          >
                            {m.diff_pct >= 0 ? "+" : ""}
                            {m.diff_pct}%
                          </span>
                        </td>
                        <td className="py-2.5 text-center text-[#B8AD9E]">
                          <span className="px-2 py-0.5 rounded-full bg-white/5 text-[10px]">
                            {m.turnaround}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-[#8E8375]">
                          {m.note}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Recent Sold Feed Section */}
      <section className="bg-[#1C1814] rounded-3xl border border-white/10 p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-[#E6B85C]" />
            <h3 className="font-signature text-2xl sm:text-3xl font-bold text-[#F7E5B8]">
              รายการปิดการขายล่าสุด (Recent Transactions)
            </h3>
          </div>
          <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            ยอดปิดสด
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {marketData?.recent_sales.map((sale) => (
            <div
              key={sale.id}
              className="p-4 rounded-2xl bg-[#12100E] border border-white/5 hover:border-[#E6B85C]/40 transition space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-signature text-xl font-bold text-[#F5EFE6]">
                    {sale.amulet_name}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-[#8E8375]">
                    <span>{sale.province}</span>
                    <span>•</span>
                    <span className="text-[#C7BCAE]">{sale.channel}</span>
                  </div>
                </div>

                {sale.verified_cer && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold shrink-0">
                    <ShieldCheck className="w-3 h-3" />
                    <span>มีบัตร Cer</span>
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs">
                <div>
                  <span className="text-[#8E8375] block text-[10px]">
                    สภาพสมบูรณ์
                  </span>
                  <span className="font-semibold text-[#E8DFD1]">
                    {sale.condition_pct}% ({sale.condition_grade})
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-[#8E8375] block text-[10px]">
                    ราคาปิดประมูล
                  </span>
                  <span className="font-bold text-base text-[#E6B85C]">
                    ฿{sale.price_formatted}
                  </span>
                </div>
              </div>

              <div className="text-right text-[10px] text-[#6E6355]">
                {sale.closed_at}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA to Return or Inspect */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-[#241B12] via-[#1C1814] to-[#241B12] border border-[#E6B85C]/30 text-center space-y-3">
        <h3 className="font-signature text-2xl font-bold text-[#F7E5B8]">
          มีพระเครื่องใน 7 รุ่นนี้อยู่ในการครอบครอง?
        </h3>
        <p className="text-xs sm:text-sm text-[#C7BCAE] max-w-lg mx-auto">
          ถ่ายภาพองค์พระด้านหน้าและด้านหลัง ระบบจะสแกนจับตำหนิ วัดเปอร์เซ็นต์สภาพ
          และคำนวณราคากลางอ้างอิงทันที
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onInspectAmulet}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#E6B85C] hover:bg-[#F0C975] active:scale-[0.98] text-[#18130D] font-bold text-xs sm:text-sm shadow-md transition cursor-pointer touch-manipulation"
          >
            <Camera className="w-4 h-4" />
            <span>ถ่ายรูปตรวจพระเลย</span>
          </button>
          <button
            type="button"
            onClick={onGoBack}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 active:scale-[0.98] text-[#E8DFD1] text-xs sm:text-sm font-semibold transition cursor-pointer touch-manipulation"
          >
            <span>กลับสู่หน้าแรก</span>
          </button>
        </div>
      </div>
    </div>
  );
}
