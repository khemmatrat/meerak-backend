/** Parse F / F1 / F-XXXXXXXX from live chat text */
export function parseFCommand(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  const upper = t.toUpperCase();

  // Exact F or CF
  if (/^(CF|F)$/i.test(t)) return { slot: null, fCode: null, raw: "F" };

  // F1, F2, ... Fn
  const slotMatch = upper.match(/^F(\d{1,2})$/);
  if (slotMatch) return { slot: Number(slotMatch[1]), fCode: null, raw: slotMatch[0] };

  // F-XXXXXXXX full code
  const codeMatch = upper.match(/^F-([A-Z0-9]{4,12})$/);
  if (codeMatch) return { slot: null, fCode: `F-${codeMatch[1]}`, raw: codeMatch[0] };

  // Thai: พิมพ์ F
  if (/^f\s*$/i.test(t) || /^(cf|cf\s*)$/i.test(t)) return { slot: null, fCode: null, raw: "F" };

  return null;
}

export function buildFCode(externalId, slot) {
  const suffix = String(externalId || "00000000").slice(-8).toUpperCase();
  if (slot != null) return `F${slot}`;
  return `F-${suffix}`;
}
