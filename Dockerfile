# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.11-alpine AS web-deps
WORKDIR /repo

COPY package.json bun.lock turbo.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile

FROM web-deps AS web-build
COPY apps/web apps/web
COPY packages/ui packages/ui
RUN bun --filter web build

FROM nginx:1.27-alpine AS web
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /repo/apps/web/dist/client /usr/share/nginx/html
EXPOSE 3000

FROM golang:1.26.5-bookworm AS api-build
WORKDIR /src/apps/api

COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM debian:bookworm-slim AS api
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin kamino

WORKDIR /app
COPY --from=api-build /out/api /app/api

USER kamino
ENV GIN_MODE=release
ENV PORT=:8080
EXPOSE 8080

CMD ["/app/api"]
