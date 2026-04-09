# Install dependencies only when needed
FROM node:22-alpine3.20 AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Build the app with cache dependencies
FROM node:22-alpine3.20 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build


# Production image, copy all the files and run next
FROM node:22-alpine3.20 AS runner

# Set working directory
WORKDIR /usr/src/app

# Copy package.json for reference (no install needed)
COPY package.json ./

# Reusar node_modules de la etapa deps (sin descarga adicional)
COPY --from=deps /app/node_modules ./node_modules

# Eliminar devDependencies localmente, sin tocar la red
RUN npm prune --production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public/

CMD [ "node","dist/main" ]