FROM rust:1.80-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY . .
RUN make release

FROM alpine:3.19

RUN apk add --no-cache \
    iptables \
    ca-certificates

WORKDIR /app

COPY --from=builder /app/firewall-man .

ENTRYPOINT ["/app/firewall-man"]
