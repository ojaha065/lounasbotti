FROM node:lts AS BUILD_IMAGE
WORKDIR /app
COPY ["package.json", "package-lock.json*", "./"]
RUN npm install
COPY . .
RUN npm run build
RUN npm install --omit=dev

FROM node:lts
WORKDIR /app
COPY --from=BUILD_IMAGE /app/package.json ./package.json
COPY --from=BUILD_IMAGE /app/dist ./dist
COPY --from=BUILD_IMAGE /app/node_modules ./node_modules
EXPOSE 8080
CMD ["npm", "run", "start"]