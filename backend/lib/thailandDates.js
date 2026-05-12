/**
 * Calendar helpers in Asia/Bangkok (no extra deps).
 */

/** Next calendar Thursday strictly after "today" in Bangkok (YYYY-MM-DD). */
export function nextThursdayAfterTodayBangkokYmd() {
  const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' });
  const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' });
  for (let i = 1; i <= 14; i++) {
    const d = new Date(Date.now() + i * 86400000);
    if (wdFmt.format(d) === 'Thu') return ymdFmt.format(d);
  }
  return ymdFmt.format(new Date());
}
