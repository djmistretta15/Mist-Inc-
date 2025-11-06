FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY turbo.json ./
COPY packages ./packages
COPY services/scheduler ./services/scheduler

RUN npm install
RUN npm run build --workspace=@mist/types
RUN npm run build --workspace=@mist/event-bus
RUN npm run build --workspace=@mist/scheduler

WORKDIR /app/services/scheduler

EXPOSE 3002

CMD ["npm", "start"]
