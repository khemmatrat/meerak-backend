/** Parse Thai shipping address from free text */
export function ruleBasedAddressParse(text) {
  const t = String(text || "").trim();
  const postal = (t.match(/\b(\d{5})\b/) || [])[1] || "";
  const phone = (t.match(/(0\d{8,9})/) || [])[1] || "";
  const lines = t.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const recipient = lines[0] || "";
  const line1 = lines[1] || lines[0] || "";
  const city = lines[2] || "กรุงเทพมหานคร";
  return {
    country: "TH",
    recipient,
    line1,
    line2: lines[3] || "",
    city,
    state: "",
    postal_code: postal,
    phone,
    region: "TH",
  };
}

export function addressParsePrompt(text) {
  return `Parse this Thai shipping address into JSON only:
{"recipient":"","line1":"","line2":"","city":"","state":"","postal_code":"","phone":"","country":"TH"}

Text:
${text}`;
}
