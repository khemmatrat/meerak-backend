FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY lib ./lib
COPY schemas ./schemas
EXPOSE 8100
CMD ["node", "server.js"]
