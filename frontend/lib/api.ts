import {
  AnalyzeResponse,
  DefectSpot,
  HealthResponse,
  UserMode,
} from "./types";

export function getDefaultApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined" && window.location.hostname) {
    return `http://${window.location.hostname}:8000`;
  }
  return "http://localhost:8000";
}

export const DEFAULT_API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface DemoAmuletPreset {
  id: string;
  shortLabel: string;
  data: AnalyzeResponse;
}

const DISCLAIMER_TEXT =
  "การประเมินเบื้องต้นโดยระบบปัญญาประดิษฐ์ (Dual-View Amulet AI) เพื่อเป็นข้อมูลประกอบการตัดสินใจเบื้องต้นเท่านั้น มิใช่ใบรับรองพระแท้ทางกฎหมาย";

export const DEMO_AMULETS: DemoAmuletPreset[] = [
  {
    id: "somdej_watrakang",
    shortLabel: "พระสมเด็จวัดระฆัง",
    data: {
      success: true,
      model_id: "somdej_watrakang",
      user_mode: "b2b",
      amulet_info: {
        name: "พระสมเด็จวัดระฆังโฆสิตาราม พิมพ์ใหญ่",
        temple: "วัดระฆังโฆสิตารามวรมหาวิหาร กรุงเทพมหานคร",
        year: "พ.ศ. 2409–2415 (ยุคสมเด็จพระพุฒาจารย์ โต พรหมรังสี)",
        front_keypoint:
          "เส้นซุ้มครอบแก้วหวายผ่าซีกโค้งสมส่วน ปลายพระเกศเรียวสะบัดจรดซุ้ม ฐานสิงห์คมขวานชัดเจน เนื้อผงพุทธคุณผสมปูนเปลือกหอย",
        back_keypoint:
          "หลังกาบหมาก หลังกระดาน มีรอยปูไต่ รอยหนอนด้น รอยปริแยกตามขอบข้าง เนื้อผงแห้งแกร่งนุ่มตาตามอายุความเก่ากว่า 150 ปี",
        base_price_thb: 15000000,
        recommended_region:
          "กรุงเทพมหานครและปริมณฑล (ตลาดพระเครื่องท่าพระจันทร์ / พันธุ์ทิพย์งามวงศ์วาน)",
        region_reason:
          "ศูนย์กลางสมาคมและสถาบันออกใบรับรองพระแท้ระดับสากล มีกำลังซื้อสูงสุด",
        ref_front_img:
          "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80",
        ref_back_img:
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
      },
      confidence: {
        total: 94.8,
        front: 93.5,
        back: 95.8,
        formula: "0.45 * front_conf + 0.55 * back_conf",
      },
      condition: {
        condition_pct: 88.5,
        grade: "สภาพสวยสมบูรณ์ (Excellent - ผิวเดิม)",
        defect_count: 2,
        defects_summary: ["รอยปริขอบข้างธรรมชาติ", "รอยหนอนด้นด้านหลัง"],
        defects_detail: [
          {
            side: "front",
            type: "รอยปริขอบซุ้มด้านบนซ้าย",
            x_pct: 35,
            y_pct: 22,
            confidence: 88.5,
            area_pct: 1.5,
          },
          {
            side: "back",
            type: "รอยหนอนด้นตามอายุความเก่า",
            x_pct: 62,
            y_pct: 54,
            confidence: 90.2,
            area_pct: 1.8,
          },
        ],
      },
      pricing: {
        base_price_thb: 15000000,
        estimated_price_thb: 13275000,
        discount_pct: 11.5,
      },
      recommendation: {
        region: "กรุงเทพมหานครและปริมณฑล (ท่าพระจันทร์ / พันธุ์ทิพย์งามวงศ์วาน)",
        reason:
          "ศูนย์กลางสมาคมผู้นิยมพระเครื่องพระบูชาไทย มีนักสะสมระดับมหาเศรษฐีพร้อมเช่าบูชา",
      },
      ai_analysis:
        "เส้นซุ้มครอบแก้วและรอยปริแยกด้านหลังสอดคล้องพิมพ์มาตรฐานวัดระฆัง สภาพความสมบูรณ์ 88.5% แนะนำกรอบรับจำนำปลอดภัย (LTV 60–70%): 7,965,000 – 9,292,500 บาท",
      disclaimer: DISCLAIMER_TEXT,
      processing_time_ms: 380,
      system_specs: {
        device: "mps",
        model_used: "best.pt",
        clahe_applied_on_back: true,
      },
    },
  },
  {
    id: "somdej_bangkhunprom",
    shortLabel: "พระสมเด็จบางขุนพรหม",
    data: {
      success: true,
      model_id: "somdej_bangkhunprom",
      user_mode: "b2b",
      amulet_info: {
        name: "พระสมเด็จบางขุนพรหม พิมพ์ใหญ่ กรุวัดใหม่อมตรส",
        temple: "วัดใหม่อมตรส (บางขุนพรหม) กรุงเทพมหานคร",
        year: "พ.ศ. 2411–2413 (เปิดกรุเป็นทางการ พ.ศ. 2500)",
        front_keypoint:
          "พิมพ์ทรงลึกคมชัด ซุ้มครอบแก้วโปร่ง มีคราบกรุฟองเต้าหู้ คราบขี้กรุดินขี้เป็ดเกาะแน่นเป็นชั้นธรรมชาติ เนื้อผงขาวแกร่งแน่น",
        back_keypoint:
          "หลังเรียบ มีคราบกรุบางๆ หรือคราบกรุหนาสีน้ำตาลเข้มอมเหลือง รอยเหนอะและรอยปริแยกบริเวณขอบข้าง",
        base_price_thb: 8500000,
        recommended_region:
          "กรุงเทพมหานคร (ศูนย์พระเครื่องท่าพระจันทร์, พันธุ์ทิพย์งามวงศ์วาน)",
        region_reason:
          "พระสมเด็จยอดนิยมอันดับสองรองจากวัดระฆัง ปลุกเสกโดยสมเด็จโต สภาพกรุเก่า-กรุใหม่มีผู้ต้องการสะสมหมุนเวียนสูง",
        ref_front_img:
          "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80",
        ref_back_img:
          "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80",
      },
      confidence: {
        total: 93.6,
        front: 92.4,
        back: 94.6,
        formula: "0.45 * front_conf + 0.55 * back_conf",
      },
      condition: {
        condition_pct: 86.0,
        grade: "สภาพสวยสมบูรณ์ (Excellent - ผิวเดิม)",
        defect_count: 2,
        defects_summary: ["คราบกรุกะเทาะขอบล่าง", "รอยรานผิวเดิม"],
        defects_detail: [
          {
            side: "front",
            type: "คราบกรุเปิดบริเวณฐานชั้นล่าง",
            x_pct: 50,
            y_pct: 78,
            confidence: 87.0,
            area_pct: 2.0,
          },
        ],
      },
      pricing: {
        base_price_thb: 8500000,
        estimated_price_thb: 7310000,
        discount_pct: 14.0,
      },
      recommendation: {
        region: "กรุงเทพมหานคร (ท่าพระจันทร์, พันธุ์ทิพย์งามวงศ์วาน)",
        reason:
          "ตลาดกลางพระเครื่องมาตรฐานสากล มีกำลังซื้อรองรับพระสมเด็จสายตรง",
      },
      ai_analysis:
        "คราบกรุฟองเต้าหู้และเนื้อผงแกร่งจัดสอดคล้องกับกรุวัดใหม่อมตรส ความสมบูรณ์ 86.0%",
      disclaimer: DISCLAIMER_TEXT,
      processing_time_ms: 410,
      system_specs: {
        device: "mps",
        model_used: "best.pt",
        clahe_applied_on_back: true,
      },
    },
  },
  {
    id: "somdej_ketchaiyo",
    shortLabel: "พระสมเด็จเกศไชโย",
    data: {
      success: true,
      model_id: "somdej_ketchaiyo",
      user_mode: "b2b",
      amulet_info: {
        name: "พระสมเด็จเกศไชโย พิมพ์ 7 ชั้น นิยม",
        temple: "วัดไชโยวรวิหาร (วัดเกศไชโย) จ.อ่างทอง",
        year: "พ.ศ. 2404–2409 (สมเด็จพระพุฒาจารย์ โต สร้างอุทิศโยมมารดา)",
        front_keypoint:
          "อกร่อง หูบายศรี ฐาน 7 ชั้นคมขวาน กรอบกระจกยกขอบสันนูนชัดเจน เนื้อผงขาวละเอียดอมเหลือง",
        back_keypoint:
          "หลังเรียบ มีรอยครูดกาบหมากหรือรอยปาดเรียบด้วยไม้ไผ่ ขอบข้างมีรอยตัดตอกตั้งฉาก",
        base_price_thb: 4500000,
        recommended_region:
          "ภาคกลาง (อ่างทอง, สิงห์บุรี, พระนครศรีอยุธยา) และ กรุงเทพฯ",
        region_reason:
          "พระสมเด็จ 1 ใน 3 ตระกูลสมเด็จโต เอกลักษณ์กรอบกระจกและฐาน 7 ชั้น สายตรงภาคกลางนิยมสูง",
        ref_front_img:
          "https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=800&q=80",
        ref_back_img:
          "https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?auto=format&fit=crop&w=800&q=80",
      },
      confidence: {
        total: 94.2,
        front: 93.0,
        back: 95.2,
        formula: "0.45 * front_conf + 0.55 * back_conf",
      },
      condition: {
        condition_pct: 90.0,
        grade: "สภาพสวยสมบูรณ์ (Excellent - ผิวเดิม)",
        defect_count: 1,
        defects_summary: ["รอยสัมผัสขอบกระจก"],
        defects_detail: [
          {
            side: "front",
            type: "รอยสัมผัสเล็กน้อยขอบกระจกด้านขวา",
            x_pct: 72,
            y_pct: 45,
            confidence: 86.4,
            area_pct: 1.1,
          },
        ],
      },
      pricing: {
        base_price_thb: 4500000,
        estimated_price_thb: 4050000,
        discount_pct: 10.0,
      },
      recommendation: {
        region: "ภาคกลาง (อ่างทอง, สิงห์บุรี, อยุธยา) และ กรุงเทพฯ",
        reason:
          "ศูนย์รวมผู้ศรัทธาสายสมเด็จเกศไชโย มีการเปลี่ยนมือคล่องตัว",
      },
      ai_analysis:
        "พิมพ์ 7 ชั้น อกร่องหูบายศรีคมชัด กรอบกระจกยกสันสมบูรณ์ ผิวเดิม 90.0%",
      disclaimer: DISCLAIMER_TEXT,
      processing_time_ms: 395,
      system_specs: {
        device: "mps",
        model_used: "best.pt",
        clahe_applied_on_back: true,
      },
    },
  },
  {
    id: "phra_nangphaya",
    shortLabel: "พระนางพญา พิษณุโลก",
    data: {
      success: true,
      model_id: "phra_nangphaya",
      user_mode: "b2b",
      amulet_info: {
        name: "พระนางพญา พิมพ์เข่าโค้ง กรุวัดนางพญา",
        temple: "วัดนางพญา จ.พิษณุโลก",
        year: "พ.ศ. 2095–2110 (ยุคสมเด็จพระวิสุทธิกษัตรีย์)",
        front_keypoint:
          "ทรงสามเหลี่ยมหน้าจั่ว พระพาหาโค้งมนอ่อนช้อยจรดหัวเข่า พระกรรณบายศรี ลำพระองค์ผึ่งผายสง่างาม",
        back_keypoint:
          "หลังเรียบ มีรอยลายนิ้วมือจางๆ เม็ดแร่กรวดทรายโผล่พ้นผิว รอยตัดข้างทรงสามเหลี่ยมลาดเอียงธรรมชาติ",
        base_price_thb: 6000000,
        recommended_region:
          "ภาคเหนือตอนล่างและภาคกลาง (พิษณุโลก, นครสวรรค์) และ กรุงเทพฯ",
        region_reason:
          "ราชินีแห่งพระเครื่องหนึ่งในชุดเบญจภาคี มหาเสน่ห์ เมตตามหานิยม แคล้วคลาดปลอดภัย",
        ref_front_img:
          "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80",
        ref_back_img:
          "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?auto=format&fit=crop&w=800&q=80",
      },
      confidence: {
        total: 95.1,
        front: 94.0,
        back: 96.0,
        formula: "0.45 * front_conf + 0.55 * back_conf",
      },
      condition: {
        condition_pct: 87.5,
        grade: "สภาพสวยสมบูรณ์ (Excellent - ผิวเดิม)",
        defect_count: 2,
        defects_summary: ["รอยกรวดหลุดผิวด้านหลัง", "รอยสัมผัสยอดเกศ"],
        defects_detail: [
          {
            side: "front",
            type: "รอยสัมผัสยอดพระเกศ",
            x_pct: 50,
            y_pct: 18,
            confidence: 89.0,
            area_pct: 1.2,
          },
        ],
      },
      pricing: {
        base_price_thb: 6000000,
        estimated_price_thb: 5250000,
        discount_pct: 12.5,
      },
      recommendation: {
        region: "ภาคเหนือตอนล่าง (พิษณุโลก) และ กรุงเทพฯ",
        reason: "ถิ่นกำเนิดราชินีพระเครื่องเบญจภาคี มีตลาดผู้ศรัทธาระดับบน",
      },
      ai_analysis:
        "พิมพ์เข่าโค้งอ่อนช้อย เส้นสายคมชัด มวลสารแร่ทรายเงินทรายทองครบถ้วน ความสมบูรณ์ 87.5%",
      disclaimer: DISCLAIMER_TEXT,
      processing_time_ms: 405,
      system_specs: {
        device: "mps",
        model_used: "best.pt",
        clahe_applied_on_back: true,
      },
    },
  },
  {
    id: "phra_phong_suphan",
    shortLabel: "พระผงสุพรรณ หน้าแก่",
    data: {
      success: true,
      model_id: "phra_phong_suphan",
      user_mode: "b2b",
      amulet_info: {
        name: "พระผงสุพรรณ ยอดโถ พิมพ์หน้าแก่ กรุวัดพระศรีรัตนมหาธาตุ",
        temple: "วัดพระศรีรัตนมหาธาตุ จ.สุพรรณบุรี",
        year: "พ.ศ. 1900–2000 (ศิลปะอู่ทอง ยุคอยุธยาตอนต้น)",
        front_keypoint:
          "พระพักตร์เหลี่ยมดุจหน้าคนแก่ ไรพระศกหยักเสมอกัน ร่องพระนาสิกกว้าง รอยเหี่ยวย่นใต้คาง",
        back_keypoint:
          "รอยลายนิ้วมือแบบก้นหอยโบราณของผู้กดพิมพ์ มวลสารดินกรวดทรายแร่ละเอียด รอยตัดขอบข้างด้วยตอก",
        base_price_thb: 4500000,
        recommended_region:
          "ภาคกลาง (สุพรรณบุรี, พระนครศรีอยุธยา) และ กรุงเทพมหานคร",
        region_reason:
          "หนึ่งในชุดเบญจภาคีเนื้อดินยอดนิยมอันดับ 1 ของภาคกลาง เซียนสายอนุรักษ์พระกรุพร้อมสู้ราคา",
        ref_front_img:
          "https://images.unsplash.com/photo-1582560475093-ba66accbc424?auto=format&fit=crop&w=800&q=80",
        ref_back_img:
          "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80",
      },
      confidence: {
        total: 94.6,
        front: 93.8,
        back: 95.2,
        formula: "0.45 * front_conf + 0.55 * back_conf",
      },
      condition: {
        condition_pct: 89.0,
        grade: "สภาพสวยสมบูรณ์ (Excellent - ผิวเดิม)",
        defect_count: 1,
        defects_summary: ["รอยสึกขอบล่างตามอายุ"],
        defects_detail: [
          {
            side: "front",
            type: "รอยสึกบริเวณขอบฐานล่าง",
            x_pct: 48,
            y_pct: 82,
            confidence: 87.8,
            area_pct: 1.4,
          },
        ],
      },
      pricing: {
        base_price_thb: 4500000,
        estimated_price_thb: 4005000,
        discount_pct: 11.0,
      },
      recommendation: {
        region: "ภาคกลาง (สุพรรณบุรี, อยุธยา) และ กรุงเทพมหานคร",
        reason: "ตลาดพระกรุสุพรรณบุรีและสมาคมส่วนกลางให้มูลค่าสูงเป็นพิเศษ",
      },
      ai_analysis:
        "พระพักตร์หน้าแก่และรอยลายนิ้วมือก้นหอยด้านหลังเด่นชัด ความสมบูรณ์ 89.0%",
      disclaimer: DISCLAIMER_TEXT,
      processing_time_ms: 390,
      system_specs: {
        device: "mps",
        model_used: "best.pt",
        clahe_applied_on_back: true,
      },
    },
  },
  {
    id: "phra_rod",
    shortLabel: "พระรอด มหาวัน ลำพูน",
    data: {
      success: true,
      model_id: "phra_rod",
      user_mode: "b2b",
      amulet_info: {
        name: "พระรอด พิมพ์ใหญ่ กรุวัดมหาวัน ลำพูน",
        temple: "วัดมหาวัน จ.ลำพูน",
        year: "พ.ศ. 1200–1300 (สมัยพระนางจามเทวี ยุคหริภุญชัย)",
        front_keypoint:
          "ประทับนั่งบนฐานบัวสองชั้น พระกรรณขวายาวจดพระอังสา ปีกกว้าง โพธิ์แฉกคมกริบ ติ่งเนื้อใต้ฝ่าพระหัตถ์",
        back_keypoint:
          "หลังอูมมน มีรอยลายนิ้วมือโบราณกดอัดแน่น ปลายก้นพับและมีรอยตัดตอกดินแกร่งแห้งสนิทตามอายุพันกว่าปี",
        base_price_thb: 7500000,
        recommended_region:
          "ภาคเหนือ (ลำพูน, เชียงใหม่) และ สมาคมผู้นิยมพระเครื่องพระบูชาไทย กรุงเทพฯ",
        region_reason:
          "พระกรุเก่าแก่อายุกว่า 1,200 ปี พุทธคุณนิรันตรายแคล้วคลาดเป็นเอกอุ หายากที่สุดในเบญจภาคี",
        ref_front_img:
          "https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?auto=format&fit=crop&w=800&q=80",
        ref_back_img:
          "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
      },
      confidence: {
        total: 96.0,
        front: 95.2,
        back: 96.6,
        formula: "0.45 * front_conf + 0.55 * back_conf",
      },
      condition: {
        condition_pct: 92.0,
        grade: "สภาพแชมป์ (Mint Condition - องค์ครู)",
        defect_count: 1,
        defects_summary: ["รอยปริก้นพับธรรมชาติ"],
        defects_detail: [
          {
            side: "back",
            type: "รอยปริรอยพับก้นโบราณ",
            x_pct: 50,
            y_pct: 88,
            confidence: 91.0,
            area_pct: 1.0,
          },
        ],
      },
      pricing: {
        base_price_thb: 7500000,
        estimated_price_thb: 6900000,
        discount_pct: 8.0,
      },
      recommendation: {
        region: "ภาคเหนือ (ลำพูน, เชียงใหม่) และ กรุงเทพมหานคร",
        reason: "รังพระใหญ่สายเหนือและสมาคมผู้นิยมพระเครื่องพร้อมรับเช่าบูชาไม่อั้น",
      },
      ai_analysis:
        "โพธิ์แฉกคมชัด ก้นพับถูกต้องตามตำราพระรอดมหาวัน ความสมบูรณ์ 92.0%",
      disclaimer: DISCLAIMER_TEXT,
      processing_time_ms: 420,
      system_specs: {
        device: "mps",
        model_used: "best.pt",
        clahe_applied_on_back: true,
      },
    },
  },
  {
    id: "phra_sumkor",
    shortLabel: "พระซุ้มกอ กำแพงเพชร",
    data: {
      success: true,
      model_id: "phra_sumkor",
      user_mode: "b2b",
      amulet_info: {
        name: "พระซุ้มกอ พิมพ์ใหญ่มีกนก กรุทุ่งเศรษฐี",
        temple: "วัดพระบรมธาตุเจดียาราม (กรุทุ่งเศรษฐี) จ.กำแพงเพชร",
        year: "พ.ศ. 1900 (ยุคสุโขทัย สมัยพญาลิไท)",
        front_keypoint:
          "ซุ้มกนกลวดลายพริ้วไหวรอบองค์พระ พระพักตร์กลมรูปไข่ พระเกศบัวตูม ปางสมาธิ ประทับบนบัวเล็บช้าง ว่านดอกมะขามกระจาย",
        back_keypoint:
          "หลังอูมนูน ผิวดินแห้งเนียน มีคราบรารักดำเกาะติดแน่น รอยตัดขอบข้างโค้งมน จารึก 'มีกูไว้ไม่จน'",
        base_price_thb: 9500000,
        recommended_region:
          "ภาคเหนือตอนล่างและภาคกลาง (กำแพงเพชร, นครสวรรค์) และ กรุงเทพมหานคร",
        region_reason:
          "ยอดพระเครื่องเบญจภาคีเนื้อดินอมตะ 'มณีนพรัตน์เมืองชากังราว' เสริมโชคลาภมหาเศรษฐี เซียนใหญ่ต้องการสูง",
        ref_front_img:
          "https://images.unsplash.com/photo-1549887534-1541e9326642?auto=format&fit=crop&w=800&q=80",
        ref_back_img:
          "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=800&q=80",
      },
      confidence: {
        total: 95.5,
        front: 94.8,
        back: 96.0,
        formula: "0.45 * front_conf + 0.55 * back_conf",
      },
      condition: {
        condition_pct: 91.0,
        grade: "สภาพสวยสมบูรณ์ (Excellent - ผิวเดิม)",
        defect_count: 1,
        defects_summary: ["รอยรานผิวเดิมด้านหน้า"],
        defects_detail: [
          {
            side: "front",
            type: "รอยรานผิวว่านเล็กน้อย",
            x_pct: 54,
            y_pct: 64,
            confidence: 88.2,
            area_pct: 1.2,
          },
        ],
      },
      pricing: {
        base_price_thb: 9500000,
        estimated_price_thb: 8645000,
        discount_pct: 9.0,
      },
      recommendation: {
        region: "ภาคเหนือตอนล่าง (กำแพงเพชร, นครสวรรค์) และ กรุงเทพฯ",
        reason: "มหาเศรษฐีและนักธุรกิจนิยมเช่าบูชาเพื่อความร่ำรวยและเป็นมงคลชีวิต",
      },
      ai_analysis:
        "ลวดลายกนกคมชัด คราบรารักดำและจุดว่านดอกมะขามครบถ้วน ความสมบูรณ์ 91.0%",
      disclaimer: DISCLAIMER_TEXT,
      processing_time_ms: 415,
      system_specs: {
        device: "mps",
        model_used: "best.pt",
        clahe_applied_on_back: true,
      },
    },
  },
];

export function extractDefectSpots(res: AnalyzeResponse): DefectSpot[] {
  const details = res.condition.defects_detail;
  if (details && details.length > 0) {
    return details.map((d, idx) => ({
      id: idx + 1,
      side: d.side || (idx % 2 === 0 ? "front" : "back"),
      xPct: d.x_pct ?? 35 + ((idx * 17) % 35),
      yPct: d.y_pct ?? 35 + ((idx * 23) % 35),
      radiusPx: d.severity === "high" ? 26 : 20,
      label: d.type,
      confidence: d.confidence,
      areaPct: d.area_pct,
      severity: d.severity,
    }));
  }
  const count = Math.min(res.condition.defect_count, 4);
  const fallback: DefectSpot[] = [];
  for (let i = 0; i < count; i++) {
    fallback.push({
      id: i + 1,
      side: i % 2 === 0 ? "front" : "back",
      xPct: 36 + i * 14,
      yPct: 38 + (i % 2) * 24,
      radiusPx: 24,
      label: res.condition.defects_summary[i] || `จุดสังเกตตำหนิที่ ${i + 1}`,
    });
  }
  return fallback;
}

export async function checkBackendHealth(
  apiBase: string
): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/health`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function analyzeAmulet(params: {
  apiBase: string;
  useMock: boolean;
  frontFile: File;
  backFile?: File | null;
  userMode: UserMode;
  mockPresetId?: string;
}): Promise<AnalyzeResponse> {
  if (params.useMock) {
    await new Promise((r) => setTimeout(r, 1400));
    const preset =
      DEMO_AMULETS.find((a) => a.id === params.mockPresetId) || DEMO_AMULETS[0];
    return preset.data;
  }

  const formData = new FormData();
  formData.append("front_image", params.frontFile);
  if (params.backFile) {
    formData.append("back_image", params.backFile);
  }
  formData.append("user_mode", params.userMode);

  const res = await fetch(`${params.apiBase.replace(/\/$/, "")}/api/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Backend error (${res.status}): ${errText}`);
  }

  return res.json();
}

export async function chatWithTyphoon(params: {
  apiBase: string;
  useMock: boolean;
  amuletName: string;
  contextInfo: string;
  question: string;
}): Promise<string> {
  if (params.useMock) {
    await new Promise((r) => setTimeout(r, 550));
    if (params.question.includes("แคปชัน") || params.question.includes("ขาย")) {
      return `✨ เปิดให้เช่าบูชา: ${params.amuletName}\n📌 สภาพสวยเดิม พิจารณาเบื้องต้นแล้วน่าสะสม\n💰 ราคาประเมินตามสภาพ นัดรับได้หรือส่งพร้อมประกัน\n#พระเครื่อง #เช่าพระ #ส่องพระAI`;
    }
    return `จากผลวิเคราะห์เบื้องต้นของ ${params.amuletName}: สามารถกดแตะวงกลมบนภาพเพื่อดูจุดตำหนิแต่ละจุด และเปิดโหมด CLAHE เพื่อส่องร่องยันต์และเส้นซุ้มให้ชัดขึ้นครับ`;
  }

  const res = await fetch(`${params.apiBase.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      amulet_name: params.amuletName,
      context_info: params.contextInfo,
      question: params.question,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Chat API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return data.answer;
}

export function resolveRefImageUrl(apiBase: string, path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${apiBase.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}
