# syntax=docker/dockerfile:1

FROM public.ecr.aws/lambda/nodejs:20 AS builder
WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM public.ecr.aws/lambda/nodejs:20
WORKDIR /var/task
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /build/dist ./
CMD ["lambda.handler"]
