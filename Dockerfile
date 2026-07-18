# Use the official Node.js 20 LTS image
FROM node:20-slim

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install build tools needed for better-sqlite3 native module
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy the rest of the application
COPY . .

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Use a volume for persistent data
VOLUME ["/app/data"]

# Run the bot
CMD ["node", "src/index.js"]
