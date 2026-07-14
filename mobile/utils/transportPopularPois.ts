/**
 * Popular POIs per transport region — used for chips, search scoring, and quick picks.
 */

import type { TransportRegionId } from "./transportRegions";

export type TransportPoi = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  keywords: string[];
};

export const BANGKOK_POPULAR_PLACES: TransportPoi[] = [
  {
    id: "khao-san",
    label: "ตรอกข้าวสาร (Khao San Road)",
    lat: 13.75804,
    lng: 100.49503,
    keywords: ["ข้าวสาร", "khao san", "ตรอก", "คอกข้าวสาร"],
  },
  {
    id: "yaowarat",
    label: "ถนนเยาวราช (Yaowarat)",
    lat: 13.7408,
    lng: 100.5083,
    keywords: ["เยาวราช", "yaowarat", "ไชน่าทาวน์", "chinatown"],
  },
  {
    id: "lumpini",
    label: "สวนลุมพินี (Lumphini Park)",
    lat: 13.7307,
    lng: 100.5418,
    keywords: ["สวนลุม", "ลุมพินี", "lumpini", "lumphini"],
  },
  {
    id: "soi-nana",
    label: "BTS นานา / ซอยนานา (Nana)",
    lat: 13.7439,
    lng: 100.5533,
    keywords: ["นานา", "nana", "ซอยนานา", "สุขุมวิท"],
  },
  {
    id: "iconsiam",
    label: "ไอคอนสยาม (ICONSIAM)",
    lat: 13.7266,
    lng: 100.5098,
    keywords: ["iconsiam", "ไอคอน", "ไอคอนสยาม"],
  },
  {
    id: "central-world",
    label: "เซ็นทรัลเวิลด์ (CentralWorld)",
    lat: 13.7466,
    lng: 100.5395,
    keywords: ["centralworld", "เซ็นทรัล", "central world", "เซ็นทรัลเวิลด์"],
  },
  {
    id: "mahanakhon",
    label: "คิง เพาเวอร์ มหานคร (King Power Mahanakhon)",
    lat: 13.7233,
    lng: 100.5147,
    keywords: ["มหานคร", "mahanakhon", "king power", "ตึกมหานคร"],
  },
  {
    id: "one-bangkok",
    label: "วัน แบงค็อก (ONE BANGKOK)",
    lat: 13.7375,
    lng: 100.5415,
    keywords: ["one bangkok", "วันแบงค็อก", "onebangkok"],
  },
  {
    id: "magnolias-waterfront",
    label: "แมกโนเลียส์ วอเตอร์ฟรอนท์ เรสซิเดนเซส @ ไอคอนสยาม",
    lat: 13.726,
    lng: 100.5105,
    keywords: ["magnolias", "waterfront", "แมกโนเลียส์", "ไอคอนสยาม"],
  },
  {
    id: "chatuchak",
    label: "ตลาดนัดจตุจักร (Chatuchak Weekend Market)",
    lat: 13.7999,
    lng: 100.55,
    keywords: ["จตุจักร", "chatuchak", "จตุจักรวีคเอนด์", "ตลาดจตุจักร"],
  },
  {
    id: "siam-paragon",
    label: "สยามพารากอน (Siam Paragon)",
    lat: 13.7465,
    lng: 100.5347,
    keywords: ["สยาม", "paragon", "พารากอน", "siam"],
  },
  {
    id: "mbk",
    label: "MBK Center",
    lat: 13.7448,
    lng: 100.5298,
    keywords: ["mbk", "มาบุญครอง"],
  },
  {
    id: "terminal-21",
    label: "Terminal 21 (อโศก)",
    lat: 13.7374,
    lng: 100.5603,
    keywords: ["terminal 21", "เทอร์มินัล", "อโศก", "asok"],
  },
  {
    id: "emquartier",
    label: "The EmQuartier / EmSphere",
    lat: 13.7314,
    lng: 100.5691,
    keywords: ["emquartier", "emsphere", "เอ็มควอเทียร์"],
  },
  {
    id: "suvarnabhumi",
    label: "สนามบินสุวรรณภูมิ (BKK)",
    lat: 13.69,
    lng: 100.7501,
    keywords: ["สุวรรณภูมิ", "suvarnabhumi", "bkk", "สนามบิน"],
  },
  {
    id: "don-mueang",
    label: "สนามบินดอนเมือง (DMK)",
    lat: 13.9126,
    lng: 100.607,
    keywords: ["ดอนเมือง", "don mueang", "dmk"],
  },
  {
    id: "asiatique",
    label: "เอเชียทีค เดอะ ริเวอร์ฟรอนต์ (Asiatique)",
    lat: 13.7048,
    lng: 100.5032,
    keywords: ["asiatique", "เอเชียทีค"],
  },
  {
    id: "platinum",
    label: "แพลทินัม ประตูน้ำ (Platinum)",
    lat: 13.7503,
    lng: 100.5395,
    keywords: ["platinum", "ประตูน้ำ", "แพลทินัม"],
  },
  {
    id: "sathorn-pier",
    label: "ท่าเรือสาทร (Sathorn Pier)",
    lat: 13.727,
    lng: 100.5115,
    keywords: ["สาทร", "sathorn", "ท่าเรือ"],
  },
];

const CHIANG_MAI_POIS: TransportPoi[] = [
  {
    id: "cm-night-bazaar",
    label: "ไนท์บาซาร์ เชียงใหม่ (Night Bazaar)",
    lat: 18.7851,
    lng: 99.0019,
    keywords: ["night bazaar", "ไนท์บาซาร์", "กาดคืน"],
  },
  {
    id: "cm-old-city",
    label: "ประตูหัวเมือง / คูเมือง (Old City Gate)",
    lat: 18.7883,
    lng: 98.9853,
    keywords: ["คูเมือง", "ประตูหัวเมือง", "old city", "moat"],
  },
  {
    id: "cm-nimman",
    label: "ถนนนิมมานเหมินท์ (Nimman)",
    lat: 18.7965,
    lng: 98.9653,
    keywords: ["nimman", "นิมมาน", "นิมมานเหมินท์"],
  },
  {
    id: "cm-maya",
    label: "MAYA Lifestyle / Think Park",
    lat: 18.8015,
    lng: 98.9653,
    keywords: ["maya", "think park"],
  },
  {
    id: "cm-central-festival",
    label: "Central Festival Chiang Mai",
    lat: 18.8089,
    lng: 99.0182,
    keywords: ["central festival", "เซ็นทรัล เชียงใหม่"],
  },
  {
    id: "cm-airport",
    label: "สนามบินเชียงใหม่ (CNX)",
    lat: 18.7669,
    lng: 98.9626,
    keywords: ["สนามบิน", "cnx", "airport"],
  },
  {
    id: "cm-zoo",
    label: "สวนสัตว์เชียงใหม่",
    lat: 18.8108,
    lng: 98.9484,
    keywords: ["สวนสัตว์", "zoo"],
  },
];

const PHUKET_POIS: TransportPoi[] = [
  {
    id: "phuket-patong",
    label: "หาดป่าตอง (Patong Beach)",
    lat: 7.8964,
    lng: 98.3022,
    keywords: ["ป่าตอง", "patong", "หาดป่าตอง"],
  },
  {
    id: "phuket-central",
    label: "Central Phuket / Floresta",
    lat: 7.9883,
    lng: 98.3653,
    keywords: ["central phuket", "phuket floresta"],
  },
  {
    id: "phuket-old-town",
    label: "เมืองเก่าภูเก็ต (Old Town)",
    lat: 7.8846,
    lng: 98.3873,
    keywords: ["old town", "เมืองเก่า", "ถนนยิบซี"],
  },
  {
    id: "phuket-airport",
    label: "สนามบินภูเก็ต (HKT)",
    lat: 8.1132,
    lng: 98.3169,
    keywords: ["สนามบิน", "hkt", "airport"],
  },
  {
    id: "phuket-bangla",
    label: "ถนนบางลา (Bangla Road)",
    lat: 7.896,
    lng: 98.2982,
    keywords: ["bangla", "บางลา"],
  },
  {
    id: "phuket-kata",
    label: "หาดกะตะ (Kata Beach)",
    lat: 7.8225,
    lng: 98.2982,
    keywords: ["กะตะ", "kata"],
  },
];

const PATTAYA_POIS: TransportPoi[] = [
  {
    id: "pattaya-walking",
    label: "Walking Street (พัทยา)",
    lat: 12.9236,
    lng: 100.8715,
    keywords: ["walking street", "วอล์กกิ้ง สตรีท"],
  },
  {
    id: "pattaya-beach",
    label: "หาดพัทยา (Pattaya Beach)",
    lat: 12.9236,
    lng: 100.8825,
    keywords: ["หาดพัทยา", "pattaya beach"],
  },
  {
    id: "pattaya-terminal21",
    label: "Terminal 21 Pattaya",
    lat: 12.9345,
    lng: 100.889,
    keywords: ["terminal 21", "เทอร์มินัล พัทยา"],
  },
  {
    id: "pattaya-jomtien",
    label: "หาดจอมเทียน (Jomtien Beach)",
    lat: 12.8565,
    lng: 100.908,
    keywords: ["จอมเทียน", "jomtien"],
  },
];

const CHONBURI_POIS: TransportPoi[] = [
  {
    id: "cb-central",
    label: "Central Chonburi / Central Plaza",
    lat: 13.3611,
    lng: 100.9847,
    keywords: ["central ชลบุรี", "chonburi central"],
  },
  {
    id: "cb-temple",
    label: "หลวงพ่อโสธร / วัดหลวงพ่อโสธร",
    lat: 13.4032,
    lng: 101.0055,
    keywords: ["โสธร", "wat soi thong"],
  },
  {
    id: "cb-tiger",
    label: "สวนเสือศรีราชา (Tiger Zoo area)",
    lat: 13.1442,
    lng: 101.0055,
    keywords: ["สวนเสือ", "ศรีราชา", "tiger"],
  },
];

const RATCHABURI_POIS: TransportPoi[] = [
  {
    id: "rb-town",
    label: "ตัวเมืองราชบุรี (Ratchaburi Town)",
    lat: 13.5283,
    lng: 99.8134,
    keywords: ["ราชบุรี", "ratchaburi", "town"],
  },
  {
    id: "rb-dam",
    label: "เขื่อนภูมิพล / อุทยานแห่งชาติ",
    lat: 13.965,
    lng: 99.642,
    keywords: ["เขื่อน", "ภูมิพล", "dam"],
  },
];

const KHON_KAEN_POIS: TransportPoi[] = [
  {
    id: "kk-central",
    label: "เซ็นทรัล ขอนแก่น (Central Khon Kaen)",
    lat: 16.433,
    lng: 102.826,
    keywords: ["central", "เซ็นทรัล", "ขอนแก่น", "khon kaen"],
  },
  {
    id: "kk-airport",
    label: "สนามบินขอนแก่น (KKC)",
    lat: 16.464,
    lng: 102.789,
    keywords: ["สนามบิน", "kkc", "airport"],
  },
  {
    id: "kk-bua",
    label: "บึงแก่นนคร / สวนสาธารณะกลางเมือง",
    lat: 16.432,
    lng: 102.824,
    keywords: ["บึง", "bua"],
  },
];

const KORAT_POIS: TransportPoi[] = [
  {
    id: "korat-terminal21",
    label: "Terminal 21 โคราช",
    lat: 14.981,
    lng: 102.076,
    keywords: ["terminal 21", "โคราช", "korat"],
  },
  {
    id: "korat-central",
    label: "เดอะมอลล์ โคราช / ย่านมะเริง",
    lat: 14.98,
    lng: 102.1,
    keywords: ["the mall", "มะเริง", "korat"],
  },
  {
    id: "korat-saveone",
    label: "Save One / โลตัส โคราช",
    lat: 14.995,
    lng: 102.12,
    keywords: ["save one", "lotus", "โลตัส"],
  },
];

const HAT_YAI_POIS: TransportPoi[] = [
  {
    id: "hy-central",
    label: "เซ็นทรัลเฟสติวัล หาดใหญ่",
    lat: 7.018,
    lng: 100.474,
    keywords: ["central", "เซ็นทรัล", "หาดใหญ่", "hat yai"],
  },
  {
    id: "hy-kimyong",
    label: "ตลาดกิมหยง (Kim Yong Market)",
    lat: 7.005,
    lng: 100.471,
    keywords: ["กิมหยง", "kim yong", "ตลาด"],
  },
  {
    id: "hy-train",
    label: "สถานีรถไฟหาดใหญ่",
    lat: 7.006,
    lng: 100.556,
    keywords: ["สถานี", "train", "รถไฟ"],
  },
];

const BURIRAM_POIS: TransportPoi[] = [
  {
    id: "br-chang",
    label: "ช้างอารีนา / ไอโมบาย สเตเดียม",
    lat: 14.965,
    lng: 103.094,
    keywords: ["ช้าง", "chang arena", "buriram"],
  },
  {
    id: "br-town",
    label: "ตัวเมืองบุรีรัมย์",
    lat: 14.993,
    lng: 103.103,
    keywords: ["บุรีรัมย์", "buriram", "town"],
  },
];

const UDON_POIS: TransportPoi[] = [
  {
    id: "ud-central",
    label: "เซ็นทรัล อุดรธานี",
    lat: 17.406,
    lng: 102.808,
    keywords: ["central", "เซ็นทรัล", "อุดร", "udon"],
  },
  {
    id: "ud-nong",
    label: "หนองประจักษ์ / สวนสาธารณะ",
    lat: 17.415,
    lng: 102.785,
    keywords: ["หนองประจักษ์", "nong prajak"],
  },
];

const POPULAR_BY_REGION: Record<TransportRegionId, TransportPoi[]> = {
  bangkok: BANGKOK_POPULAR_PLACES,
  chiang_mai: CHIANG_MAI_POIS,
  phuket: PHUKET_POIS,
  pattaya: PATTAYA_POIS,
  chonburi: CHONBURI_POIS,
  ratchaburi: RATCHABURI_POIS,
  khon_kaen: KHON_KAEN_POIS,
  korat: KORAT_POIS,
  hat_yai: HAT_YAI_POIS,
  buriram: BURIRAM_POIS,
  udon_thani: UDON_POIS,
};

/** Default “central” chip per region (FAVORITE_PLACES central) */
export const CENTRAL_LANDMARK_ID: Record<TransportRegionId, string> = {
  bangkok: "central-world",
  chiang_mai: "cm-central-festival",
  phuket: "phuket-central",
  pattaya: "pattaya-terminal21",
  chonburi: "cb-central",
  ratchaburi: "rb-town",
  khon_kaen: "kk-central",
  korat: "korat-terminal21",
  hat_yai: "hy-central",
  buriram: "br-chang",
  udon_thani: "ud-central",
};

export function getPopularPlacesForRegion(regionId: TransportRegionId): TransportPoi[] {
  return POPULAR_BY_REGION[regionId] ?? BANGKOK_POPULAR_PLACES;
}

export function getPoiById(id: string): TransportPoi | undefined {
  for (const list of Object.values(POPULAR_BY_REGION)) {
    const p = list.find((x) => x.id === id);
    if (p) return p;
  }
  return undefined;
}

export function getCentralLandmarkPoi(regionId: TransportRegionId): TransportPoi | undefined {
  return getPoiById(CENTRAL_LANDMARK_ID[regionId] ?? "central-world");
}
