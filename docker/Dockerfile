# Один образ: API + собранный фронт (04-deployment.md).
# Атомарный деплой и тривиальный откат: невозможен рассинхрон
# «новый фронт ↔ старый API», откат — одна команда с прежним тегом.

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter shared build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api exec nest build \
 && pnpm --filter web build

FROM deps AS prune
COPY --from=build /app /app
# Только prod-зависимости, с развёрнутыми симлинками pnpm-воркспейса:
# копирование node_modules из build тащило бы Nest CLI, Vite и TypeScript
RUN pnpm --filter api deploy --prod --legacy /out

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Europe/Kyiv
RUN apk add --no-cache openssl tzdata wget
RUN addgroup -S app && adduser -S app -G app
COPY --from=build  /app/apps/api/dist   ./dist
COPY --from=build  /app/apps/api/prisma ./prisma
COPY --from=build  /app/apps/web/dist   ./public
COPY --from=prune  /out/node_modules    ./node_modules
# `pnpm deploy --prod` переустанавливает @prisma/client «с нуля» из реестра —
# сгенерированный в стадии build клиент (node_modules/.prisma/client) при этом
# теряется, и PrismaService падает с «did not initialize yet» уже в проде.
# Перегенерировать здесь дешевле, чем городить отдельное копирование каталога.
RUN node node_modules/prisma/build/index.js generate --schema=./prisma/schema.prisma
# Том uploads монтируется сюда: каталог должен существовать и принадлежать app,
# иначе docker создаст его от root и первая же загрузка упадёт с EACCES
RUN mkdir -p /app/uploads && chown -R app:app /app/uploads
USER app
EXPOSE 3000
# migrate deploy, никогда не migrate dev; prisma лежит в dependencies,
# поэтому вызывается напрямую и не тянется из сети на каждом старте
CMD ["sh","-c","node node_modules/prisma/build/index.js migrate deploy && node dist/main.js"]
