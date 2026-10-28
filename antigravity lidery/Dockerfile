FROM node:24-alpine

WORKDIR /app

# Copy application files
COPY package.json ./
COPY server.js ./
COPY src/ ./src/
COPY public/ ./public/
COPY scripts/ ./scripts/

# Create data and backups volumes
RUN mkdir -p /app/data /app/backups

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/lidery.db

EXPOSE 3000

CMD ["node", "server.js"]
