# Build stage
FROM node:24.13.1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Runtime stage
FROM node:24.13.1-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files and public assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/public ./dist/public

# Expose port
EXPOSE 3000

# Run the app
CMD ["node", "dist/index.js"]
