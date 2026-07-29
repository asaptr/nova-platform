FROM node:22-alpine AS base
RUN apk add --no-cache openssl

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/
RUN corepack enable && pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
ENV CI=true
COPY --from=deps /root/.cache/node/corepack /root/.cache/node/corepack
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter=api exec prisma generate && pnpm --filter=api build

FROM base AS prod-install
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY apps/api/package.json ./package.json
COPY apps/api/prisma ./prisma
RUN npm install --omit=dev && npx --yes prisma@5.14.0 generate

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nestjs
COPY --from=prod-install --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/prisma ./prisma
USER nestjs
EXPOSE 3000
CMD ["node", "dist/src/main"]
