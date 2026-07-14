FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY lib ./lib
COPY public ./public
EXPOSE 8092
CMD ["node", "server.js"]