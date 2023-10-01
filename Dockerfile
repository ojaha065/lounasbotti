FROM node:lts-alpine AS BUILD_IMAGE
WORKDIR /app
COPY ["package.json", "package-lock.json*", "./"]
RUN npm install --no-fund --no-audit
COPY . .
RUN npm run build && npm install --no-audit --no-fund --omit=dev && wget https://gobinaries.com/tj/node-prune --output-document - | /bin/sh && node-prune

FROM node:lts-alpine
WORKDIR /app
COPY --from=BUILD_IMAGE /app/package.json ./package.json
COPY --from=BUILD_IMAGE /app/dist ./dist
COPY --from=BUILD_IMAGE /app/node_modules ./node_modules
EXPOSE 8080
CMD ["npm", "run", "start"]