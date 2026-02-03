
FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production

# Copy source code
COPY src ./src
COPY tsconfig.json ./
COPY server.js ./ 
# COPY .env ./

# Create non-root user
RUN groupadd -r -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs -s /bin/bash -m nextjs
# RUN addgroup -g 1001 -S nodejs
# RUN adduser -S nextjs -u 1001

# Change ownership
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {if(r.statusCode===200)process.exit(0);process.exit(1)}).on('error',()=>process.exit(1))"

# Start application
CMD ["npm", "start"]
