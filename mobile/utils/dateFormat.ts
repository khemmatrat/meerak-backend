/**
 * Convert ISO date (UTC from backend) to Thai time (Asia/Bangkok) for display.
 */
const BANGKOK = 'Asia/Bangkok';

export function formatDateThai(
  isoOrDate: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeZone: BANGKOK }
): string {
  if (isoOrDate == null) return '';
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('th-TH', { ...options, timeZone: options.timeZone ?? BANGKOK }).format(d);
}

export function formatDateThaiShort(isoOrDate: string | Date | null | undefined): string {
  return formatDateThai(isoOrDate, { dateStyle: 'short', timeZone: BANGKOK });
}
