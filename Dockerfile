FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY client/package.json ./client/package.json
COPY server/package.json ./server/package.json
RUN npm ci
COPY server ./server
COPY shared ./shared
COPY tsconfig.base.json ./tsconfig.base.json
RUN npm run db:generate
ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
USER node
EXPOSE 3002
CMD ["sh", "-c", "npm run db:migrate && npm start"]
