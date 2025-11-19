FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install dependencies (copy package files first for better caching)
COPY package*.json ./

# Use npm ci if lockfile exists, otherwise fallback to npm install
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --only=production; fi

# Copy app source
COPY . .

# Default port (override with -e PORT=...) and expose for convenience
ENV PORT=3000
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
