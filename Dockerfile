# syntax = docker/dockerfile:1

FROM node:lts-alpine AS build_image
WORKDIR /app
COPY ["package.json", "package-lock.json*", "./"]
RUN npm install --no-fund --no-audit
COPY . .

RUN npm run build

ARG USE_SENTRY
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN if [ -n "$USE_SENTRY" ]; then npm run sentry-docker; fi

RUN npm install --no-audit --no-fund --omit=dev && wget https://gobinaries.com/tj/node-prune --output-document - | /bin/sh && node-prune

FROM node:lts-alpine
WORKDIR /app
COPY --from=build_image /app/package.json ./package.json
COPY --from=build_image /app/dist ./dist
COPY --from=build_image /app/node_modules ./node_modules

EXPOSE 8080
CMD ["npm", "run", "start"]