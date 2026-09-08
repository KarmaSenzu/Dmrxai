# syntax=docker/dockerfile:1.7

# ---- Dependencies stage ----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ---- Builder stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install runtime deps untuk build
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry & set production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build Next.js (output: standalone)
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV TZ=Asia/Jakarta

# Non-root user
RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs -h /home/nextjs nextjs

# Copy standalone build (server.js + minimal node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# NOTE: folder /app/public tidak ada di project ini, jadi tidak di-copy.

# dockerode is loaded via dynamic require (new Function("require")) in
# app/lib/docker-sandbox.ts, so Next's standalone file tracing does NOT
# include it. Copy it (and its deps) explicitly for the Docker sandbox.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dockerode ./node_modules/dockerode
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/docker-modem ./node_modules/docker-modem
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@balena/dockerignore ./node_modules/@balena/dockerignore
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tar-fs ./node_modules/tar-fs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tar-stream ./node_modules/tar-stream
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pump ./node_modules/pump
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/end-of-stream ./node_modules/end-of-stream
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/once ./node_modules/once
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/wrappy ./node_modules/wrappy
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/readable-stream ./node_modules/readable-stream
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/inherits ./node_modules/inherits
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/string_decoder ./node_modules/string_decoder
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/util-deprecate ./node_modules/util-deprecate
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/safe-buffer ./node_modules/safe-buffer
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ieee754 ./node_modules/ieee754
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/base64-js ./node_modules/base64-js
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bl ./node_modules/bl
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/buffer ./node_modules/buffer
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/fs-constants ./node_modules/fs-constants
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/mkdirp-classic ./node_modules/mkdirp-classic
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/chownr ./node_modules/chownr
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/split-ca ./node_modules/split-ca
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ssh2 ./node_modules/ssh2
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/asn1 ./node_modules/asn1
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcrypt-pbkdf ./node_modules/bcrypt-pbkdf
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/tweetnacl ./node_modules/tweetnacl
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/debug ./node_modules/debug
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ms ./node_modules/ms
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@grpc/grpc-js ./node_modules/@grpc/grpc-js
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@grpc/proto-loader ./node_modules/@grpc/proto-loader
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@js-sdsl/ordered-map ./node_modules/@js-sdsl/ordered-map
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/protobufjs ./node_modules/protobufjs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@protobufjs/aspromise ./node_modules/@protobufjs/aspromise
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@protobufjs/base64 ./node_modules/@protobufjs/base64
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@protobufjs/codegen ./node_modules/@protobufjs/codegen
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@protobufjs/eventemitter ./node_modules/@protobufjs/eventemitter
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@protobufjs/fetch ./node_modules/@protobufjs/fetch
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@protobufjs/float ./node_modules/@protobufjs/float
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@protobufjs/path ./node_modules/@protobufjs/path
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@protobufjs/pool ./node_modules/@protobufjs/pool
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@protobufjs/utf8 ./node_modules/@protobufjs/utf8
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/long ./node_modules/long
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/yargs ./node_modules/yargs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/yargs-parser ./node_modules/yargs-parser
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/cliui ./node_modules/cliui
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/escalade ./node_modules/escalade
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/get-caller-file ./node_modules/get-caller-file
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/require-directory ./node_modules/require-directory
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/strip-ansi ./node_modules/strip-ansi
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/ansi-regex ./node_modules/ansi-regex
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/y18n ./node_modules/y18n
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/lodash.camelcase ./node_modules/lodash.camelcase
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@types/node ./node_modules/@types/node

USER nextjs:nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

# server.js dari standalone output
CMD ["node", "server.js"]
