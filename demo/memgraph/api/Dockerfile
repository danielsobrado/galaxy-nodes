FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

EXPOSE 8787

# docker-compose overrides this per service (seed vs. api); the default keeps a
# bare `docker run` of the image useful.
CMD ["npm", "start"]
