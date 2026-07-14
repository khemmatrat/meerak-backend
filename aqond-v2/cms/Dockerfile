FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY lib ./lib
COPY public ./public
EXPOSE 8094
CMD ["node", "server.js"]
