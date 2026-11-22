# Binário estático Go (~12 MB) para Edge Gateway + Crawler do JARVIS
FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod ./
COPY main.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/jarvis-go-gateway .

FROM alpine:3.20
RUN adduser -D -H -u 10001 jarvis && apk add --no-cache ca-certificates wget
COPY --from=builder /out/jarvis-go-gateway /usr/local/bin/jarvis-go-gateway
USER jarvis
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=4s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/gateway/health || exit 1
CMD ["/usr/local/bin/jarvis-go-gateway"]
