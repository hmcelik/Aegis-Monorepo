# Development Guide

This guide provides detailed information for developers working on the Telegram Moderator Bot monorepo.

## 🏗️ Monorepo Structure

This project uses **Turborepo** with **pnpm workspaces** for efficient development and building.

```
├── apps/
│   ├── api/           # REST API service (@telegram-moderator/api)
│   ├── bot/           # Telegram bot (@telegram-moderator/bot)  
│   └── web/           # Web dashboard (mini-app-dashboard)
├── packages/
│   └── shared/        # Shared utilities (@telegram-moderator/shared)
└── __tests__/         # Centralized test suites
```

## 🛠️ Development Commands

### Main Development Commands
```bash
# Run all services in parallel (recommended for full development)
pnpm dev

# Run individual services
pnpm dev:api                # API server only
pnpm dev:bot                # Bot only
pnpm dev:web                # Web dashboard only
pnpm dev:ngrok              # Ngrok tunnel only (for API on port 3000)
pnpm dev:api-with-ngrok     # API server + ngrok tunnel together
```

### Advanced Service Commands
```bash
# Run services with Turborepo filters (alternative approach)
pnpm --filter=@telegram-moderator/api dev      # API only
pnpm --filter=@telegram-moderator/bot dev      # Bot only
pnpm --filter=mini-app-dashboard dev           # Web only
pnpm --filter=@telegram-moderator/bot ngrok    # Ngrok tunnel only
```

### Testing Commands
```bash
# Run all tests across all services
pnpm test

# Run individual service tests (recommended with --run flag for CI)
pnpm test:api -- --run      # API tests only (156 tests)
pnpm test:bot -- --run      # Bot tests only (94 tests)
pnpm test:web -- --run      # Web tests only

# Alternative: Using filters
pnpm --filter=@telegram-moderator/api test --run
pnpm --filter=@telegram-moderator/bot test --run
```

### Build & Production Commands
```bash
# Build all packages
pnpm build

# Start all services in production mode  
pnpm start

# Install all dependencies across workspace
pnpm install

# Clean build artifacts and node_modules
pnpm clean
```

## 🌐 Service Endpoints & Ports

| Service | URL | Port | Description |
|---------|-----|------|-------------|
| **API Server** | http://localhost:3000 | 3000 | REST API endpoints |
| **Web Dashboard** | http://localhost:5173 | 5173 | React web interface |
| **Bot Service** | N/A | N/A | Telegram polling mode |
| **Ngrok Tunnel** | https://your-tunnel.ngrok-free.app | 3000 | External API access |

## 🔧 Environment Configuration

### Main Environment File
All services load environment from the root `.env` file:

```bash
# Root level - applies to all services
./env

# Development overrides (optional)
./.env.development

# Example configuration
./.env.example
```

### Environment Loading
The shared package (`packages/shared/src/config/`) handles centralized environment loading:

```javascript
// Automatically loaded in all services
import config from '@telegram-moderator/shared/src/config';
```

## 📝 Development Workflow

### 1. Initial Setup
```bash
# Clone and setup
git clone <repo-url>
cd telegram-moderator-dashboard
pnpm install

# Configure environment  
cp .env.example .env
# Edit .env with your credentials
```

### 2. Development Process
```bash
# Start all services for full development
pnpm dev

# Or run services separately in different terminals:
pnpm dev:bot     # Terminal 1: Bot logs
pnpm dev:api     # Terminal 2: API logs  
pnpm dev:web     # Terminal 3: Web logs
```

### 3. Testing Workflow
```bash
# Run tests before committing
pnpm test

# Run specific test suites during development
pnpm test:bot -- --run    # Quick bot test feedback
pnpm test:api -- --run    # API endpoint testing
```

### 4. External Testing with Ngrok
For webhook testing with external services:

```bash
# Option 1: API + Ngrok together
pnpm dev:api-with-ngrok

# Option 2: Separate terminals
pnpm dev:api      # Terminal 1
pnpm dev:ngrok    # Terminal 2
```

## 🧪 Testing Framework

### Test Structure
- **Vitest** for test runner
- **Supertest** for API endpoint testing
- **Centralized test files** in `__tests__/` directory
- **Service-specific configurations** in each app

### Running Tests
```bash
# All tests with coverage
pnpm test

# Watch mode for development
pnpm --filter=@telegram-moderator/bot test
pnpm --filter=@telegram-moderator/api test

# Specific test files
pnpm --filter=@telegram-moderator/bot test -- messageHandler.test.js
```

## 📦 Package Management

### Adding Dependencies

```bash
# Add to specific workspace
pnpm --filter=@telegram-moderator/api add express
pnpm --filter=@telegram-moderator/bot add node-telegram-bot-api

# Add to root (for tooling)
pnpm add -w -D vitest

# Add to shared package
pnpm --filter=@telegram-moderator/shared add lodash
```

### Workspace Dependencies
```bash
# Reference shared package in apps
{
  "dependencies": {
    "@telegram-moderator/shared": "workspace:*"
  }
}
```

## 🔄 Turborepo Features

### Caching
Turborepo automatically caches build outputs and test results:

```bash
# View cache info
turbo run build --dry

# Clear cache
turbo prune
```

### Pipeline Configuration
Defined in `turbo.json`:
- **dev**: No cache (live development)
- **build**: Full caching enabled
- **test**: Cache test results
- **lint**: Cache lint results

## 🚨 Troubleshooting

### Common Issues

1. **Port conflicts**: Change ports in respective package.json files
2. **Environment not loading**: Check shared config path resolution
3. **Tests failing**: Ensure root vitest config is properly set
4. **Ngrok not working**: Verify ngrok installation and auth token

### Debug Commands
```bash
# Check workspace structure
pnpm list --depth=0

# Verify environment loading
pnpm --filter=@telegram-moderator/bot dev --verbose

# Check Turborepo pipeline
turbo run build --dry-run
```

## 🔐 Security Notes

- **Never commit `.env` files** - Use `.env.example` for templates
- **Rotate API keys** regularly in production
- **Use strong JWT secrets** for API authentication
- **Enable rate limiting** in production deployments

## 📚 Additional Resources

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [pnpm Workspaces](https://pnpm.io/workspaces)  
- [Vitest Testing Framework](https://vitest.dev/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- **Ngrok Tunnel**: https://minnow-good-mostly.ngrok-free.app

## Environment Setup
- Main `.env` file located at monorepo root
- All services load environment from root `.env` file
- Development settings in `.env.development`
- Example configuration in `.env.example`

## Separate Log Monitoring
To monitor logs separately, run these commands in different terminals:
1. `pnpm dev:bot` - Bot logs only
2. `pnpm dev:api` - API logs only  
3. `pnpm dev:web` - Web logs only

## Ngrok Integration
To test API with external webhook:
- `pnpm dev:api-with-ngrok` - Runs API + ngrok tunnel
- Or manually: `pnpm --filter=@telegram-moderator/bot ngrok` (while API is running)

