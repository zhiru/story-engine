FROM node:22-bookworm-slim
RUN corepack enable && corepack prepare pnpm@10.22.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/api
ENV NODE_ENV=production
# migrate + seed (idempotent) then start; env comes from compose, not a .env file
CMD ["sh","-c","pnpm exec tsx src/db/migrate.ts && pnpm exec tsx src/db/seed.ts && pnpm exec tsx src/server.ts"]
