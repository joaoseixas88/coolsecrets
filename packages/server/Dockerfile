# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/tsconfig.json packages/shared/tsconfig.build.json packages/shared/
COPY packages/server/package.json packages/server/tsconfig.json packages/server/tsconfig.build.json packages/server/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @coolsecrets/server... --filter @coolsecrets/shared...

COPY packages/shared/src packages/shared/src
COPY packages/server/src packages/server/src

RUN pnpm --filter @coolsecrets/shared build && pnpm --filter @coolsecrets/server build

RUN pnpm --filter @coolsecrets/server --prod deploy /out

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/package.json ./package.json

EXPOSE 3000
CMD ["node", "dist/index.js"]
