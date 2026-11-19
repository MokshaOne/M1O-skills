FROM node:22-alpine AS admin-build

WORKDIR /build/admin
COPY admin/package.json admin/package-lock.json ./
RUN npm ci
COPY admin/ .
RUN npx vite build
# Output lands in /build/dist/admin (outDir: '../dist/admin' relative to /build/admin)

FROM node:22-alpine

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ src/

# Copy admin build output
COPY --from=admin-build /build/dist/admin dist/admin/

# Media volume
RUN mkdir -p /app/media
VOLUME /app/media

ENV NODE_ENV=production
ENV PORT=3000
ENV MEDIA_DIR=/app/media

EXPOSE 3000

CMD ["node", "src/index.js"]
