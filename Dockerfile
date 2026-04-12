# 1. Instalar todas las dependencias (incluye devDeps para compilar)
FROM node:22-alpine3.20 AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# 2. Compilar la aplicación
FROM node:22-alpine3.20 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

# 3. Instalar SOLO dependencias de producción (Esta es la clave)
FROM node:22-alpine3.20 AS prod-deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile

# 4. Imagen final (Runner)
FROM node:22-alpine3.20 AS runner
WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copiamos solo lo necesario para ejecutar
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

# Si usas archivos estáticos en public, descomenta la siguiente línea
COPY --from=builder /app/public ./public/

EXPOSE 3000

CMD [ "node", "dist/main" ]
