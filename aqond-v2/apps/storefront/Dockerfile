FROM node:20-alpine AS deps
WORKDIR /app
COPY packages/ui ./packages/ui
COPY apps/storefront/package.json ./apps/storefront/
WORKDIR /app/apps/storefront
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/apps/storefront/node_modules ./apps/storefront/node_modules
COPY packages/ui ./packages/ui
COPY apps/storefront ./apps/storefront
WORKDIR /app/apps/storefront
ENV NEXT_TELEMETRY_DISABLED=1
ARG BFF_URL=http://bff-svc:8132
ENV BFF_URL=$BFF_URL
ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_VAPID_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=aqond-production.firebaseapp.com
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=aqond-production
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=aqond-production.firebasestorage.app
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=187301416431
ARG NEXT_PUBLIC_FIREBASE_APP_ID=1:187301416431:web:774a67a1d8554faccbfa1a
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_VAPID_KEY=$NEXT_PUBLIC_FIREBASE_VAPID_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build /app/apps/storefront/public ./apps/storefront/public
COPY --from=build --chown=nextjs:nodejs /app/apps/storefront/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/storefront/.next/static ./apps/storefront/.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "apps/storefront/server.js"]
