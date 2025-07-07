# ⚙️ Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev
COPY main.js .
COPY index.html .
COPY cookies.json .
COPY favicon ./favicon

# 🧼 Runtime stage (super small)
FROM gcr.io/distroless/nodejs18-debian11

WORKDIR /app

# 只 COPY 精选文件，不打包所有上下文！
COPY --from=builder /app .

EXPOSE 3000

CMD ["main.js"]