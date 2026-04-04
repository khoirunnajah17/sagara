# ──────────────────────────────────────────────
# Stage 1 – dependencies
# ──────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ──────────────────────────────────────────────
# Stage 2 – runtime image
# ──────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Copy production deps from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

CMD ["node", "index.js"]
