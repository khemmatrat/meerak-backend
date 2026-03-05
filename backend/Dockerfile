# AQOND Backend - สำหรับ docker-compose.golive
# ใช้ Node 20, มี ffmpeg สำหรับ video processing
FROM node:20-alpine

# ติดตั้ง ffmpeg สำหรับ video/watermark (fluent-ffmpeg)
RUN apk add --no-cache ffmpeg

# lib for sharp (image processing)
RUN apk add --no-cache libc6-compat vips-dev build-base

WORKDIR /app/backend

# Copy package files
COPY package*.json ./

# Install production deps only
RUN npm ci --omit=dev

# Copy source
COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
