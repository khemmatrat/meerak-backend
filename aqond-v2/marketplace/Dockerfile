FROM node:20-alpine
WORKDIR /app
COPY sync-service/package.json ./
RUN npm install --omit=dev
COPY sync-service/server.js ./
COPY sync-service/lib ./lib
COPY public/shop.html ./public/shop.html
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
