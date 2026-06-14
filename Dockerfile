FROM rust:1.80-alpine AS builder
RUN apk add --no-cache musl-dev
WORKDIR /app
COPY backend/ .
RUN cargo build --release

FROM alpine:3.19

RUN apk add --no-cache \
    iptables \
    openssh-client \
    sshpass \
    ca-certificates

WORKDIR /app

COPY --from=builder /app/kyklos .

ENTRYPOINT ["/app/kyklos"]
