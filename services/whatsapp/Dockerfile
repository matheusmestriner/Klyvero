FROM golang:1.26-bookworm AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# go-sqlite3 needs cgo.
RUN CGO_ENABLED=1 go build -trimpath -ldflags="-s -w" -o /out/whatsapp ./cmd/server
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
  && useradd --system --home /app --uid 10001 klyvero && mkdir -p /app/data && chown -R klyvero /app
WORKDIR /app
COPY --from=build /out/whatsapp /usr/local/bin/whatsapp
USER klyvero
ENV DATABASE_DIR=/app/data
EXPOSE 8090
CMD ["whatsapp"]
