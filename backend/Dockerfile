# AQOND Backend - สำหรับ docker-compose.golive
# ใช้ Node 20, มี ffmpeg สำหรับ video processing
FROM node:20-alpine

# ffmpeg + ฟอนต์สำหรับ drawtext (ลายน้ำ AQOND / ข้อความไทยบน end card)
RUN apk add --no-cache ffmpeg fontconfig ttf-dejavu font-noto font-noto-thai

# lib for sharp (image processing)
RUN apk add --no-cache libc6-compat vips-dev build-base

WORKDIR /app/backend

# Copy package files
COPY package*.json ./

# Install production deps only
RUN npm ci --omit=dev

# Copy source
COPY . .

# ล้ม build ถ้าซอร์สไม่ครบ (บน VPS ถ้าสังเกต context ~25KB แทนหลาย MB → โฟลเดอร์ backend-1.2 ว่างเกิน / ไม่มี lib/)
RUN test -f lib/paysoEnvFlag.js || (echo >&2 "[Dockerfile] ไม่พบ lib/paysoEnvFlag.js — อัปโหลดทั้งเมกา meerak/backend/ รวม lib/ เข้า backend-1.2 ให้ครบแล้ว build ใหม่" && exit 1)
RUN test -f lib/jarvis/voiceLib/index.js || (echo >&2 "[Dockerfile] ไม่พบ lib/jarvis/voiceLib/ — อัปโหลด backend/lib/jarvis/voiceLib/ ให้ครบแล้ว build ใหม่" && exit 1)

EXPOSE 3001

CMD ["node", "server.js"]
