# Use the official Node.js 22 LTS image
FROM node:22-alpine

# Install pnpm
RUN npm install -g pnpm@10.14.0

# Set the working directory
WORKDIR /usr/src/app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY turbo.json ./

# Copy apps and packages
COPY apps/ ./apps/
COPY packages/ ./packages/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the applications
RUN pnpm build

# Expose port
EXPOSE 3000

# Command to run the bot (can be changed to API via docker run command)
CMD [ "pnpm", "start", "--filter=@telegram-moderator/bot" ]