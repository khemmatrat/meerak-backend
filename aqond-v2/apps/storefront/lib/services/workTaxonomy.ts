export type WorkSurface = "booking" | "match_job" | "jobboard" | "videofeed";

export interface SurfaceMeta {
  id: WorkSurface;
  label: string;
  description: string;
}

export interface EmploymentTypeOption {
  id: string;
  label: string;
  shortHint: string;
}

export interface SurfaceCategoryBlueprint {
  surface: WorkSurface;
  category: string;
  subcategories: string[];
  sampleHiringExamples: string[];
}

export interface ProfessionRoutingMatrixItem {
  profession: string;
  primary_surface: WorkSurface;
  secondary_surfaces: WorkSurface[];
  recommended_employment_types: string[];
  province_examples: string[];
}

export interface ProfessionAliasKeywordRule {
  profession: string;
  preferred_surface: WorkSurface;
  keywords: string[];
}

export interface RoutingSuggestion {
  surface: WorkSurface;
  profession: string;
  matched_keywords: string[];
  confidence: number;
  vertical?: string | null;
}

export type SurfaceWeightOverrides = Partial<Record<WorkSurface, number>>;
export type VerticalWeightConfig = Record<string, SurfaceWeightOverrides>;

export interface SuggestRoutingOptions {
  verticalWeightOverrides?: VerticalWeightConfig | null;
}

export interface VerticalPriorityRule {
  vertical: string;
  keywords: string[];
  surface_boost: Partial<Record<WorkSurface, number>>;
}

export const WORK_SURFACES: SurfaceMeta[] = [
  {
    id: "booking",
    label: "Booking",
    description: "งานจองคิว/นัดหมาย มีเวลาและสถานที่ชัดเจน",
  },
  {
    id: "match_job",
    label: "Match Job",
    description: "งานจ้างด่วน/ภาคสนาม จับคู่ตามพื้นที่และความพร้อม",
  },
  {
    id: "jobboard",
    label: "Job Board",
    description: "งานโปรเจกต์ มีขอบเขต งบ และระยะเวลาชัดเจน",
  },
  {
    id: "videofeed",
    label: "Video Feed",
    description: "งานที่เหมาะโชว์ผลงานด้วยคลิปก่อนตัดสินใจจ้าง",
  },
];

export const THAI_PROVINCES: string[] = [
  "กรุงเทพมหานคร",
  "กระบี่",
  "กาญจนบุรี",
  "กาฬสินธุ์",
  "กำแพงเพชร",
  "ขอนแก่น",
  "จันทบุรี",
  "ฉะเชิงเทรา",
  "ชลบุรี",
  "ชัยนาท",
  "ชัยภูมิ",
  "ชุมพร",
  "เชียงราย",
  "เชียงใหม่",
  "ตรัง",
  "ตราด",
  "ตาก",
  "นครนายก",
  "นครปฐม",
  "นครพนม",
  "นครราชสีมา",
  "นครศรีธรรมราช",
  "นครสวรรค์",
  "นนทบุรี",
  "นราธิวาส",
  "น่าน",
  "บึงกาฬ",
  "บุรีรัมย์",
  "ปทุมธานี",
  "ประจวบคีรีขันธ์",
  "ปราจีนบุรี",
  "ปัตตานี",
  "พระนครศรีอยุธยา",
  "พังงา",
  "พัทลุง",
  "พิจิตร",
  "พิษณุโลก",
  "เพชรบุรี",
  "เพชรบูรณ์",
  "แพร่",
  "พะเยา",
  "ภูเก็ต",
  "มหาสารคาม",
  "มุกดาหาร",
  "แม่ฮ่องสอน",
  "ยะลา",
  "ยโสธร",
  "ระนอง",
  "ระยอง",
  "ราชบุรี",
  "ลพบุรี",
  "ลำปาง",
  "ลำพูน",
  "เลย",
  "ศรีสะเกษ",
  "สกลนคร",
  "สงขลา",
  "สตูล",
  "สมุทรปราการ",
  "สมุทรสงคราม",
  "สมุทรสาคร",
  "สระแก้ว",
  "สระบุรี",
  "สิงห์บุรี",
  "สุโขทัย",
  "สุพรรณบุรี",
  "สุราษฎร์ธานี",
  "สุรินทร์",
  "หนองคาย",
  "หนองบัวลำภู",
  "อ่างทอง",
  "อุดรธานี",
  "อุทัยธานี",
  "อุตรดิตถ์",
  "อุบลราชธานี",
  "อำนาจเจริญ",
];

export const EMPLOYMENT_TYPE_OPTIONS: EmploymentTypeOption[] = [
  {
    id: "one_time",
    label: "จ้างครั้งเดียว",
    shortHint: "งานจบเป็นครั้ง เช่น ออกแบบโลโก้ 1 ชิ้น",
  },
  {
    id: "urgent",
    label: "งานด่วน / Same-day",
    shortHint: "ต้องการคนเริ่มงานเร็วภายในวันเดียว",
  },
  {
    id: "project",
    label: "โปรเจกต์ระยะสั้น",
    shortHint: "มี milestone และส่งมอบเป็นเฟส",
  },
  {
    id: "contract",
    label: "สัญญารายเดือน",
    shortHint: "ทำต่อเนื่องตาม KPI/ขอบเขตที่ตกลง",
  },
  {
    id: "part_time",
    label: "พาร์ทไทม์",
    shortHint: "กำหนดชั่วโมง/กะงานชัดเจน",
  },
  {
    id: "full_time",
    label: "ฟูลไทม์ / long-term",
    shortHint: "เหมาะงานที่ต้องดูแลระบบหรือทีมระยะยาว",
  },
];

export const DEFAULT_HIRING_ORDER_NEWBIE: string[] = [
  "กำหนดเป้าหมายงานและงบประมาณที่จ่ายได้จริง",
  "เลือกหมวดงาน + ลักษณะการจ้างงานให้ตรงโจทย์",
  "ลงรายละเอียดงานและตัวอย่างที่ต้องการให้ชัดเจน",
  "คัดผู้สมัครจากผลงาน/รีวิว แล้วคุยสโคปก่อนจ้าง",
  "เริ่มงานด้วย milestone สั้น และรีวิวผลงานรอบแรกเร็ว",
];

export const DEFAULT_HIRING_ORDER_SENIOR: string[] = [
  "ตั้ง acceptance criteria, KPI และ risk gate ก่อนเปิดรับ",
  "ล็อกขอบเขตงาน + change request policy ตั้งแต่ต้น",
  "วางโครง milestone, payment term และ SLA ที่ตรวจวัดได้",
  "ทำ shortlist แบบ scorecard เพื่อเทียบผู้สมัครอย่างเป็นระบบ",
  "ปิดงานด้วย handover checklist และเอกสารใช้งานจริง",
];

export const SURFACE_CATEGORY_BLUEPRINTS: SurfaceCategoryBlueprint[] = [
  {
    surface: "booking",
    category: "Beauty & Wellness",
    subcategories: [
      "ช่างแต่งหน้า",
      "ทำเล็บ",
      "ต่อขนตา",
      "นวด",
      "สปา",
      "Personal Stylist",
    ],
    sampleHiringExamples: [
      "จองช่างแต่งหน้าเจ้าสาวที่บ้าน 06:00-09:00",
      "จองนวดออฟฟิศซินโดรม 90 นาที นอกสถานที่",
      "จองทำเล็บเจล + ต่อเล็บ PVC ที่ร้าน",
    ],
  },
  {
    surface: "booking",
    category: "Home & Cleaning",
    subcategories: [
      "แม่บ้านรายวัน",
      "Big Cleaning",
      "ล้างแอร์",
      "กำจัดปลวก/แมลง",
      "ซักผ้าม่าน/พรม",
    ],
    sampleHiringExamples: [
      "จองแม่บ้านคอนโด 4 ชั่วโมง พื้นที่ 45 ตร.ม.",
      "จองล้างแอร์ 2 เครื่อง พร้อมเติมน้ำยา",
      "จอง Big Cleaning หลังรีโนเวท 1 วัน",
    ],
  },
  {
    surface: "booking",
    category: "Photography & Event Service",
    subcategories: [
      "Photography",
      "ถ่ายวีดีโอ",
      "พิธีกร MC",
      "นักดนตรี",
      "DJ",
      "Wedding Planner",
    ],
    sampleHiringExamples: [
      "จองช่างภาพงานรับปริญญา 4 ชั่วโมง",
      "จอง DJ งานเลี้ยงบริษัท 1 รอบกลางคืน",
      "จอง MC + ทีมถ่ายทอดสดงานสัมมนา",
    ],
  },
  {
    surface: "match_job",
    category: "ช่างภาคสนาม / งานด่วน",
    subcategories: [
      "ช่างไฟฟ้า",
      "ช่างประปา",
      "ช่างแอร์",
      "ช่างซ่อมเครื่องใช้ไฟฟ้า",
      "ช่างกุญแจ",
    ],
    sampleHiringExamples: [
      "งานด่วน ไฟตกทั้งบ้าน ต้องการช่างภายใน 2 ชั่วโมง",
      "ซ่อมท่อน้ำรั่ว พร้อมเปลี่ยนอะไหล่หน้างาน",
      "แอร์ไม่เย็น ต้องการช่างเช็กระบบคืนนี้",
    ],
  },
  {
    surface: "match_job",
    category: "Cleaning",
    subcategories: [
      "ทำความสะอาดบ้าน",
      "ทำความสะอาดคอนโด",
      "ทำความสะอาดออฟฟิศ",
      "ซักผ้าม่าน",
      "ล้างขี้นก",
    ],
    sampleHiringExamples: [
      "ทำความสะอาดคอนโดเร่งด่วนก่อนส่งมอบห้อง",
      "ล้างโซฟา + ซักพรมภายในวันเสาร์",
      "หาแม่บ้านด่วน ใกล้ฉัน เริ่มงานบ่ายนี้",
    ],
  },
  {
    surface: "match_job",
    category: "Driver",
    subcategories: [
      "คนขับรถผู้บริหาร",
      "คนขับรถรายวัน",
      "รถขนของ",
      "ขับรถส่งของ",
      "พนักงานจัดส่งสินค้า",
    ],
    sampleHiringExamples: [
      "หาคนขับรถผู้บริหาร 1 วัน โซนกรุงเทพ",
      "ขับรถส่งของรอบเร่งด่วน 8 จุด",
      "รถกระบะ + คนยกของ ย้ายหอพักวันนี้",
    ],
  },
  {
    surface: "match_job",
    category: "Plumbing",
    subcategories: [
      "ซ่อมท่อตัน",
      "ติดตั้งสุขภัณฑ์",
      "ติดตั้งชักโครก",
      "ติดตั้งอ่างล้างหน้า",
      "งานประปา",
    ],
    sampleHiringExamples: [
      "แก้ท่อตันห้องน้ำคอนโดแบบเร่งด่วน",
      "ติดตั้งสุขภัณฑ์ใหม่ทั้งชุดใน 1 วัน",
      "เปลี่ยนปั๊มน้ำและเช็กแรงดัน",
    ],
  },
  {
    surface: "match_job",
    category: "Electrician",
    subcategories: [
      "ติดตั้งเดินสายไฟ",
      "ติดตั้งปลั๊กไฟ",
      "ตรวจระบบไฟฟ้า",
      "ซ่อมระบบไฟในบ้าน",
      "ติดตั้ง EV Charger",
    ],
    sampleHiringExamples: [
      "เดินสายไฟเพิ่มสำหรับห้องครัว",
      "ตรวจระบบไฟทั้งบ้านก่อนย้ายเข้า",
      "ติดตั้งที่ชาร์จรถ EV พร้อมเบรกเกอร์",
    ],
  },
  {
    surface: "match_job",
    category: "AC_Cleaning",
    subcategories: [
      "ล้างแอร์",
      "ซ่อมแอร์",
      "เติมน้ำยาแอร์",
      "ติดตั้งแอร์",
      "ช่างแอร์ด่วน",
    ],
    sampleHiringExamples: [
      "ล้างแอร์คอนโด 3 เครื่องภายในวันเดียว",
      "แอร์ไม่เย็น เรียกช่างเช็ก + เติมน้ำยา",
      "ติดตั้งแอร์ใหม่พร้อมเดินท่อ",
    ],
  },
  {
    surface: "match_job",
    category: "Moving",
    subcategories: [
      "ขนย้ายบ้าน",
      "ขนย้ายสำนักงาน",
      "ขนย้ายเฟอร์นิเจอร์",
      "พนักงานยกของ",
      "เด็กติดรถ",
    ],
    sampleHiringExamples: [
      "ย้ายบ้าน 2 ห้องนอน กรุงเทพ-นนทบุรี",
      "ย้ายออฟฟิศกลางคืนพร้อมทีมแพ็คของ",
      "จ้างรถขนของพร้อมแรงงานยก 3 คน",
    ],
  },
  {
    surface: "match_job",
    category: "Party_Guest",
    subcategories: [
      "เพื่อนเที่ยว",
      "งานอีเว้นท์",
      "พริตตี้",
      "พิธีกร",
      "คนช่วยออกงาน",
    ],
    sampleHiringExamples: [
      "หาคนร่วมงานอีเว้นท์แบรนด์ 4 ชั่วโมง",
      "จ้างเพื่อนเที่ยวต่างจังหวัด 1 วัน",
      "หา MC งานเปิดร้าน",
    ],
  },
  {
    surface: "match_job",
    category: "Logistics & On-site",
    subcategories: [
      "คนขับรถ",
      "รถขนของ",
      "เด็กติดรถ",
      "พนักงานยกของ",
      "ตรวจสภาพรถ",
    ],
    sampleHiringExamples: [
      "หาคนขับรถผู้บริหาร 1 วัน (กรุงเทพฯ)",
      "ย้ายของคอนโด 1 ห้องนอน พร้อมคนยก 2 คน",
      "จ้างตรวจสภาพรถมือสองก่อนโอน",
    ],
  },
  {
    surface: "jobboard",
    category: "Design & Creative",
    subcategories: [
      "Logo",
      "Banner โฆษณา",
      "UX/UI",
      "Packaging",
      "Presentation",
      "Illustration",
    ],
    sampleHiringExamples: [
      "ออกแบบ CI + โลโก้ + brand guideline",
      "ออกแบบแบนเนอร์แคมเปญ 15 ชิ้น/เดือน",
      "ออกแบบ UX/UI สำหรับแอปจองบริการ",
    ],
  },
  {
    surface: "jobboard",
    category: "Programming & Tech",
    subcategories: [
      "Web Development",
      "Mobile App",
      "RPA Automation",
      "Data Engineering",
      "IT Support",
      "QA",
    ],
    sampleHiringExamples: [
      "พัฒนาเว็บบริษัท + dashboard ผู้ดูแล",
      "ทำระบบจองคิวพร้อม LINE แจ้งเตือน",
      "ทำ RPA ดึงข้อมูลรายงานรายวันอัตโนมัติ",
    ],
  },
  {
    surface: "jobboard",
    category: "Marketing",
    subcategories: [
      "SEO",
      "Facebook/TikTok Ads",
      "Influencer Marketing",
      "PR",
      "Email Marketing",
      "Marketing Strategy",
    ],
    sampleHiringExamples: [
      "ดูแลยิงแอด Facebook/TikTok พร้อมรายงานรายสัปดาห์",
      "วางกลยุทธ์ SEO + content 3 เดือน",
      "ทำแผน influencer สำหรับเปิดตัวสินค้าใหม่",
    ],
  },
  {
    surface: "jobboard",
    category: "Writing & Translation",
    subcategories: [
      "บทความ SEO",
      "แปลภาษา",
      "พิสูจน์อักษร",
      "ถอดเทป",
      "Copywriting",
    ],
    sampleHiringExamples: [
      "เขียนบทความ SEO 20 บท/เดือน",
      "แปลเอกสารกฎหมาย ไทย-อังกฤษ",
      "พิสูจน์อักษรหนังสือ 120 หน้า",
    ],
  },
  {
    surface: "jobboard",
    category: "Video & Animation",
    subcategories: [
      "ตัดต่อวิดีโอ",
      "Motion Graphics",
      "2D/3D Animation",
      "VFX/CGI",
      "Subtitle",
    ],
    sampleHiringExamples: [
      "ตัดต่อวิดีโอ TikTok 30 คลิป/เดือน",
      "ทำโมชั่นกราฟิกสำหรับโฆษณา 15 วินาที",
      "ทำซับไทย-อังกฤษสำหรับคอร์สออนไลน์",
    ],
  },
  {
    surface: "jobboard",
    category: "Admin & Support",
    subcategories: [
      "แอดมินออนไลน์",
      "ตอบแชท",
      "คีย์ข้อมูล",
      "Virtual Assistant",
      "Callcenter / Telesale",
    ],
    sampleHiringExamples: [
      "จ้างแอดมินตอบแชท Shopee/Line OA",
      "คีย์ข้อมูลและจัดรูปเอกสารรายวัน",
      "พนักงาน telesales โปรเจกต์ 3 เดือน",
    ],
  },
  {
    surface: "jobboard",
    category: "Other",
    subcategories: [
      "Business Consultant",
      "Legal & Accounting",
      "Research",
      "Education & Tutor",
      "Specialized Expert",
    ],
    sampleHiringExamples: [
      "ที่ปรึกษาวางระบบธุรกิจ SME",
      "จัดทำบัญชีและยื่นภาษีรายเดือน",
      "วิเคราะห์ข้อมูลและทำ dashboard ผู้บริหาร",
    ],
  },
  {
    surface: "videofeed",
    category: "ช่องโชว์ผลงาน Creator",
    subcategories: [
      "ตัดต่อวิดีโอ",
      "ช่างแต่งหน้า",
      "ช่างทำผม",
      "ช่างภาพ",
      "เทรนเนอร์",
      "เชฟ",
    ],
    sampleHiringExamples: [
      "ดูคลิป Before/After แล้วจองคิวช่างแต่งหน้า",
      "ดูผลงานตัดต่อ Reels ก่อนจ้างรายเดือน",
      "ดูคลิปสอน/สาธิตก่อนนัดเทรนเนอร์ส่วนตัว",
    ],
  },
  {
    surface: "videofeed",
    category: "สายบริการที่ต้องเห็นผลงานก่อนจ้าง",
    subcategories: [
      "ช่างสัก",
      "ช่างทำผม",
      "ช่างเล็บ",
      "ช่างภาพ",
      "ตัดต่อวิดีโอ",
      "ศิลปินวาดภาพ",
    ],
    sampleHiringExamples: [
      "ดูพอร์ตลายสักก่อนจองคิว",
      "ดูคลิปผลงานช่างผมก่อนจ้างนอกสถานที่",
      "เลือกช่างภาพจากสไตล์คลิปตัวอย่าง",
    ],
  },
];

export const PROFESSION_ROUTING_MATRIX: ProfessionRoutingMatrixItem[] = [
  {
    profession: "ช่างแต่งหน้า / ทำผม / ทำเล็บ",
    primary_surface: "booking",
    secondary_surfaces: ["videofeed", "match_job"],
    recommended_employment_types: ["one_time", "part_time", "contract"],
    province_examples: ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต"],
  },
  {
    profession: "นวด / สปา / wellness",
    primary_surface: "booking",
    secondary_surfaces: ["videofeed", "match_job"],
    recommended_employment_types: ["one_time", "part_time", "contract"],
    province_examples: ["กรุงเทพมหานคร", "ชลบุรี", "เชียงใหม่"],
  },
  {
    profession: "ช่างไฟ / ช่างประปา / ช่างแอร์",
    primary_surface: "match_job",
    secondary_surfaces: ["booking", "jobboard"],
    recommended_employment_types: ["urgent", "one_time", "project"],
    province_examples: ["กรุงเทพมหานคร", "นนทบุรี", "ปทุมธานี"],
  },
  {
    profession: "แม่บ้าน / ทำความสะอาด",
    primary_surface: "match_job",
    secondary_surfaces: ["booking"],
    recommended_employment_types: ["urgent", "one_time", "part_time"],
    province_examples: ["กรุงเทพมหานคร", "เชียงใหม่", "ชลบุรี"],
  },
  {
    profession: "คนขับรถ / ขนย้าย / โลจิสติกส์",
    primary_surface: "match_job",
    secondary_surfaces: ["booking", "jobboard"],
    recommended_employment_types: ["urgent", "one_time", "part_time"],
    province_examples: ["กรุงเทพมหานคร", "ขอนแก่น", "ภูเก็ต"],
  },
  {
    profession: "ช่างภาพ / ถ่ายวิดีโอ / โปรดักชัน",
    primary_surface: "videofeed",
    secondary_surfaces: ["booking", "jobboard"],
    recommended_employment_types: ["one_time", "project", "contract"],
    province_examples: ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต"],
  },
  {
    profession: "ตัดต่อวิดีโอ / motion / animation",
    primary_surface: "jobboard",
    secondary_surfaces: ["videofeed"],
    recommended_employment_types: ["project", "contract", "full_time"],
    province_examples: ["กรุงเทพมหานคร", "เชียงใหม่", "ขอนแก่น"],
  },
  {
    profession: "นักพากย์ / Voice Over / Sound Engineer",
    primary_surface: "jobboard",
    secondary_surfaces: ["videofeed", "booking"],
    recommended_employment_types: ["project", "contract", "part_time"],
    province_examples: ["กรุงเทพมหานคร", "นนทบุรี", "เชียงใหม่"],
  },
  {
    profession: "Graphic Design / UXUI / Branding",
    primary_surface: "jobboard",
    secondary_surfaces: ["videofeed"],
    recommended_employment_types: ["project", "contract", "full_time"],
    province_examples: ["กรุงเทพมหานคร", "ขอนแก่น", "ภูเก็ต"],
  },
  {
    profession: "Web / Mobile / Software Developer",
    primary_surface: "jobboard",
    secondary_surfaces: ["match_job"],
    recommended_employment_types: ["project", "contract", "full_time"],
    province_examples: ["กรุงเทพมหานคร", "เชียงใหม่", "ชลบุรี"],
  },
  {
    profession: "Data Analyst / Data Engineer / BI",
    primary_surface: "jobboard",
    secondary_surfaces: ["match_job"],
    recommended_employment_types: ["project", "contract", "full_time"],
    province_examples: ["กรุงเทพมหานคร", "ขอนแก่น", "นครราชสีมา"],
  },
  {
    profession: "SEO / Ads / Digital Marketing",
    primary_surface: "jobboard",
    secondary_surfaces: ["videofeed", "booking"],
    recommended_employment_types: ["project", "contract", "part_time"],
    province_examples: ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต"],
  },
  {
    profession: "Influencer / MC / Event Staff",
    primary_surface: "booking",
    secondary_surfaces: ["videofeed", "jobboard"],
    recommended_employment_types: ["one_time", "part_time", "project"],
    province_examples: ["กรุงเทพมหานคร", "ชลบุรี", "สมุทรปราการ"],
  },
  {
    profession: "นักร้อง / นักดนตรี / DJ",
    primary_surface: "booking",
    secondary_surfaces: ["videofeed", "jobboard"],
    recommended_employment_types: ["one_time", "part_time", "contract"],
    province_examples: ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต"],
  },
  {
    profession: "ติวเตอร์ / โค้ช / เทรนเนอร์",
    primary_surface: "booking",
    secondary_surfaces: ["jobboard", "videofeed"],
    recommended_employment_types: ["one_time", "part_time", "contract"],
    province_examples: ["กรุงเทพมหานคร", "เชียงใหม่", "ขอนแก่น"],
  },
  {
    profession: "ที่ปรึกษาธุรกิจ / กฎหมาย / บัญชี",
    primary_surface: "jobboard",
    secondary_surfaces: ["booking"],
    recommended_employment_types: ["project", "contract", "full_time"],
    province_examples: ["กรุงเทพมหานคร", "นนทบุรี", "ปทุมธานี"],
  },
  {
    profession: "งานวิจัย / เขียนบทความ / แปลภาษา",
    primary_surface: "jobboard",
    secondary_surfaces: ["videofeed"],
    recommended_employment_types: ["project", "contract", "part_time"],
    province_examples: ["กรุงเทพมหานคร", "เชียงใหม่", "สงขลา"],
  },
  {
    profession: "สัตวแพทย์ / ดูแลสัตว์ / pet groomer",
    primary_surface: "booking",
    secondary_surfaces: ["match_job", "videofeed"],
    recommended_employment_types: ["one_time", "part_time", "contract"],
    province_examples: ["กรุงเทพมหานคร", "ชลบุรี", "เชียงใหม่"],
  },
  {
    profession: "ก่อสร้าง / รีโนเวท / สถาปัตย์",
    primary_surface: "jobboard",
    secondary_surfaces: ["match_job", "booking"],
    recommended_employment_types: ["project", "contract", "full_time"],
    province_examples: ["กรุงเทพมหานคร", "ภูเก็ต", "ชลบุรี"],
  },
  {
    profession: "เช่ารถ / เช่าอุปกรณ์ / rental service",
    primary_surface: "booking",
    secondary_surfaces: ["match_job", "jobboard"],
    recommended_employment_types: ["one_time", "part_time", "contract"],
    province_examples: ["กรุงเทพมหานคร", "เชียงใหม่", "ภูเก็ต"],
  },
  {
    profession: "งานพาร์ทไทม์ / event staffing",
    primary_surface: "match_job",
    secondary_surfaces: ["jobboard", "booking"],
    recommended_employment_types: ["urgent", "part_time", "one_time"],
    province_examples: ["กรุงเทพมหานคร", "ชลบุรี", "ขอนแก่น"],
  },
];

function uniqueKeywords(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const k = String(raw || "").trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function splitProfessionKeywords(profession: string): string[] {
  return String(profession || "")
    .split(/[\/,()\-]/g)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2);
}

export const AUTO_GENERATED_ALIAS_RULES: ProfessionAliasKeywordRule[] =
  PROFESSION_ROUTING_MATRIX.map((row) => {
    const keywordPool = [
      ...splitProfessionKeywords(row.profession),
      ...row.province_examples,
      ...row.recommended_employment_types,
    ];
    return {
      profession: row.profession,
      preferred_surface: row.primary_surface,
      keywords: uniqueKeywords(keywordPool),
    };
  });

export const PROFESSION_ALIAS_KEYWORD_RULES: ProfessionAliasKeywordRule[] = [
  {
    profession: "ช่างแต่งหน้า / ทำผม / ทำเล็บ",
    preferred_surface: "booking",
    keywords: [
      "แต่งหน้า",
      "ช่างแต่งหน้า",
      "makeup",
      "ทำผม",
      "hair stylist",
      "ทำเล็บ",
      "nail",
      "ต่อขนตา",
      "ลิฟติ้งขนตา",
    ],
  },
  {
    profession: "นวด / สปา / wellness",
    preferred_surface: "booking",
    keywords: [
      "นวด",
      "massage",
      "สปา",
      "wellness",
      "สปาหู",
      "นวดหน้า",
      "sport massage",
      "ออฟฟิศซินโดรม",
    ],
  },
  {
    profession: "ช่างไฟ / ช่างประปา / ช่างแอร์",
    preferred_surface: "match_job",
    keywords: [
      "ช่างไฟ",
      "ไฟฟ้า",
      "ช่างประปา",
      "ท่อตัน",
      "ช่างแอร์",
      "ซ่อมแอร์",
      "ล้างแอร์",
      "ติดตั้งแอร์",
      "ติดตั้งไฟ",
    ],
  },
  {
    profession: "แม่บ้าน / ทำความสะอาด",
    preferred_surface: "match_job",
    keywords: [
      "แม่บ้าน",
      "ทำความสะอาด",
      "big cleaning",
      "ซักผ้าม่าน",
      "ล้างโซฟา",
      "ล้างขี้นก",
      "cleaning",
      "แม่บ้านด่วน",
    ],
  },
  {
    profession: "คนขับรถ / ขนย้าย / โลจิสติกส์",
    preferred_surface: "match_job",
    keywords: [
      "คนขับรถ",
      "ขนย้าย",
      "รถขนของ",
      "ส่งของ",
      "โลจิสติกส์",
      "คลังสินค้า",
      "พนักงานยกของ",
      "telesale",
    ],
  },
  {
    profession: "ช่างภาพ / ถ่ายวิดีโอ / โปรดักชัน",
    preferred_surface: "videofeed",
    keywords: [
      "ช่างภาพ",
      "photography",
      "ถ่ายวีดีโอ",
      "videography",
      "ถ่ายโดรน",
      "live streaming",
      "production",
      "tvc",
    ],
  },
  {
    profession: "ตัดต่อวิดีโอ / motion / animation",
    preferred_surface: "jobboard",
    keywords: [
      "ตัดต่อวิดีโอ",
      "video editor",
      "โมชั่นกราฟิก",
      "motion graphics",
      "animation",
      "vfx",
      "cgi",
      "subtitle",
    ],
  },
  {
    profession: "Graphic Design / UXUI / Branding",
    preferred_surface: "jobboard",
    keywords: [
      "กราฟิก",
      "graphic",
      "logo",
      "ux",
      "ui",
      "branding",
      "packaging",
      "presentation",
      "infographic",
    ],
  },
  {
    profession: "Web / Mobile / Software Developer",
    preferred_surface: "jobboard",
    keywords: [
      "web",
      "website",
      "wordpress",
      "mobile app",
      "ios",
      "android",
      "developer",
      "programming",
      "rpa",
      "qa",
    ],
  },
  {
    profession: "Data Analyst / Data Engineer / BI",
    preferred_surface: "jobboard",
    keywords: [
      "data",
      "dashboard",
      "power bi",
      "spss",
      "วิเคราะห์ข้อมูล",
      "data engineering",
      "data science",
      "tracking data",
    ],
  },
  {
    profession: "SEO / Ads / Digital Marketing",
    preferred_surface: "jobboard",
    keywords: [
      "seo",
      "google ads",
      "facebook ads",
      "tiktok ads",
      "youtube ads",
      "marketing",
      "influencer",
      "backlink",
      "email marketing",
    ],
  },
  {
    profession: "ที่ปรึกษาธุรกิจ / กฎหมาย / บัญชี",
    preferred_surface: "jobboard",
    keywords: [
      "consultant",
      "ที่ปรึกษา",
      "กฎหมาย",
      "lawyer",
      "บัญชี",
      "ภาษี",
      "audit",
      "payroll",
      "business advisory",
    ],
  },
  {
    profession: "งานวิจัย / เขียนบทความ / แปลภาษา",
    preferred_surface: "jobboard",
    keywords: [
      "บทความ",
      "copywriting",
      "แปลภาษา",
      "translator",
      "ล่าม",
      "พิสูจน์อักษร",
      "ถอดเทป",
      "งานวิจัย",
      "sop",
    ],
  },
  {
    profession: "Influencer / MC / Event Staff",
    preferred_surface: "booking",
    keywords: [
      "mc",
      "พิธีกร",
      "พริตตี้",
      "influencer",
      "staff event",
      "ออกบูธ",
      "แจกใบปลิว",
      "จัดอีเว้นท์",
    ],
  },
  {
    profession: "นักร้อง / นักดนตรี / DJ",
    preferred_surface: "booking",
    keywords: [
      "นักร้อง",
      "นักดนตรี",
      "dj",
      "วงดนตรี",
      "ร้องเพลง",
      "แซกโซโฟน",
      "mixing mastering",
    ],
  },
  {
    profession: "ติวเตอร์ / โค้ช / เทรนเนอร์",
    preferred_surface: "booking",
    keywords: [
      "ติว",
      "สอนพิเศษ",
      "tutor",
      "เทรนเนอร์",
      "personal trainer",
      "เรียนภาษา",
      "เรียนกีฬา",
    ],
  },
  {
    profession: "สัตวแพทย์ / ดูแลสัตว์ / pet groomer",
    preferred_surface: "booking",
    keywords: [
      "สัตวแพทย์",
      "รับฝากแมว",
      "รับฝากสุนัข",
      "ตัดขนสัตว์",
      "pet",
      "ฝึกสุนัข",
    ],
  },
  {
    profession: "ก่อสร้าง / รีโนเวท / สถาปัตย์",
    preferred_surface: "jobboard",
    keywords: [
      "รีโนเวท",
      "ต่อเติม",
      "สถาปัตย์",
      "วิศวกรรม",
      "ก่อสร้าง",
      "boq",
      "โซล่าเซลล์",
      "landscape",
    ],
  },
  {
    profession: "เช่ารถ / เช่าอุปกรณ์ / rental service",
    preferred_surface: "booking",
    keywords: [
      "เช่ารถ",
      "เช่ารถตู้",
      "เช่ามอเตอร์ไซค์",
      "เช่าเครื่องดนตรี",
      "เช่าโปรเจคเตอร์",
      "เช่าอุปกรณ์",
      "rental",
    ],
  },
  {
    profession: "งานพาร์ทไทม์ / event staffing",
    preferred_surface: "match_job",
    keywords: [
      "พาร์ทไทม์",
      "รายวัน",
      "งานสตาฟ",
      "แคชชวล",
      "กลางคืน",
      "เสาร์ อาทิตย์",
    ],
  },
  {
    profession: "กฎหมายเฉพาะทาง / สัญญา / คดีความ",
    preferred_surface: "jobboard",
    keywords: [
      "ทนายคดีแพ่ง",
      "ทนายคดีอาญา",
      "ทนายแรงงาน",
      "ร่างสัญญา",
      "ตรวจสัญญา",
      "ไกล่เกลี่ยข้อพิพาท",
      "ขึ้นศาล",
      "due diligence",
      "pdpa",
      "compliance officer",
    ],
  },
  {
    profession: "บัญชี ภาษี ตรวจสอบบัญชี",
    preferred_surface: "jobboard",
    keywords: [
      "ปิดงบ",
      "ยื่นภาษี",
      "ภงด",
      "vat",
      "ผู้ทำบัญชี",
      "ผู้สอบบัญชี",
      "บัญชีต้นทุน",
      "วางแผนภาษี",
      "ภาษีเงินได้",
    ],
  },
  {
    profession: "งานก่อสร้างเฉพาะทาง / ถอดแบบ / โครงสร้าง",
    preferred_surface: "jobboard",
    keywords: [
      "ผู้รับเหมา",
      "ถอดแบบ",
      "boq",
      "estimate",
      "โครงสร้าง",
      "วิศวกรโยธา",
      "วิศวกรไฟฟ้า",
      "เขียนแบบ shop drawing",
      "เซ็นรับรองแบบ",
      "ควบคุมงานไซต์",
    ],
  },
  {
    profession: "งานเช่าและโลจิสติกส์ภาคสนาม",
    preferred_surface: "booking",
    keywords: [
      "เช่ารถรายวัน",
      "เช่ารถรายเดือน",
      "เช่ารถตู้พร้อมคนขับ",
      "เช่าโกดัง",
      "เช่าอุปกรณ์จัดงาน",
      "ขนส่งเร่งด่วน",
      "รถกระบะรับจ้าง",
      "ย้ายบ้าน",
      "ย้ายออฟฟิศ",
    ],
  },
  {
    profession: "ความงามเฉพาะทาง",
    preferred_surface: "booking",
    keywords: [
      "ต่อเล็บเจล",
      "สระไดร์",
      "ดัดผม",
      "ทำสีผม",
      "แต่งหน้าเจ้าสาว",
      "แต่งหน้ารับปริญญา",
      "สักคิ้ว",
      "wax",
      "threading",
    ],
  },
  {
    profession: "งานปล่อยเช่าและดูแลทรัพย์สิน",
    preferred_surface: "jobboard",
    keywords: [
      "property manager",
      "ดูแลอพาร์ตเมนต์",
      "ดูแลหอพัก",
      "นายหน้าเช่า",
      "แอดมินปล่อยเช่า",
      "ดูแลผู้เช่า",
      "co-host airbnb",
      "ทำความสะอาดหลังผู้เช่าออก",
    ],
  },
];

const URGENT_HINTS = [
  "ด่วน",
  "เร่งด่วน",
  "ทันที",
  "วันนี้",
  "ภายในวันนี้",
  "same-day",
  "urgent",
];

const FIELD_SERVICE_HINTS = [
  "ซ่อม",
  "ติดตั้ง",
  "ล้าง",
  "แก้ไข",
  "หน้างาน",
  "on-site",
  "นอกสถานที่",
];

const PROVINCE_ALIAS_KEYWORDS: string[] = uniqueKeywords([
  ...THAI_PROVINCES,
  "กทม",
  "กรุงเทพ",
  "bkk",
  "เชียงใหม่",
  "chiang mai",
  "ภูเก็ต",
  "phuket",
  "โคราช",
  "korat",
  "หาดใหญ่",
  "hat yai",
  "นนทบุรี",
  "nonthaburi",
  "สมุทรปราการ",
  "samut prakan",
  "ปทุมธานี",
  "pathum thani",
  "ขอนแก่น",
  "khon kaen",
  "ชลบุรี",
  "chonburi",
  "ระยอง",
  "rayong",
]);

export const VERTICAL_PRIORITY_RULES: VerticalPriorityRule[] = [
  {
    vertical: "beauty_wellness",
    keywords: [
      "beauty",
      "wellness",
      "แต่งหน้า",
      "ทำผม",
      "ทำเล็บ",
      "นวด",
      "สปา",
      "ต่อขนตา",
      "salon",
    ],
    surface_boost: {
      booking: 0.18,
      videofeed: 0.08,
    },
  },
  {
    vertical: "technical_home_service",
    keywords: [
      "ช่าง",
      "ซ่อม",
      "ติดตั้ง",
      "ไฟฟ้า",
      "ประปา",
      "แอร์",
      "รีโนเวท",
      "ก่อสร้าง",
      "maintenance",
    ],
    surface_boost: {
      match_job: 0.2,
      jobboard: 0.06,
    },
  },
  {
    vertical: "creative_media",
    keywords: [
      "ออกแบบ",
      "design",
      "graphic",
      "ux",
      "ui",
      "ถ่ายภาพ",
      "วิดีโอ",
      "video",
      "animation",
      "vfx",
    ],
    surface_boost: {
      jobboard: 0.16,
      videofeed: 0.1,
    },
  },
  {
    vertical: "marketing_sales",
    keywords: [
      "seo",
      "ads",
      "marketing",
      "ยิงแอด",
      "influencer",
      "โปรโมชั่น",
      "lead",
      "sales",
      "telesale",
    ],
    surface_boost: {
      jobboard: 0.18,
      booking: 0.04,
    },
  },
  {
    vertical: "legal_finance_consulting",
    keywords: [
      "กฎหมาย",
      "ทนาย",
      "บัญชี",
      "ภาษี",
      "audit",
      "consulting",
      "ที่ปรึกษา",
      "compliance",
    ],
    surface_boost: {
      jobboard: 0.2,
    },
  },
  {
    vertical: "construction_engineering",
    keywords: [
      "ก่อสร้าง",
      "รีโนเวท",
      "สถาปนิก",
      "วิศวกร",
      "ถอดแบบ",
      "boq",
      "shop drawing",
      "ไซต์งาน",
    ],
    surface_boost: {
      jobboard: 0.22,
      match_job: 0.08,
    },
  },
  {
    vertical: "rental_logistics",
    keywords: [
      "เช่ารถ",
      "เช่าอุปกรณ์",
      "เช่าโกดัง",
      "ขนย้าย",
      "ย้ายบ้าน",
      "ย้ายออฟฟิศ",
      "รถขนของ",
      "โลจิสติกส์",
    ],
    surface_boost: {
      booking: 0.14,
      match_job: 0.12,
    },
  },
];

export const JOBBOARD_CATEGORY_GROUPS: Array<{
  group: string;
  categories: string[];
}> = [
  {
    group: "AI & Data",
    categories: [
      "AI Development",
      "AI Automation",
      "Chatbot",
      "AI Tool",
      "Prompt Engineering",
      "AI Prototype",
      "AI Consultant",
      "AI Transformation",
      "Data Analysis",
      "Data Engineering",
      "Data Science & AI",
      "Data Labeling",
      "Dashboard & BI",
    ],
  },
  {
    group: "Marketing & Growth",
    categories: [
      "Digital Marketing",
      "Marketing Strategy",
      "SEO",
      "Social Media Ads",
      "Google Ads & YouTube Ads",
      "Creative & Content Marketing",
      "Influencer Marketing",
      "PR & Communications",
      "Online Store & Sales",
      "Email Marketing",
      "Branding",
    ],
  },
  {
    group: "Design & Creative",
    categories: [
      "Graphic Design",
      "Logo Design",
      "Banner Design",
      "Label & Packaging",
      "Print Design",
      "Presentation Design",
      "3D Modeling & Render",
      "UI/UX Design",
      "Character & Mascot Design",
      "Illustration",
      "Art & Craft",
      "Fashion Design",
      "Canva Design",
      "Infographic Design",
    ],
  },
  {
    group: "Media Production",
    categories: [
      "Video Editing",
      "Photography",
      "Videography",
      "Motion Graphics",
      "Animation 2D/3D",
      "Subtitle & Localization",
      "Voice Over",
      "Audio Production",
      "Podcast Production",
      "VFX & CGI",
      "Live Streaming Production",
    ],
  },
  {
    group: "Programming & Tech",
    categories: [
      "Web Development",
      "WordPress Development",
      "E-Commerce Development",
      "Mobile App Development",
      "Desktop App Development",
      "Game Development",
      "QA & Testing",
      "IT Solution & Support",
      "System & Network",
      "IT Project Management",
      "Website Scraping",
      "Cybersecurity Consulting",
      "IoT & Hardware",
      "RPA & Workflow Automation",
    ],
  },
  {
    group: "Business & Operations",
    categories: [
      "Legal Services",
      "Business Registration",
      "Accounting & Tax",
      "Financial Planning",
      "Payroll",
      "Debt Consulting",
      "Business Advisory",
      "Startup Consulting",
      "HR Consulting",
      "Business Assistant",
      "Procurement & Sourcing",
      "OEM & Manufacturing",
    ],
  },
  {
    group: "Architecture & Engineering",
    categories: [
      "Architecture Design",
      "Interior Design",
      "Landscape Design",
      "Lighting Design",
      "Engineering Drawing",
      "Structural Engineering",
      "BOQ & Costing",
      "Construction Consulting",
    ],
  },
  {
    group: "Writing & Language",
    categories: [
      "Content Writing",
      "SEO Article Writing",
      "Copywriting",
      "Research Writing",
      "Translation",
      "Interpretation",
      "Proofreading",
      "Transcription",
      "Academic Support",
    ],
  },
  {
    group: "Education & Training",
    categories: [
      "Tutoring",
      "Language Coaching",
      "Coding Instructor",
      "Digital Marketing Instructor",
      "Sports Coaching",
      "Music & Art Coaching",
      "Professional Skill Training",
    ],
  },
  {
    group: "Lifestyle & Services",
    categories: [
      "Beauty Services",
      "Wellness Services",
      "Home Cleaning Services",
      "Event & Organizer",
      "Travel Planning",
      "Pet Services",
      "Rental Services",
      "Transportation Services",
      "Part-time Staffing",
      "Other Services",
    ],
  },
  {
    group: "Legal, Finance & Corporate",
    categories: [
      "กฎหมาย",
      "ทนายความ",
      "ร่างสัญญา",
      "จดทะเบียนบริษัท",
      "จดสิทธิบัตร ลิขสิทธิ์",
      "ทำบัญชีและยื่นภาษี",
      "ตรวจสอบบัญชี",
      "วางแผนภาษี",
      "วางแผนการเงิน",
      "Payroll",
      "ปรึกษาปัญหาหนี้",
    ],
  },
  {
    group: "Architecture, Construction & Engineering",
    categories: [
      "ออกแบบตกแต่งภายในและภายนอก",
      "3D Perspective",
      "ออกแบบแปลน",
      "ออกแบบภูมิทัศน์",
      "ออกแบบแสงสว่าง",
      "เขียนแบบวิศวกรรมและโครงสร้าง",
      "ถอดแบบ BOQ",
      "เซ็นรับรองขออนุญาติก่อสร้าง",
      "งานวิศวกรรมระบบไฟฟ้า/สุขาภิบาล",
      "รับเหมาก่อสร้าง",
      "รีโนเวทบ้าน/คอนโด",
    ],
  },
  {
    group: "Trades, Repair & On-site Operations",
    categories: [
      "ซ่อมอุปกรณ์ไอที",
      "ซ่อมเครื่องใช้ไฟฟ้า",
      "ซ่อมรถยนต์/มอเตอร์ไซค์",
      "ช่างไฟฟ้า",
      "งานประปา",
      "ช่างแอร์",
      "ติดตั้งกล้องวงจรปิด",
      "ติดตั้งระบบไฟฟ้า",
      "ติดตั้งโซล่าเซลล์",
      "งานติดตั้งอื่นๆ",
      "บริการตรวจสอบหน้างาน",
    ],
  },
  {
    group: "Education, Learning & Coaching",
    categories: [
      "เรียนพิเศษวิชาการ",
      "ติวสอบ",
      "เรียนภาษาต่างประเทศ",
      "เรียนดนตรีและศิลปะ",
      "เรียนกีฬาและทักษะ",
      "สอนการลงทุน",
      "สอนยิงแอด",
      "สอน Excel / Power BI",
      "สอนทำเว็บไซต์/เขียนโปรแกรม",
      "คอร์สเรียน AI",
      "ผู้เชี่ยวชาญให้ความรู้เฉพาะด้าน",
    ],
  },
  {
    group: "Healthcare, Wellness & Personal Care",
    categories: [
      "นวด",
      "Personal Trainer",
      "นักจิตวิทยา / จิตแพทย์",
      "นักกายภาพบำบัด",
      "ปรึกษาแพทย์ออนไลน์",
      "พยาบาลและผู้ช่วยพยาบาล",
      "ต่อขนตา",
      "ช่างแต่งหน้า",
      "ช่างทำเล็บ",
      "เสริมสวย",
      "ช่างตัดผม",
    ],
  },
  {
    group: "Events, Entertainment & Creators",
    categories: [
      "รับจัดอีเว้นท์",
      "Wedding Planner",
      "จัดเลี้ยงนอกสถานที่",
      "ไลฟ์สด",
      "นักดนตรี/วงดนตรี",
      "จ้าง DJ",
      "นักร้อง",
      "พิธีกร MC",
      "Acting & Modeling",
      "Influencer Marketing Plan",
      "Production & Project Management",
    ],
  },
  {
    group: "Logistics, Rental & Mobility",
    categories: [
      "รถขนของ",
      "เช่าโกดังเก็บของ",
      "ขนส่งห้องเย็น",
      "เช่ารถรายวัน/รายเดือน",
      "เช่ารถตู้",
      "เช่ามอเตอร์ไซค์",
      "เช่าอุปกรณ์จัดเลี้ยง",
      "เช่ากล้อง/โปรเจคเตอร์",
      "Venue Rental",
      "คนขับรถ",
      "ตรวจสภาพรถ",
    ],
  },
  {
    group: "Pets, Lifestyle & Other",
    categories: [
      "รับจ้างเลี้ยงสัตว์",
      "อาบน้ำตัดขนสัตว์",
      "รับฝึกสุนัข",
      "หาเพื่อนทำกิจกรรม กิน เที่ยว",
      "วางแพลนเที่ยว",
      "ดูดวง โหราศาสตร์",
      "รับจ้างทำบุญ",
      "บริการเช็คของแท้ปลอม",
      "รับจองคิว",
      "งานพาร์ทไทม์",
      "อื่นๆ",
    ],
  },
];

export const JOBBOARD_MAIN_CATEGORIES: string[] = Array.from(
  new Set(JOBBOARD_CATEGORY_GROUPS.flatMap((g) => g.categories)),
);

export function getBlueprintBySurfaceAndCategory(
  surface: WorkSurface,
  category: string,
): SurfaceCategoryBlueprint | null {
  const c = String(category || "").trim().toLowerCase();
  const found = SURFACE_CATEGORY_BLUEPRINTS.find(
    (x) =>
      x.surface === surface && String(x.category).trim().toLowerCase() === c,
  );
  return found || null;
}

export function getEmploymentTypeLabel(id: string): string {
  const found = EMPLOYMENT_TYPE_OPTIONS.find((x) => x.id === id);
  return found?.label || "ไม่ระบุ";
}

const JOBBOARD_GROUP_THAI_LABELS: Record<string, string> = {
  "AI & Data": "AI และข้อมูล",
  "Marketing & Growth": "การตลาดและการเติบโต",
  "Design & Creative": "งานออกแบบและครีเอทีฟ",
  "Media Production": "งานสื่อและโปรดักชัน",
  "Programming & Tech": "โปรแกรมมิ่งและเทคโนโลยี",
  "Business & Operations": "ธุรกิจและงานปฏิบัติการ",
  "Architecture & Engineering": "สถาปัตย์และวิศวกรรม",
  "Writing & Language": "งานเขียนและภาษา",
  "Education & Training": "การศึกษาและการสอน",
  "Lifestyle & Services": "ไลฟ์สไตล์และบริการ",
  "Legal, Finance & Corporate": "กฎหมาย การเงิน และองค์กร",
  "Architecture, Construction & Engineering":
    "สถาปัตย์ ก่อสร้าง และวิศวกรรม",
  "Trades, Repair & On-site Operations":
    "ช่าง ซ่อม และงานภาคสนาม",
  "Education, Learning & Coaching": "การเรียนรู้และโค้ชชิ่ง",
  "Healthcare, Wellness & Personal Care":
    "สุขภาพ เวลเนส และการดูแลส่วนบุคคล",
  "Events, Entertainment & Creators": "อีเวนต์ บันเทิง และครีเอเตอร์",
  "Logistics, Rental & Mobility": "โลจิสติกส์ งานเช่า และการเดินทาง",
  "Pets, Lifestyle & Other": "สัตว์เลี้ยง ไลฟ์สไตล์ และอื่นๆ",
};

const JOBBOARD_CATEGORY_THAI_LABELS: Record<string, string> = {
  "AI Development": "พัฒนา AI",
  "AI Automation": "ทำระบบอัตโนมัติด้วย AI",
  Chatbot: "แชทบอท",
  "AI Tool": "เครื่องมือ AI",
  "Prompt Engineering": "ออกแบบ Prompt",
  "AI Prototype": "ต้นแบบงาน AI",
  "AI Consultant": "ที่ปรึกษา AI",
  "AI Transformation": "ทรานส์ฟอร์มธุรกิจด้วย AI",
  "Data Analysis": "วิเคราะห์ข้อมูล",
  "Data Engineering": "วิศวกรรมข้อมูล",
  "Data Science & AI": "วิทยาศาสตร์ข้อมูลและ AI",
  "Data Labeling": "ติดป้ายกำกับข้อมูล",
  "Dashboard & BI": "แดชบอร์ดและ BI",
  "Digital Marketing": "การตลาดดิจิทัล",
  "Marketing Strategy": "วางกลยุทธ์การตลาด",
  SEO: "ทำ SEO",
  "Social Media Ads": "ยิงโฆษณาโซเชียล",
  "Google Ads & YouTube Ads": "Google Ads และ YouTube Ads",
  "Creative & Content Marketing": "ครีเอทีฟและคอนเทนต์มาร์เก็ตติ้ง",
  "Influencer Marketing": "การตลาดอินฟลูเอนเซอร์",
  "PR & Communications": "ประชาสัมพันธ์และสื่อสารองค์กร",
  "Online Store & Sales": "ร้านค้าออนไลน์และงานขาย",
  "Email Marketing": "การตลาดผ่านอีเมล",
  Branding: "สร้างแบรนด์",
  "Graphic Design": "ออกแบบกราฟิก",
  "Logo Design": "ออกแบบโลโก้",
  "Banner Design": "ออกแบบแบนเนอร์",
  "Label & Packaging": "ฉลากและบรรจุภัณฑ์",
  "Print Design": "ออกแบบงานพิมพ์",
  "Presentation Design": "ออกแบบพรีเซนเทชัน",
  "3D Modeling & Render": "ขึ้นโมเดลและเรนเดอร์ 3D",
  "UI/UX Design": "ออกแบบ UI/UX",
  "Character & Mascot Design": "ออกแบบคาแรกเตอร์และมาสคอต",
  Illustration: "งานภาพประกอบ",
  "Art & Craft": "ศิลปะและงานคราฟต์",
  "Fashion Design": "ออกแบบแฟชั่น",
  "Canva Design": "ออกแบบด้วย Canva",
  "Infographic Design": "ออกแบบอินโฟกราฟิก",
  "Video Editing": "ตัดต่อวิดีโอ",
  Photography: "งานถ่ายภาพ",
  Videography: "ถ่ายวิดีโอ",
  "Motion Graphics": "โมชั่นกราฟิก",
  "Animation 2D/3D": "แอนิเมชัน 2D/3D",
  "Subtitle & Localization": "ซับไตเติลและโลคัลไลเซชัน",
  "Voice Over": "พากย์เสียง",
  "Audio Production": "โปรดักชันเสียง",
  "Podcast Production": "โปรดักชันพอดแคสต์",
  "VFX & CGI": "งาน VFX และ CGI",
  "Live Streaming Production": "โปรดักชันไลฟ์สด",
  "Web Development": "พัฒนาเว็บไซต์",
  "WordPress Development": "พัฒนา WordPress",
  "E-Commerce Development": "พัฒนาระบบ E-Commerce",
  "Mobile App Development": "พัฒนาแอปมือถือ",
  "Desktop App Development": "พัฒนาแอปเดสก์ท็อป",
  "Game Development": "พัฒนาเกม",
  "QA & Testing": "QA และทดสอบระบบ",
  "IT Solution & Support": "โซลูชันและซัพพอร์ต IT",
  "System & Network": "ระบบและเครือข่าย",
  "IT Project Management": "บริหารโปรเจกต์ไอที",
  "Website Scraping": "ดึงข้อมูลเว็บไซต์",
  "Cybersecurity Consulting": "ที่ปรึกษาความปลอดภัยไซเบอร์",
  "IoT & Hardware": "IoT และฮาร์ดแวร์",
  "RPA & Workflow Automation": "RPA และ Workflow Automation",
  "Legal Services": "บริการด้านกฎหมาย",
  "Business Registration": "จดทะเบียนธุรกิจ",
  "Accounting & Tax": "บัญชีและภาษี",
  "Financial Planning": "วางแผนการเงิน",
  Payroll: "จัดการเงินเดือน (Payroll)",
  "Debt Consulting": "ที่ปรึกษาหนี้สิน",
  "Business Advisory": "ที่ปรึกษาธุรกิจ",
  "Startup Consulting": "ที่ปรึกษาสตาร์ทอัพ",
  "HR Consulting": "ที่ปรึกษาทรัพยากรบุคคล",
  "Business Assistant": "ผู้ช่วยธุรกิจ",
  "Procurement & Sourcing": "จัดซื้อและจัดหา",
  "OEM & Manufacturing": "OEM และการผลิต",
  "Architecture Design": "ออกแบบสถาปัตยกรรม",
  "Interior Design": "ออกแบบตกแต่งภายใน",
  "Landscape Design": "ออกแบบภูมิทัศน์",
  "Lighting Design": "ออกแบบแสงสว่าง",
  "Engineering Drawing": "เขียนแบบวิศวกรรม",
  "Structural Engineering": "วิศวกรรมโครงสร้าง",
  "BOQ & Costing": "ถอดแบบ BOQ และประเมินราคา",
  "Construction Consulting": "ที่ปรึกษางานก่อสร้าง",
  "Content Writing": "เขียนคอนเทนต์",
  "SEO Article Writing": "เขียนบทความ SEO",
  Copywriting: "เขียนคำโฆษณา",
  "Research Writing": "เขียนงานวิจัย",
  Translation: "แปลภาษา",
  Interpretation: "ล่าม",
  Proofreading: "พิสูจน์อักษร",
  Transcription: "ถอดเทป",
  "Academic Support": "ช่วยงานวิชาการ",
  Tutoring: "ติวเตอร์",
  "Language Coaching": "โค้ชภาษา",
  "Coding Instructor": "ผู้สอนเขียนโปรแกรม",
  "Digital Marketing Instructor": "ผู้สอนการตลาดดิจิทัล",
  "Sports Coaching": "โค้ชกีฬา",
  "Music & Art Coaching": "โค้ชดนตรีและศิลปะ",
  "Professional Skill Training": "อบรมทักษะวิชาชีพ",
  "Beauty Services": "บริการความงาม",
  "Wellness Services": "บริการสุขภาพและเวลเนส",
  "Home Cleaning Services": "บริการทำความสะอาดบ้าน",
  "Event & Organizer": "งานอีเวนต์และออแกไนเซอร์",
  "Travel Planning": "วางแผนท่องเที่ยว",
  "Pet Services": "บริการสัตว์เลี้ยง",
  "Rental Services": "บริการให้เช่า",
  "Transportation Services": "บริการขนส่ง",
  "Part-time Staffing": "จัดหาพนักงานพาร์ทไทม์",
  "Other Services": "บริการอื่นๆ",
  "3D Perspective": "ภาพ 3D Perspective",
  "Personal Trainer": "เทรนเนอร์ส่วนตัว",
  "Wedding Planner": "แพลนเนอร์งานแต่ง",
  "Acting & Modeling": "งานแสดงและโมเดลลิ่ง",
  "Influencer Marketing Plan": "วางแผนอินฟลูเอนเซอร์",
  "Production & Project Management": "โปรดักชันและบริหารโปรเจกต์",
  "Venue Rental": "เช่าสถานที่",
};

export function getJobboardGroupLabel(group: string): string {
  return JOBBOARD_GROUP_THAI_LABELS[group] || group;
}

export function getJobboardCategoryLabel(category: string): string {
  return JOBBOARD_CATEGORY_THAI_LABELS[category] || category;
}

export function getRoutingMatrixBySurface(
  surface: WorkSurface,
): ProfessionRoutingMatrixItem[] {
  return PROFESSION_ROUTING_MATRIX.filter(
    (x) =>
      x.primary_surface === surface || x.secondary_surfaces.includes(surface),
  );
}

function normalizeKeywordText(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function suggestRoutingByKeywords(
  rawInput: string,
  options?: SuggestRoutingOptions,
): RoutingSuggestion | null {
  const text = normalizeKeywordText(rawInput);
  if (!text) return null;

  const urgentMatched = URGENT_HINTS.filter((k) => text.includes(k));
  const fieldMatched = FIELD_SERVICE_HINTS.filter((k) => text.includes(k));
  const provinceMatched = PROVINCE_ALIAS_KEYWORDS.filter((k) =>
    text.includes(k.toLowerCase()),
  );
  if (urgentMatched.length > 0 && fieldMatched.length > 0) {
    return {
      surface: "match_job",
      profession: "งานด่วนภาคสนาม",
      matched_keywords: [...urgentMatched, ...fieldMatched, ...provinceMatched],
      confidence: 0.95,
    };
  }

  let matchedVertical: VerticalPriorityRule | null = null;
  for (const v of VERTICAL_PRIORITY_RULES) {
    if (v.keywords.some((k) => text.includes(k.toLowerCase()))) {
      matchedVertical = v;
      break;
    }
  }

  let best: RoutingSuggestion | null = null;
  const getSurfaceBoost = (
    verticalName: string | null | undefined,
    surface: WorkSurface,
  ): number => {
    const base = Number(
      matchedVertical?.surface_boost?.[surface] ||
        (verticalName && matchedVertical?.vertical === verticalName
          ? matchedVertical?.surface_boost?.[surface]
          : 0) ||
        0,
    );
    const override = Number(
      (verticalName &&
        options?.verticalWeightOverrides &&
        options.verticalWeightOverrides[verticalName]?.[surface]) ||
        0,
    );
    return base + override;
  };
  for (const rule of PROFESSION_ALIAS_KEYWORD_RULES) {
    const hit = rule.keywords.filter((k) => text.includes(k.toLowerCase()));
    if (!hit.length) continue;
    let confidence = Math.min(0.9, 0.45 + hit.length * 0.12);
    if (matchedVertical) {
      confidence = Math.min(
        0.96,
        confidence +
          getSurfaceBoost(matchedVertical.vertical, rule.preferred_surface),
      );
    }
    if (provinceMatched.length > 0 && rule.preferred_surface === "match_job") {
      confidence = Math.min(0.98, confidence + 0.06);
    }
    if (!best || confidence > best.confidence) {
      best = {
        surface: rule.preferred_surface,
        profession: rule.profession,
        matched_keywords: [...hit, ...provinceMatched],
        confidence,
        vertical: matchedVertical?.vertical || null,
      };
    }
  }

  if (!best) {
    for (const rule of AUTO_GENERATED_ALIAS_RULES) {
      const hit = rule.keywords.filter((k) => text.includes(k.toLowerCase()));
      if (!hit.length) continue;
      let confidence = Math.min(0.78, 0.4 + hit.length * 0.08);
      if (matchedVertical) {
        confidence = Math.min(
          0.9,
          confidence +
            getSurfaceBoost(matchedVertical.vertical, rule.preferred_surface),
        );
      }
      if (provinceMatched.length > 0 && rule.preferred_surface === "match_job") {
        confidence = Math.min(0.94, confidence + 0.05);
      }
      if (!best || confidence > best.confidence) {
        best = {
          surface: rule.preferred_surface,
          profession: rule.profession,
          matched_keywords: [...hit, ...provinceMatched],
          confidence,
          vertical: matchedVertical?.vertical || null,
        };
      }
    }
  }

  if (best) return best;

  if (
    ["คลิป", "portfolio", "before after", "showreel", "ผลงาน"].some((k) =>
      text.includes(k),
    )
  ) {
    return {
      surface: "videofeed",
      profession: "งานที่เหมาะโชว์ผลงานด้วยคลิป",
      matched_keywords: ["portfolio"],
      confidence: 0.62,
      vertical: matchedVertical?.vertical || null,
    };
  }

  const boostedJobboard =
    0.5 +
    Number(
      matchedVertical
        ? getSurfaceBoost(matchedVertical.vertical, "jobboard")
        : 0,
    );
  return {
    surface: "jobboard",
    profession: "งานโปรเจกต์ทั่วไป",
    matched_keywords: [],
    confidence: Math.min(0.86, boostedJobboard),
    vertical: matchedVertical?.vertical || null,
  };
}

export function buildRoutingMatrixCsv(): string {
  const header = [
    "profession",
    "primary_surface",
    "secondary_surfaces",
    "recommended_employment_types",
    "province_examples",
  ];
  const esc = (v: string) => `"${String(v || "").replace(/"/g, '""')}"`;
  const rows = PROFESSION_ROUTING_MATRIX.map((r) =>
    [
      r.profession,
      r.primary_surface,
      r.secondary_surfaces.join("|"),
      r.recommended_employment_types.join("|"),
      r.province_examples.join("|"),
    ]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n") + "\n";
}

