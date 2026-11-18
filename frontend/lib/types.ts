export type UserMode = "b2c" | "b2b";

export type ScreenStep = "home" | "capture" | "processing" | "result" | "market" | "vault";

export type FocusIntent = "inspect" | "market" | "assistant";

export interface AmbiguityWarning {
  is_ambiguous: boolean;
  primary_candidate: string;
  secondary_candidate: string;
  price_range_note: string;
  expert_advice: string;
}

export interface ImageProvenance {
  trust_tier: "tier_1" | "tier_2" | "flagged";
  label: string;
  detected_software: string | null;
  warning: string | null;
  capture_source?: "camera" | "upload";
}

export interface DefectSpot {
  id: number;
  side: "front" | "back";
  xPct: number;
  yPct: number;
  radiusPx: number;
  label: string;
  confidence?: number;
  areaPct?: number;
  severity?: "high" | "medium" | string;
}

export interface DefectDetailRaw {
  side?: "front" | "back";
  type: string;
  severity?: "high" | "medium" | string;
  bbox?: number[];
  x_pct?: number;
  y_pct?: number;
  confidence?: number;
  area_pct?: number;
}

export interface AmuletInfo {
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

export interface AnalyzeResponse {
  success: boolean;
  is_recognized?: boolean;
  model_id: string;
  name?: string;
  user_mode: UserMode;
  amulet_info: AmuletInfo;
  confidence: {
    total: number;
    front: number;
    back: number | null;
    formula: string;
  };
  condition: {
    condition_pct: number;
    grade: string;
    defect_count: number;
    defects_summary: string[];
    defects_detail?: DefectDetailRaw[];
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
  clahe_back_image?: string | null;
  processing_time_ms?: number;
  defects?: any[];
  condition_pct?: number;
  estimated_price_thb?: number;
  system_specs?: {
    device: string;
    model_used: string;
    clahe_applied_on_back: boolean;
  };
  provenance?: ImageProvenance;
  ambiguity_warning?: AmbiguityWarning | null;
}

export interface VaultItem {
  id: string;
  saved_at: string;
  saved_at_formatted: string;
  name: string;
  temple: string;
  year: string;
  model_id: string;
  condition_pct: number;
  condition_grade: string;
  estimated_price_thb: number;
  defect_count: number;
  front_thumbnail: string; // Base64 downscaled (< 400px)
  back_thumbnail?: string | null;
  trust_tier: "tier_1" | "tier_2" | "flagged";
  trust_label: string;
  detected_software?: string | null;
  ambiguity_warning?: AmbiguityWarning | null;
  analyze_response: AnalyzeResponse;
}

export interface HealthResponse {
  status: string;
  model: string;
  device: string;
  typhoon_configured: boolean;
  amulets_count: number;
  supported_models: string[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LiveNewsItem {
  id: string;
  title: string;
  source: string;
  link: string;
  published: string;
  category?: string;
}

export interface RecentSaleItem {
  id: string;
  model_id: string;
  amulet_name: string;
  condition_pct: number;
  condition_grade: string;
  price_thb: number;
  price_formatted: string;
  province: string;
  channel: string;
  closed_at: string;
  verified_cer: boolean;
}

export interface RegionalModelPrice {
  model_id: string;
  name: string;
  national_avg_thb: number;
  regional_avg_thb: number;
  diff_pct: number;
  turnaround: string;
  note: string;
}

export interface RegionalPriceItem {
  region_id: string;
  region_name: string;
  provinces: string[];
  benchmark_diff_pct: number;
  liquidity_rating: string;
  liquidity_desc: string;
  market_hub: string;
  best_for: string;
  models: RegionalModelPrice[];
}

export interface MarketSummary {
  active_listings_today: number;
  total_volume_thb: number;
  total_volume_formatted: string;
  top_trending_model: string;
  fastest_liquidity_region: string;
}

export interface MarketResponse {
  success: boolean;
  last_updated: string;
  last_updated_human: string;
  cooldown_seconds_remaining?: number;
  status?: string;
  message?: string;
  market_summary: MarketSummary;
  ai_insight: {
    summary: string;
    trend: string;
    trend_label: string;
    recommendation: string;
  };
  live_news: LiveNewsItem[];
  recent_sales: RecentSaleItem[];
  regional_prices: RegionalPriceItem[];
}
