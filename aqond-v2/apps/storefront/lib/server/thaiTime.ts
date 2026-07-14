export const BANGKOK_TZ = 'Asia/Bangkok';

export function bangkokNowParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: BANGKOK_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    hours: parseInt(parts.hour, 10),
    minutes: parseInt(parts.minute, 10),
    day: parts.day,
    month: parts.month,
    year: parts.year,
    weekday: parts.weekday,
  };
}

/** นาทีตั้งแต่เที่ยงคืน ตามเวลาไทย */
export function bangkokMinutesOfDay(date = new Date()): number {
  const { hours, minutes } = bangkokNowParts(date);
  return hours * 60 + minutes;
}

export function formatBangkokTimeLabel(date = new Date()): string {
  return date.toLocaleString('th-TH', {
    timeZone: BANGKOK_TZ,
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
}

export function bangkokScheduleLabel(openTime: string, closeTime: string): string {
  return `เวลาไทย (ICT) · เปิด ${openTime}–${closeTime}`;
}

/** YYYY-MM-DD ตามเวลาไทย */
export function bangkokDateKey(date = new Date()): string {
  const p = bangkokNowParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

/** YYYY-MM ตามเวลาไทย */
export function bangkokMonthKey(date = new Date()): string {
  const p = bangkokNowParts(date);
  return `${p.year}-${p.month}`;
}

/** จำนวนเดือนตั้งแต่เปิดร้าน (เดือนแรก = 1) ตามปฏิทินไทย */
export function shopMonthIndex(shopStartIso: string, date = new Date()): number {
  const start = bangkokNowParts(new Date(shopStartIso));
  const now = bangkokNowParts(date);
  const sy = parseInt(start.year, 10);
  const sm = parseInt(start.month, 10);
  const ny = parseInt(now.year, 10);
  const nm = parseInt(now.month, 10);
  return (ny - sy) * 12 + (nm - sm) + 1;
}

/** อยู่ในปีแรกของร้าน (12 เดือนแรก) */
export function isShopFirstYear(shopStartIso: string, date = new Date()): boolean {
  return shopMonthIndex(shopStartIso, date) <= 12;
}
