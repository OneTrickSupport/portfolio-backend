# syntax=docker/dockerfile:1

# Build and install deps on the native runner arch (avoids QEMU crashes with npm on arm64).
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /build
COPY package.json package-lock.json* ./
RUN HUSKY=0 npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM --platform=$BUILDPLATFORM node:20-alpine AS deps
WORKDIR /deps
COPY package.json package-lock.json* ./
RUN HUSKY=0 npm ci --omit=dev && npm cache clean --force

# Final Lambda image is arm64 — just copy compiled output and node_modules, no npm install.
FROM public.ecr.aws/lambda/nodejs:20
WORKDIR /var/task
COPY --from=deps /deps/node_modules ./node_modules
COPY --from=builder /build/dist ./
COPY package.json ./
CMD ["lambda.handler"]
