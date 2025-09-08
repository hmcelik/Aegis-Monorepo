# Telegram Moderator Bot Monorepo

A comprehensive AI-powered Telegram moderation bot with advanced features, complete REST API, and web dashboard - all in a modern monorepo structure.

## 🏗️ Architecture

This monorepo contains three main services:

- **🤖 Bot Service** (`apps/bot/`) - AI-powered Telegram moderation bot
- **🔗 API Service** (`apps/api/`) - REST API with JWT authentication and Telegram WebApp support
- **🌐 Web Dashboard** (`apps/web/`) - React-based management interface
- **📦 Shared Package** (`packages/shared/`) - Common utilities, database, logging, and NLP services

## 🚀 Key Features

- **🧠 AI-Powered Moderation** - Smart spam detection with GPT-4o-mini integration
- **🤬 Advanced Profanity Filter** - Hybrid local + AI profanity detection
- **📱 Complete API Suite** - Full REST API with JWT authentication and Telegram WebApp support
- **👑 Super Admin Controls** - Global statistics, maintenance mode, broadcasting, cache management
- **🎛️ Web Dashboard** - React-based management interface for groups and settings
- **⚡ Optimized Performance** - Faster responses with parallel processing
- **🔒 Security First** - Rate limiting, CORS protection, comprehensive error handling
- **🧪 Comprehensive Testing** - 250+ tests across bot and API services
- **🐳 Production Ready** - Docker support, monitoring, logging
- **� Monorepo Structure** - Turborepo + pnpm workspaces for efficient development

## 📋 Quick Start

### Prerequisites

- **Node.js 22+**
- **pnpm** (recommended package manager)
- **SQLite** (included)
- **ngrok** (for external webhook testing)
- **Telegram Bot Token** ([Get from @BotFather](https://t.me/BotFather))
- **OpenAI API Key** (optional, for AI moderation)

### Installation

```bash
# Clone the repository
git clone https://github.com/hmcelik/telegram-moderator-dashboard.git
cd telegram-moderator-dashboard

# Install dependencies
pnpm install

# Create environment file
cp .env.example .env
```

### Environment Configuration

Create a `.env` file with the following variables:

```bash
# ------------------------- #
# --- TELEGRAM SETTINGS --- #
# ------------------------- #

# Your Telegram Bot Token from @BotFather
TELEGRAM_BOT_TOKEN=your_bot_token_here

# The numeric User ID of the bot administrator (you)
ADMIN_USER_ID=your_user_id_here

# -------------------- #
# --- AI & NLP API --- #
# -------------------- #

# Your OpenAI API key (optional, for enhanced AI moderation)
OPENAI_API_KEY=sk-proj-your-key-here

# ----------------- #
# --- DATABASE --- #
# ----------------- #

# Database path (defaults to ./database.db)
DATABASE_PATH=./database.db

# --------------- #
# --- LOGGING --- #
# --------------- #

# Log level: 'error', 'warn', 'info', 'debug'
LOG_LEVEL=info

# -------------- #
# --- SERVER --- #
# -------------- #

# Port for the API server
PORT=3000

# JWT secret for authentication
JWT_SECRET=your-super-secret-jwt-key-here

# Telegram Bot Secret for webhook verification
TELEGRAM_BOT_SECRET=your-webhook-secret
```

## 🛠️ Development Commands

### Main Development Commands

```bash
# Run all services in parallel (recommended)
pnpm dev

# Run individual services
pnpm dev:api          # API server only
pnpm dev:bot          # Bot only
pnpm dev:web          # Web dashboard only
pnpm dev:ngrok        # Ngrok tunnel only
pnpm dev:api-with-ngrok  # API with ngrok tunnel
```

### Testing Commands

```bash
# Run all tests
pnpm test

# Run individual service tests
pnpm test:api -- --run    # API tests only (156 tests)
pnpm test:bot -- --run    # Bot tests only (94 tests)
pnpm test:web -- --run    # Web tests only
```

### Build Commands

```bash
# Build all packages
pnpm build

# Start in production mode
pnpm start
```

## 🌐 Service Endpoints

When running locally:

- **API Server**: http://localhost:3000
- **Web Dashboard**: http://localhost:5173
- **Bot**: Polling mode (no HTTP endpoint)
- **Ngrok Tunnel**: https://your-tunnel.ngrok-free.app (when using ngrok)

## 📚 API Documentation

The API provides comprehensive endpoints for:

- **Authentication** - JWT + Telegram WebApp auth
- **Group Management** - Settings, statistics, member management
- **Strike System** - Automated penalty management
- **Analytics** - Detailed moderation statistics
- **NLP Analysis** - Spam and profanity detection endpoints

Full API documentation available at `/api/docs` when running the API server.

## 🧪 Testing

The monorepo includes comprehensive test suites:

- **Bot Tests** (94 tests): Message handling, commands, callbacks, NLP integration
- **API Tests** (156 tests): Endpoints, authentication, middleware, error handling
- **Database Tests**: Performance, analytics, data integrity
- **Integration Tests**: End-to-end service communication

## 🏗️ Project Structure

```
├── apps/
│   ├── api/                 # REST API service
│   │   ├── src/
│   │   │   ├── controllers/ # API controllers
│   │   │   ├── middleware/  # Authentication, validation
│   │   │   ├── routes/      # API routes
│   │   │   └── services/    # Business logic
│   │   └── package.json
│   ├── bot/                 # Telegram bot service
│   │   ├── src/
│   │   │   ├── handlers/    # Message, command, callback handlers
│   │   │   └── keyboards/   # Inline keyboard layouts
│   │   └── package.json
│   └── web/                 # React web dashboard
│       ├── src/
│       │   ├── components/  # React components
│       │   ├── hooks/       # Custom React hooks
│       │   └── services/    # API integration
│       └── package.json
├── packages/
│   └── shared/              # Shared utilities
│       ├── config/          # Configuration management
│       ├── services/        # Database, logger, NLP, Telegram
│       └── utils/           # Common enums and utilities
├── __tests__/               # Test suites
│   ├── api/                 # API tests
│   ├── bot/                 # Bot tests
│   ├── database/            # Database tests
│   └── services/            # Shared service tests
└── package.json             # Root package configuration
```

## 🚀 Deployment

### Docker Deployment

```bash
# Build the Docker image
docker build -t telegram-moderator .

# Run with environment file
docker run -d --env-file .env -p 3000:3000 telegram-moderator
```

### Vercel Deployment

The web dashboard is configured for Vercel deployment:

```bash
# Deploy to Vercel
vercel --prod
```

## � Roadmap & Task Board

See [AEGIS_TASK_BOARD.md](./AEGIS_TASK_BOARD.md) for the comprehensive 90-day reliability-first roadmap including:

- Queue & Idempotency implementation
- AI Budget Control & Caching
- Data Layer migration to PostgreSQL
- Observability & SLO monitoring
- Enhanced security and compliance
- CI/CD improvements with reliability gates

## �🔧 Development Tips

### Separate Log Monitoring

For cleaner log monitoring during development, run services in separate terminals:

```bash
# Terminal 1: Bot logs
pnpm dev:bot

# Terminal 2: API logs
pnpm dev:api

# Terminal 3: Web logs
pnpm dev:web
```

### Webhook Testing with ngrok

For testing webhooks with external services:

```bash
# Run API with ngrok tunnel
pnpm dev:api-with-ngrok

# The tunnel URL will be displayed in the console
```

## 📝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and add tests
4. Run tests: `pnpm test`
5. Commit changes: `git commit -m 'Add feature'`
6. Push to branch: `git push origin feature-name`
7. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/hmcelik/telegram-moderator-dashboard/issues)
- **Documentation**: Check the `DEVELOPMENT_GUIDE.md` for detailed development instructions
- **Telegram**: Contact @hmcelik for support

## 🔄 Migration Status

This project has been successfully migrated from a standalone structure to a modern monorepo setup using Turborepo and pnpm workspaces. All services are fully functional and tested.

# Optional - AI Features

OPENAI_API_KEY=your_openai_api_key_here

# API Configuration

API_PORT=3000
API_BASE_URL=http://localhost:3000
JWT_SECRET=your-super-long-random-secret-string-here

# CORS Configuration

ALLOWED_ORIGIN=http://localhost:8080

````

### Development Setup

1. **Start the Bot** (Terminal 1):
   ```bash
   npm run dev
````

2. **Start the API Server** (Terminal 2):

   ```bash
   npm run dev:api
   ```

3. **Start Development Server** (Terminal 3):

   ```bash
   npm run dev:examples
   ```

4. **Expose API for External Testing** (Terminal 4):
   ```bash
   ngrok http 3000
   ```

### Production Deployment

```bash
# Start bot in production
npm start

# Start API server in production
npm run start:api

# Start development server (for examples)
npm run start:dev-server
```

## 🌐 Services Overview

## 🏗️ Project Structure

```
telegram-moderator-bot/
├── src/
│   ├── api/                    # REST API server
│   │   ├── controllers/        # Request handlers
│   │   ├── middleware/         # Authentication & validation
│   │   ├── routes/             # API routes
│   │   ├── services/           # Business logic
│   │   └── utils/              # Utilities & error handling
│   ├── bot/                    # Telegram bot
│   │   ├── handlers/           # Message & command handlers
│   │   └── keyboards/          # Inline keyboards
│   └── common/                 # Shared services
│       ├── config/             # Configuration management
│       ├── services/           # Database, logging, Telegram API
│       └── utils/              # Shared utilities
├── __tests__/                  # Test suites
├── examples/                   # Usage examples & demos
├── moderator.db               # SQLite database
├── package.json
└── README.md
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Coverage

- **152 tests** across 15 test suites
- API endpoints testing
- Bot functionality testing
- Database operations testing
- Integration testing

## 🔒 Security Features

- **Rate Limiting** - Prevents API abuse
- **CORS Protection** - Configurable origin policies
- **JWT Authentication** - Secure token-based auth
- **Input Validation** - Comprehensive request validation
- **Error Sanitization** - Prevents information leakage
- **Helmet Security** - HTTP security headers
- **Maintenance Mode** - Emergency shutdown capability

## 🚀 Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push

### Docker

```bash
# Build image
docker build -t telegram-moderator-bot .

# Run container
docker run -d --name moderator-bot telegram-moderator-bot
```

### Traditional Hosting

1. Clone repository on server
2. Install dependencies: `npm install`
3. Set environment variables
4. Use PM2 for process management:
   ```bash
   pm2 start npm --name "bot" -- start
   pm2 start npm --name "api" -- run start:api
   ```

## 🔧 Configuration

### Bot Settings

Each group can be configured with:

- **Strike thresholds** for warnings, mutes, kicks, and bans
- **AI spam detection** sensitivity
- **Profanity filtering** with custom thresholds
- **Keyword whitelisting** for bypassing filters
- **Moderator permissions** and admin controls

### API Settings

- **CORS origins** for web integration
- **Rate limiting** for API protection
- **JWT tokens** for authentication
- **Swagger documentation** for API exploration

## 📊 Monitoring

- **Winston logging** with file rotation
- **Error tracking** with detailed stack traces
- **Performance metrics** via API endpoints
- **Health checks** for system monitoring
- **Global statistics** for super admins

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Add tests for new functionality
5. Run tests: `npm test`
6. Commit changes: `git commit -am 'Add feature'`
7. Push to branch: `git push origin feature-name`
8. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- **Documentation**: See [BOT_COMMANDS.md](./BOT_COMMANDS.md) and [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- **Issues**: [GitHub Issues](https://github.com/hmcelik/telegram-moderator-bot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hmcelik/telegram-moderator-bot/discussions)

## 🎯 Roadmap

- [ ] **Web Dashboard** - React-based admin panel
- [ ] **Multi-language Support** - Internationalization
- [ ] **Advanced Analytics** - Detailed reporting
- [ ] **Plugin System** - Extensible architecture
- [ ] **Machine Learning** - Custom model training
- [ ] **Webhook Support** - Real-time notifications

---

**Built with ❤️ for the Telegram community**

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/hmcelik/telegram-moderator-bot/issues)
- **Discussions**: [GitHub Discussions](https://github.com/hmcelik/telegram-moderator-bot/discussions)
- **Complete Setup Guide**: [TELEGRAM_DASHBOARD_SETUP_GUIDE.md](TELEGRAM_DASHBOARD_SETUP_GUIDE.md)

## ⭐ Acknowledgments

- Telegram Bot API team
- Express.js community
- Contributors and testers

---

**Made with ❤️ for the Telegram community**
