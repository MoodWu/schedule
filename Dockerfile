FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o schedule .

FROM alpine:latest

WORKDIR /app

COPY --from=builder /app/schedule .
COPY --from=builder /app/config.yaml .
COPY --from=builder /app/html ./html

VOLUME ["/app/web", "/app/data"]

EXPOSE 8080

CMD ["./schedule"]