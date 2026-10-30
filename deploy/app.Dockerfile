# One Node service serves the Vite build, REST and Socket.IO on Railway's PORT.
FROM node:24.22.1-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV SERVE_CLIENT=true
ENV PORT=10000
USER node
EXPOSE 10000
CMD ["sh", "-c", "npm run db:migrate && exec node --import tsx server/src/index.ts"]
