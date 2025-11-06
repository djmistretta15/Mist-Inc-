FROM node:18-alpine

WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY turbo.json ./
COPY packages ./packages
COPY services/trust-engine ./services/trust-engine

# Install dependencies
RUN npm install

# Build packages
RUN npm run build --workspace=@mist/types
RUN npm run build --workspace=@mist/event-bus

# Build service
RUN npm run build --workspace=@mist/trust-engine

WORKDIR /app/services/trust-engine

EXPOSE 3001

CMD ["npm", "start"]
