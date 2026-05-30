# ==========================================
# Stage 1: Build static assets
# ==========================================
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ==========================================
# Stage 2: Final runner environment
# ==========================================
FROM node:18-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/vite.config.ts ./vite.config.ts

# Configure file permissions for the default 'node' user
RUN chown -R node:node /usr/src/app

# Run container as non-root user
USER node

# Expose internal Vite preview port
EXPOSE 3000

# Start Vite production preview server
CMD ["npm", "run", "preview"]
