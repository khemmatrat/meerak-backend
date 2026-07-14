/** Weekly incubation creative brief for Talent (Hermes JSON) */

const WEEKLY_THEMES = [
  {
    cta_th: "จ้างงานคนนี้วันนี้ — ลด 20%",
    headline_th: "โชว์ฝีมืองานจริง 15 วินาที",
    hook_th: "เปิดกล้องหน้างาน — ให้ลูกค้าเห็นคุณภาพทันที",
    script_th:
      "สวัสดีครับ วันนี้มาโชว์งานจริงให้ดูครับ ทำงานตรงเวลา ใส่ใจทุกรายละเอียด จ้างงานผ่าน AQOND ได้เลยครับ",
    hashtags: ["#AQOND", "#ช่างมืออาชีพ", "#งานคุณภาพ"],
    template_hint: "pro_blue",
  },
  {
    cta_th: "จองช่างคนนี้ — โปรพิเศษ 20%",
    headline_th: "ก่อน–หลัง ที่ลูกค้าต้องเห็น",
    hook_th: "ถ่ายคู่ภาพก่อน–หลัง หรือโชว์ขั้นตอนสั้นๆ",
    script_th:
      "ดูความต่างก่อน–หลังครับ งานนี้ใช้เวลาไม่นานแต่คุณภาพเต็มที่ สนใจจ้างงานทักได้ที่ AQOND",
    hashtags: ["#ก่อนหลัง", "#AQOND", "#รับจ้าง"],
    template_hint: "violet_glow",
  },
  {
    cta_th: "กดจ้างผ่าน AQOND รับส่วนลด 20%",
    headline_th: "เคล็ดลับจากช่างตัวจริง",
    hook_th: "แชร์ 1 ทิปที่ลูกค้าชอบ — สร้างความน่าเชื่อถือ",
    script_th:
      "ทิปวันนี้ครับ อย่ามองข้ามรายละเอียดเล็กๆ มันทำให้งานออกมาดีกว่าเดิม จ้างงานผ่าน AQOND สะดวกปลอดภัยครับ",
    hashtags: ["#เคล็ดลับช่าง", "#AQOND"],
    template_hint: "minimal_white",
  },
  {
    cta_th: "จ้างงานปลอดภัย ลดทันที 20%",
    headline_th: "พร้อมรับงานวันนี้",
    hook_th: "บอกพื้นที่ให้บริการ + ความพร้อมรับงาน",
    script_th:
      "ตอนนี้พร้อมรับงานในพื้นที่ครับ ตอบไว ทำงานตรงเวลา กดจ้างงานผ่าน AQOND ได้เลยครับ",
    hashtags: ["#พร้อมรับงาน", "#AQOND", "#จ้างช่าง"],
    template_hint: "hiring_cta",
  },
  {
    cta_th: "ลูกค้าใหม่ จ้างวันนี้ ลด 20%",
    headline_th: "รีวิวจากลูกค้าจริง",
    hook_th: "อ่านคอมเมนต์ดีๆ หรือเล่า feedback สั้นๆ",
    script_th:
      "ขอบคุณลูกค้าที่ไว้วางใจครับ งานแบบนี้ทำบ่อย มั่นใจในฝีมือ จ้างงานซ้ำได้ที่ AQOND ครับ",
    hashtags: ["#รีวิวดี", "#AQOND"],
    template_hint: "week_stamp",
  },
];

export function incubationBriefPrompt(ctx) {
  return `You are Hermes, AQOND Talent growth coach. Create a weekly short-video brief in Thai for a service provider (Talent).
Week ${ctx.week_no} of 13 (90-day incubation). Talent name: ${ctx.talent_name || "ช่าง"}. Category hint: ${ctx.category_hint || "general services"}.

Output JSON only:
{
  "cta_th": "compelling hire CTA max 42 chars e.g. จ้างงานคนนี้ ลด 20% — must drive booking",
  "headline_th": "short video theme title max 40 chars",
  "hook_th": "what to film in 15 seconds",
  "script_th": "spoken script max 120 chars for overlay/voice",
  "hashtags": ["#AQOND", "..."],
  "template_hint": "one of: pro_hire, pro_blue, violet_glow, minimal_white, hiring_cta, week_stamp"
}`;
}

export function ruleBasedIncubationBrief(ctx) {
  const week = Math.max(1, Math.min(13, Number(ctx.week_no) || 1));
  const theme = WEEKLY_THEMES[(week - 1) % WEEKLY_THEMES.length];
  return {
    ...theme,
    week_no: week,
    source: "rules",
  };
}
