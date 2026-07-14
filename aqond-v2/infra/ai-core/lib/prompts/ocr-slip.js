/** OCR shipping slip / PromptPay slip */
export function ocrSlipPrompt() {
  return `Read this shipping label or payment slip image. Return JSON only:
{
  "tracking_no": "",
  "carrier": "",
  "order_id": "",
  "recipient_name": "",
  "recipient_postal": "",
  "amount_thb": 0,
  "payment_type": "shipping|promptpay|cod",
  "confidence": 0.0
}
Use empty string if unknown. tracking_no is barcode number. carrier examples: J&T, Kerry, Thailand Post.`;
}

export function ruleBasedOcrSlip(_imageHint) {
  return {
    tracking_no: "",
    carrier: "",
    order_id: "",
    recipient_name: "",
    recipient_postal: "",
    amount_thb: 0,
    payment_type: "shipping",
    confidence: 0.3,
    source: "rules",
  };
}
