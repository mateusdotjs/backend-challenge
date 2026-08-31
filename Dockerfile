FROM oven/bun:1 AS base

WORKDIR /app

FROM base AS development

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["bun", "run", "start:dev"]

FROM base AS build

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM base AS production

ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/infrastructure/persistence/migrations ./src/infrastructure/persistence/migrations

EXPOSE 3000

CMD ["bun", "run", "start:prod"]
