FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY server ./server
COPY shared ./shared
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
USER node
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
