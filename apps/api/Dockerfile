FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN corepack prepare pnpm@10.15.0 --activate && pnpm install --filter @klyvero/api... --no-frozen-lockfile
FROM deps AS build
COPY apps/api apps/api
RUN pnpm --filter @klyvero/api prisma:generate && pnpm --filter @klyvero/api build
FROM node:22-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
EXPOSE 4000
CMD ["sh","-c","pnpm prisma:migrate && node dist/main.js"]
