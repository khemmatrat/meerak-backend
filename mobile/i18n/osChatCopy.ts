/** Lightweight TH/EN strings for OS chat shell */
export function osChatCopy(lang: string) {
  if (lang === "th") {
    return {
      welcome:
        "สวัสดีครับ ยินดีต้อนรับสู่ AQOND AI Assistant — อยากให้ช่วยหาสินค้า บริการ จองคิว หรือจับคู่งานส่วนไหนดีครับ?",
      newChat:
        "สวัสดีครับ เริ่มแชทใหม่แล้ว — อยากให้ช่วยหาสินค้า บริการ จองคิว หรือจับคู่งานส่วนไหนดีครับ?",
      sessionOpen: "เปิดเซสชันนี้แล้วครับ — พิมพ์ต่อได้เลย",
      typing: "กำลังค้นหา...",
      placeholder: "พิมพ์ข้อความ...",
      fav: "โปรด",
      cart: "รถเข็น",
      openAll: "เปิดผลค้นหาทั้งหมดใน Marketplace",
      contact: "ติดต่อ / ดูโปรไฟล์",
      error: "ขออภัยครับ ระบบ AI ขัดข้องชั่วคราว ลองใหม่อีกครั้งได้เลยครับ",
      aiOs: "AQOND OS",
      upgrade: "Upgrade to Pro",
      recent: "แชทล่าสุด",
      favorites: "รายการโปรด",
    };
  }
  return {
    welcome:
      "Hi — welcome to AQOND AI Assistant. Looking for products, services, bookings, or jobs?",
    newChat: "New chat started — how can I help with products, services, bookings, or jobs?",
    sessionOpen: "Session ready — continue typing anytime.",
    typing: "Searching...",
    placeholder: "Type a message...",
    fav: "Save",
    cart: "Cart",
    openAll: "Open all results in Marketplace",
    contact: "Contact / View profile",
    error: "Sorry — AI is temporarily unavailable. Please try again.",
    aiOs: "AQOND OS",
    upgrade: "Upgrade to Pro",
    recent: "Recent chats",
    favorites: "Favorites",
  };
}
