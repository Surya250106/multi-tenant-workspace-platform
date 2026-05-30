# ==========================================
# Stage 1: Dependency Installation & Build
# ==========================================
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Install openssl for Prisma engines
RUN apk add --no-cache openssl libc6-compat

# Copy dependency files
COPY package*.json ./

# Install development dependencies to run builds
RUN npm ci

# Copy database schemas first
COPY src/prisma/schema.prisma ./src/prisma/

# Generate Prisma Client
RUN npx prisma generate --schema=./src/prisma/schema.prisma

# Copy remaining source code
COPY . .

# Compile TypeScript
RUN npm run build

# Remove development dependencies and clean cache
RUN npm prune --production

# ==========================================
# Stage 2: Final Secure Runner Image
# ==========================================
FROM node:18-alpine AS runner

WORKDIR /usr/src/app

# Set non-root context variables
ENV NODE_ENV=production
ENV PORT=8080

# Install runtime dependencies (Prisma needs openssl)
RUN apk add --no-cache openssl libc6-compat

# Copy built application and required structures from builder
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/src/prisma ./src/prisma
COPY --from=builder /usr/src/app/seeds ./seeds
COPY --from=builder /usr/src/app/entrypoint.sh ./entrypoint.sh

# Secure environment: configure file ownership for non-root 'node' user
RUN chown -R node:node /usr/src/app && chmod +x ./entrypoint.sh

# Run container as non-root user
USER node

# Expose internal API port
EXPOSE 8080

# Define start orchestration script
ENTRYPOINT ["/bin/sh", "./entrypoint.sh"]
