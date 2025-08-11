# API Documentation

This document provides comprehensive information about the Telegram Moderator Bot REST API.

## 📋 Overview

The Telegram Moderator Bot provides a complete REST API for integrating with external websites, Telegram Mini Apps, and web dashboards. The API supports unified authentication and provides endpoints for user management, group settings, statistics, and NLP testing.

### Base Information

- **Base URL**: `http://localhost:3000/api/v1` (development)
- **Production URL**: `https://your-domain.com/api/v1`
- **API Version**: 2.0.0
- **Content Type**: `application/json`
- **Authentication**: Unified (JWT Bearer Token + Telegram WebApp)

### Interactive Documentation

Complete interactive API documentation is available at:
**`http://localhost:3000/api/docs`** (Swagger UI)

## 🔐 Authentication

The API supports **unified authentication** - the same endpoints work with multiple authentication methods:

### Authentication Methods

1. **JWT Bearer Token** - For external websites and applications
2. **Telegram WebApp initData** - For Telegram Mini Apps
3. **Telegram Login Widget** - For external website integration

### Unified Authentication Headers

The API automatically detects and validates authentication from these headers:

**Option 1 - JWT Bearer Token:**
```http
Authorization: Bearer <jwt_token>
```

**Option 2 - Telegram WebApp:**
```http
X-Telegram-Init-Data: <telegram_webapp_initdata>
```

### Authentication Workflow

#### 1. Telegram Login Widget (External Websites)

```javascript
// Step 1: User clicks Telegram Login Widget
// Step 2: Your website receives authentication data
const loginData = {
    id: 123456789,
    first_name: "John",
    last_name: "Doe",
    username: "johndoe",
    photo_url: "https://t.me/i/userpic/320/johndoe.jpg",
    auth_date: 1678886400,
    hash: "authentication_hash_from_telegram"
};

// Step 3: Send to API to get JWT token
const response = await fetch('/api/v1/auth/login-widget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginData)
});

const { token, user } = await response.json();

// Step 4: Use JWT token for subsequent requests
const apiResponse = await fetch('/api/v1/groups', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
});
```

#### 2. Telegram Mini App

```javascript
// Step 1: Mini App loads, get initData
const initData = window.Telegram.WebApp.initData;

// Step 2: Send to API for authentication  
const response = await fetch('/api/v1/webapp/auth', {
    method: 'POST',
    headers: {
        'X-Telegram-Init-Data': initData,
        'Content-Type': 'application/json'
    }
});

const { token, user } = await response.json();

// Step 3: Use either JWT token OR continue with initData
// Option A: Use JWT token
const apiResponse = await fetch('/api/v1/groups', {
    headers: {
        'Authorization': `Bearer ${token}`
    }
});

// Option B: Continue with initData (unified auth)
const apiResponse = await fetch('/api/v1/groups', {
    headers: {
        'X-Telegram-Init-Data': initData
    }
});
```

#### 3. Universal Verification Endpoint

```javascript
// Works with both Login Widget and Mini App data
const response = await fetch('/api/v1/auth/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        // Login Widget data
        id: 123456789,
        first_name: "John",
        // ... other fields
        
        // OR Mini App data
        initData: "raw_init_data_string"
    })
});
```

## 📡 API Endpoints

### 🔐 Authentication Endpoints

#### `POST /auth/verify`
**Universal Telegram Authentication**

Supports both Telegram Login Widget and Mini App authentication methods.

**Request Body (Login Widget):**
```json
{
    "id": 123456789,
    "first_name": "John",
    "last_name": "Doe",
    "username": "johndoe",
    "photo_url": "https://t.me/i/userpic/320/johndoe.jpg",
    "auth_date": 1678886400,
    "hash": "authentication_hash_from_telegram"
}
```

**Request Body (Mini App):**
```json
{
    "initData": "raw_init_data_string_from_telegram_mini_app"
}
```

**Response:**
```json
{
    "success": true,
    "message": "Authentication successful",
    "user": {
        "id": 123456789,
        "first_name": "John",
        "username": "johndoe",
        "photo_url": "https://t.me/i/userpic/320/johndoe.jpg",
        "auth_date": 1678886400
    }
}
```

#### `POST /auth/login-widget`
**Dedicated Login Widget Authentication**

Specialized endpoint for external websites using Telegram Login Widget. Returns JWT token.

**Request Body:**
```json
{
    "id": 123456789,
    "first_name": "John",
    "last_name": "Doe",
    "username": "johndoe",
    "photo_url": "https://t.me/i/userpic/320/johndoe.jpg",
    "auth_date": 1678886400,
    "hash": "authentication_hash_from_telegram"
}
```

**Response:**
```json
{
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "id": 123456789,
        "first_name": "John",
        "username": "johndoe",
        "photo_url": "https://t.me/i/userpic/320/johndoe.jpg"
    }
}
```

### 🌐 WebApp Endpoints

#### `POST /webapp/auth`
**WebApp Authentication**

Authenticates Telegram Mini Apps using initData and returns JWT token.

**Headers:**
```http
X-Telegram-Init-Data: <telegram_webapp_initdata>
Content-Type: application/json
```

**Response:**
```json
{
    "success": true,
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
        "id": 123456789,
        "first_name": "John",
        "username": "johndoe"
    }
}
```

#### `GET /webapp/health`
**API Health Check**

Returns API status and enabled features.

**Response:**
```json
{
    "status": "healthy",
    "timestamp": "2025-08-07T12:00:00.000Z",
    "features": {
        "webAppSupport": true,
        "cors": true,
        "rateLimit": true,
        "authentication": true,
        "swagger": true
    }
}
```

### 👥 User Management

#### `GET /webapp/user/profile`
**Get User Profile**

Returns authenticated user's profile information.

**Headers:**
```http
Authorization: Bearer <jwt_token>
# OR
X-Telegram-Init-Data: <initdata>
```

**Response:**
```json
{
    "user": {
        "id": 123456789,
        "first_name": "John",
        "last_name": "Doe",
        "username": "johndoe",
        "photo_url": "https://t.me/i/userpic/320/johndoe.jpg",
        "auth_date": 1678886400
    }
}
```

#### `GET /webapp/user/groups`
**Get User's Groups**

Returns list of groups where the user is a member and the bot is present.

**Headers:**
```http
Authorization: Bearer <jwt_token>
# OR  
X-Telegram-Init-Data: <initdata>
```

**Response:**
```json
{
    "groups": [
        {
            "chatId": "-1001234567890",
            "chatTitle": "My Awesome Group",
            "memberCount": 150,
            "isAdmin": true,
            "strikes": {
                "count": 2,
                "lastUpdated": "2025-08-07T10:30:00.000Z"
            }
        },
        {
            "chatId": "-1001234567891", 
            "chatTitle": "Another Group",
            "memberCount": 75,
            "isAdmin": false,
            "strikes": {
                "count": 0,
                "lastUpdated": null
            }
        }
    ]
}
```

### 🏢 Group Management

#### `GET /groups`
**List User's Groups (Alternative endpoint)**

Returns groups where the authenticated user has administrative privileges.

**Headers:**
```http
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
    "groups": [
        {
            "chatId": "-1001234567890",
            "chatTitle": "My Awesome Group", 
            "memberCount": 150
        }
    ]
}
```

#### `GET /groups/:groupId/settings`
**Get Group Settings**

Returns comprehensive settings for a specific group.

**URL Parameters:**
- `groupId` - The group's chat ID (with or without the minus sign)

**Headers:**
```http
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
    "groupId": "-1001234567890",
    "settings": {
        "alertLevel": 3,
        "muteLevel": 5, 
        "kickLevel": 8,
        "banLevel": 10,
        "spamThreshold": 0.7,
        "profanityEnabled": true,
        "profanityThreshold": 0.8,
        "muteDurationMinutes": 60,
        "keywordWhitelistBypass": false,
        "whitelistedKeywords": ["admin", "help", "support"],
        "moderatorIds": [123456789, 987654321]
    }
}
```

#### `PUT /groups/:groupId/settings`
**Update Group Settings**

Updates settings for a specific group. Only administrators can modify settings.

**URL Parameters:**
- `groupId` - The group's chat ID

**Headers:**
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
    "alertLevel": 4,
    "muteLevel": 6,
    "kickLevel": 9, 
    "banLevel": 12,
    "spamThreshold": 0.8,
    "profanityEnabled": true,
    "profanityThreshold": 0.9,
    "muteDurationMinutes": 120,
    "keywordWhitelistBypass": true,
    "whitelistedKeywords": ["admin", "help", "support", "announcement"],
    "moderatorIds": [123456789, 987654321, 555666777]
}
```

**Response:**
```json
{
    "success": true,
    "message": "Settings updated successfully",
    "settings": {
        "alertLevel": 4,
        "muteLevel": 6,
        // ... updated settings
    }
}
```

#### `GET /groups/:groupId/stats`
**Get Group Statistics**

Returns comprehensive statistics for a specific group.

**URL Parameters:**
- `groupId` - The group's chat ID

**Headers:**
```http
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
    "groupId": "-1001234567890",
    "stats": {
        "totalMembers": 150,
        "totalMessages": 15750,
        "deletionsToday": 8,
        "deletionsWeek": 45,
        "deletionsMonth": 180,
        "activeStrikes": 23,
        "totalUsers": 89,
        "avgMessagesPerDay": 245,
        "topViolators": [
            {
                "userId": 111222333,
                "firstName": "Spammer",
                "strikeCount": 5,
                "lastViolation": "2025-08-07T09:15:00.000Z"
            }
        ],
        "recentActivity": [
            {
                "timestamp": "2025-08-07T12:30:00.000Z",
                "action": "AUTO-STRIKE",
                "userId": 444555666,
                "firstName": "John",
                "reason": "Spam detected",
                "score": 0.85
            }
        ]
    }
}
```

### 🌐 WebApp Specific Endpoints

These endpoints are optimized for Telegram Mini Apps with simplified responses.

#### `GET /webapp/group/:groupId/settings`
**Get Group Settings (WebApp)**

WebApp-optimized version of group settings endpoint.

**Headers:**
```http
X-Telegram-Init-Data: <initdata>
```

**Response:**
```json
{
    "groupId": "-1001234567890", 
    "groupTitle": "My Awesome Group",
    "settings": {
        "penalties": {
            "alert": 3,
            "mute": 5,
            "kick": 8,
            "ban": 10,
            "muteDuration": 60
        },
        "detection": {
            "spamThreshold": 0.7,
            "profanityEnabled": true,
            "profanityThreshold": 0.8
        },
        "whitelist": {
            "bypassEnabled": false,
            "keywords": ["admin", "help", "support"],
            "moderators": [123456789, 987654321]
        }
    }
}
```

#### `PUT /webapp/group/:groupId/settings`
**Update Group Settings (WebApp)**

WebApp-optimized settings update endpoint.

**Headers:**
```http
X-Telegram-Init-Data: <initdata>
Content-Type: application/json
```

**Request Body:**
```json
{
    "penalties": {
        "alert": 4,
        "mute": 6,
        "kick": 9,
        "ban": 12,
        "muteDuration": 120
    },
    "detection": {
        "spamThreshold": 0.8,
        "profanityEnabled": true,
        "profanityThreshold": 0.9
    },
    "whitelist": {
        "bypassEnabled": true,
        "keywords": ["admin", "help", "support", "announcement"],
        "moderators": [123456789, 987654321, 555666777]
    }
}
```

**Response:**
```json
{
    "success": true,
    "message": "Settings updated successfully"
}
```

#### `GET /webapp/group/:groupId/stats`
**Get Group Statistics (WebApp)**

WebApp-optimized statistics endpoint with simplified data structure.

**Headers:**
```http
X-Telegram-Init-Data: <initdata>
```

**Response:**
```json
{
    "groupId": "-1001234567890",
    "groupTitle": "My Awesome Group", 
    "overview": {
        "members": 150,
        "activeStrikes": 23,
        "deletionsToday": 8,
        "deletionsWeek": 45
    },
    "activity": {
        "messagesPerDay": 245,
        "violationsPerWeek": 12,
        "avgStrikesPerUser": 0.26
    },
    "recent": [
        {
            "time": "12:30",
            "user": "John",
            "action": "Strike added",
            "reason": "Spam detected"
        },
        {
            "time": "11:45",
            "user": "Admin",
            "action": "Strike removed", 
            "reason": "Appeal approved"
        }
    ]
}
```

### 🧠 NLP Testing Endpoints

These endpoints provide access to the bot's AI moderation capabilities for testing and integration.

#### `GET /nlp/status`
**Get NLP Service Status**

Returns status and configuration of NLP services.

**Headers:**
```http
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
    "status": "active",
    "services": {
        "openai": {
            "enabled": true,
            "model": "gpt-4o-mini",
            "status": "connected"
        },
        "profanityFilter": {
            "enabled": true,
            "language": "en",
            "customWords": 15
        }
    },
    "stats": {
        "requestsToday": 156,
        "avgResponseTime": 245,
        "successRate": 99.2
    }
}
```

#### `POST /nlp/test/spam`
**Test Spam Detection**

Tests message content against the spam detection system.

**Headers:**
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
    "message": "🚀 AMAZING CRYPTO DEAL! GET RICH QUICK! Click here now!",
    "groupId": "-1001234567890"
}
```

**Response:**
```json
{
    "message": "🚀 AMAZING CRYPTO DEAL! GET RICH QUICK! Click here now!",
    "analysis": {
        "isSpam": true,
        "confidence": 0.92,
        "score": 0.92,
        "threshold": 0.7,
        "factors": [
            "Excessive use of capital letters",
            "Get rich quick scheme language",
            "Multiple promotional phrases",
            "Call to action with urgency"
        ]
    },
    "action": {
        "recommended": "delete_and_strike",
        "strikes": 1,
        "reason": "Promotional spam detected"
    }
}
```

#### `POST /nlp/test/profanity`
**Test Profanity Detection**

Tests message content against the profanity detection system.

**Headers:**
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
    "message": "This is a message with some inappropriate content",
    "groupId": "-1001234567890"
}
```

**Response:**
```json
{
    "message": "This is a message with some inappropriate content",
    "analysis": {
        "isProfane": true,
        "confidence": 0.85,
        "score": 0.85,
        "threshold": 0.8,
        "detectedWords": [
            {
                "word": "inappropriate",
                "severity": "moderate",
                "position": 25
            }
        ]
    },
    "action": {
        "recommended": "warn",
        "strikes": 0,
        "reason": "Inappropriate language detected"
    }
}
```

#### `POST /nlp/analyze`
**Complete Message Analysis**

Performs comprehensive analysis including both spam and profanity detection.

**Headers:**
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
    "message": "Check out this amazing deal! Buy crypto now!",
    "groupId": "-1001234567890",
    "userId": 123456789,
    "context": {
        "previousMessages": 5,
        "userHistory": true
    }
}
```

**Response:**
```json
{
    "message": "Check out this amazing deal! Buy crypto now!",
    "spam": {
        "isSpam": true,
        "confidence": 0.78,
        "factors": ["Promotional language", "Financial product"]
    },
    "profanity": {
        "isProfane": false,
        "confidence": 0.05,
        "detectedWords": []
    },
    "overall": {
        "action": "delete_and_strike",
        "strikes": 1,
        "confidence": 0.78,
        "reason": "Promotional spam detected"
    },
    "user": {
        "currentStrikes": 2,
        "riskLevel": "medium",
        "messageHistory": "clean"
    }
}
```

### 🎯 Strike Management Endpoints

#### `GET /strikes/:groupId/:userId`
**Get User Strikes**

Returns strike information for a specific user in a group.

**URL Parameters:**
- `groupId` - The group's chat ID
- `userId` - The user's Telegram ID

**Headers:**
```http
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
    "groupId": "-1001234567890",
    "userId": 123456789,
    "strikes": {
        "current": 3,
        "history": [
            {
                "id": 456,
                "timestamp": "2025-08-07T10:30:00.000Z",
                "type": "MANUAL-STRIKE-ADD",
                "amount": 2,
                "reason": "Spam posting",
                "admin": {
                    "id": 987654321,
                    "name": "Admin Name"
                }
            },
            {
                "id": 455,
                "timestamp": "2025-08-06T15:20:00.000Z", 
                "type": "AUTO-STRIKE",
                "amount": 1,
                "reason": "Promotional content detected",
                "score": 0.82
            }
        ]
    }
}
```

#### `POST /strikes/:groupId/:userId`
**Add Strikes to User**

Adds strikes to a specific user (admin only).

**URL Parameters:**
- `groupId` - The group's chat ID
- `userId` - The user's Telegram ID

**Headers:**
```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Request Body:**
```json
{
    "amount": 2,
    "reason": "Repeated spam posting"
}
```

**Response:**
```json
{
    "success": true,
    "message": "Strikes added successfully",
    "strikes": {
        "previous": 1,
        "current": 3,
        "added": 2
    },
    "action": {
        "taken": "user_muted",
        "duration": 60,
        "reason": "Reached mute threshold"
    }
}
```

### 📊 System Endpoints

#### `GET /system/stats`
**Get System Statistics**

Returns global bot statistics (super admin only).

**Headers:**
```http
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
    "system": {
        "uptime": "5 days, 12 hours",
        "version": "2.0.0",
        "environment": "production"
    },
    "groups": {
        "total": 25,
        "active": 23,
        "registered": 25
    },
    "users": {
        "total": 1847,
        "active": 892,
        "withStrikes": 156
    },
    "activity": {
        "messagesProcessed": 45678,
        "deletionsToday": 43,
        "strikesIssued": 89,
        "falsepositives": 2
    },
    "performance": {
        "avgResponseTime": 145,
        "apiRequests": 1234,
        "errorRate": 0.02
    }
}
```

#### `GET /logs/:groupId`
**Get Group Audit Logs**

Returns audit logs for a specific group (admin only).

**URL Parameters:**
- `groupId` - The group's chat ID

**Query Parameters:**
- `limit` - Maximum number of logs to return (default: 50, max: 100)
- `offset` - Number of logs to skip (for pagination)

**Headers:**
```http
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
    "groupId": "-1001234567890",
    "logs": [
        {
            "id": 789,
            "timestamp": "2025-08-07T12:30:00.000Z",
            "type": "AUTO-STRIKE",
            "user": {
                "id": 123456789,
                "firstName": "John",
                "username": "johndoe"
            },
            "data": {
                "messageExcerpt": "Buy crypto now!",
                "classificationScore": 0.85,
                "strikes": 1
            }
        },
        {
            "id": 788,
            "timestamp": "2025-08-07T11:45:00.000Z", 
            "type": "MANUAL-STRIKE-REMOVE",
            "user": {
                "id": 987654321,
                "firstName": "Jane",
                "username": "janedoe"
            },
            "admin": {
                "id": 555666777,
                "firstName": "Admin",
                "username": "adminuser"
            },
            "data": {
                "amount": 1,
                "reason": "Appeal approved"
            }
        }
    ],
    "pagination": {
        "total": 156,
        "limit": 50,
        "offset": 0,
        "hasMore": true
    }
}
```

## 🛡️ Error Responses

### Standard Error Format

All API errors follow a consistent format:

```json
{
    "error": {
        "code": "AUTHENTICATION_FAILED",
        "message": "Invalid or expired token",
        "details": "The provided JWT token has expired",
        "timestamp": "2025-08-07T12:00:00.000Z"
    }
}
```

### HTTP Status Codes

| Status | Code | Description |
|--------|------|-------------|
| **200** | OK | Request successful |
| **201** | Created | Resource created successfully |
| **400** | Bad Request | Invalid request parameters |
| **401** | Unauthorized | Authentication required |
| **403** | Forbidden | Insufficient permissions |
| **404** | Not Found | Resource not found |
| **429** | Too Many Requests | Rate limit exceeded |
| **500** | Internal Server Error | Server error |

### Common Error Codes

#### Authentication Errors
```json
{
    "error": {
        "code": "AUTHENTICATION_FAILED",
        "message": "Invalid authentication credentials"
    }
}
```

```json
{
    "error": {
        "code": "TOKEN_EXPIRED", 
        "message": "JWT token has expired"
    }
}
```

```json
{
    "error": {
        "code": "INVALID_INIT_DATA",
        "message": "Invalid Telegram WebApp initData"
    }
}
```

#### Permission Errors
```json
{
    "error": {
        "code": "INSUFFICIENT_PERMISSIONS",
        "message": "User is not an administrator of this group"
    }
}
```

```json
{
    "error": {
        "code": "GROUP_ACCESS_DENIED",
        "message": "User does not have access to this group"
    }
}
```

#### Validation Errors
```json
{
    "error": {
        "code": "INVALID_INPUT",
        "message": "Validation failed",
        "details": {
            "spamThreshold": "Must be between 0 and 1",
            "alertLevel": "Must be a positive integer"
        }
    }
}
```

#### Rate Limiting
```json
{
    "error": {
        "code": "RATE_LIMIT_EXCEEDED",
        "message": "Too many requests",
        "retryAfter": 900
    }
}
```

#### Resource Errors
```json
{
    "error": {
        "code": "GROUP_NOT_FOUND",
        "message": "Group not found or bot not present"
    }
}
```

```json
{
    "error": {
        "code": "USER_NOT_FOUND", 
        "message": "User not found in group"
    }
}
```

## 🔒 Security Features

### Rate Limiting

The API implements comprehensive rate limiting:

- **General endpoints**: 100 requests per 15 minutes per IP
- **Authentication endpoints**: 5 requests per 15 minutes per IP  
- **Health check**: Higher limits for monitoring
- **Super admin**: Higher limits for administrative tasks

### CORS Protection

Automatic CORS configuration allows:
- `web.telegram.org` (Telegram WebApp)
- `localhost` and `127.0.0.1` (Development)
- `*.ngrok.io` and `*.ngrok.app` (Testing)
- Custom configured domains

### Input Validation

All endpoints include:
- **Parameter validation**: Required fields checked
- **Type checking**: Correct data types enforced
- **Range validation**: Numeric limits enforced
- **Sanitization**: XSS and injection prevention

### Authentication Security

- **JWT tokens**: Secure, stateless authentication
- **HMAC verification**: Telegram data integrity checking
- **Token expiration**: Automatic token invalidation
- **Replay protection**: Timestamp validation

## 🚀 Usage Examples

### Complete Integration Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>Bot Management Dashboard</title>
    <script async src="https://telegram.org/js/telegram-widget.js?22"></script>
</head>
<body>
    <!-- Telegram Login Widget -->
    <script async src="https://telegram.org/js/telegram-widget.js?22" 
            data-telegram-login="your_bot_name" 
            data-size="large" 
            data-onauth="onTelegramAuth(user)" 
            data-request-access="write">
    </script>

    <div id="dashboard" style="display: none;">
        <h1>Bot Management Dashboard</h1>
        <div id="groups"></div>
        <div id="settings"></div>
    </div>

    <script>
        let authToken = null;
        
        // Handle Telegram Login Widget authentication
        async function onTelegramAuth(user) {
            try {
                const response = await fetch('/api/v1/auth/login-widget', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(user)
                });
                
                const result = await response.json();
                if (result.success) {
                    authToken = result.token;
                    await loadDashboard();
                }
            } catch (error) {
                console.error('Authentication failed:', error);
            }
        }
        
        // Load user's groups and dashboard
        async function loadDashboard() {
            try {
                // Get user's groups
                const groupsResponse = await fetch('/api/v1/groups', {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const { groups } = await groupsResponse.json();
                
                // Display groups
                const groupsDiv = document.getElementById('groups');
                groupsDiv.innerHTML = '<h2>Your Groups</h2>';
                
                for (const group of groups) {
                    const groupDiv = document.createElement('div');
                    groupDiv.innerHTML = `
                        <h3>${group.chatTitle}</h3>
                        <button onclick="loadGroupSettings('${group.chatId}')">
                            Manage Settings
                        </button>
                        <button onclick="loadGroupStats('${group.chatId}')">
                            View Statistics
                        </button>
                    `;
                    groupsDiv.appendChild(groupDiv);
                }
                
                document.getElementById('dashboard').style.display = 'block';
                
            } catch (error) {
                console.error('Failed to load dashboard:', error);
            }
        }
        
        // Load group settings
        async function loadGroupSettings(groupId) {
            try {
                const response = await fetch(`/api/v1/groups/${groupId}/settings`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const { settings } = await response.json();
                
                const settingsDiv = document.getElementById('settings');
                settingsDiv.innerHTML = `
                    <h2>Group Settings</h2>
                    <form onsubmit="updateSettings(event, '${groupId}')">
                        <label>Alert Level: 
                            <input type="number" name="alertLevel" value="${settings.alertLevel}" min="0">
                        </label><br>
                        <label>Mute Level: 
                            <input type="number" name="muteLevel" value="${settings.muteLevel}" min="0">
                        </label><br>
                        <label>Spam Threshold: 
                            <input type="number" name="spamThreshold" value="${settings.spamThreshold}" 
                                   min="0" max="1" step="0.1">
                        </label><br>
                        <label>Profanity Filter: 
                            <input type="checkbox" name="profanityEnabled" 
                                   ${settings.profanityEnabled ? 'checked' : ''}>
                        </label><br>
                        <button type="submit">Update Settings</button>
                    </form>
                `;
                
            } catch (error) {
                console.error('Failed to load settings:', error);
            }
        }
        
        // Update group settings
        async function updateSettings(event, groupId) {
            event.preventDefault();
            
            const formData = new FormData(event.target);
            const settings = {
                alertLevel: parseInt(formData.get('alertLevel')),
                muteLevel: parseInt(formData.get('muteLevel')),
                spamThreshold: parseFloat(formData.get('spamThreshold')),
                profanityEnabled: formData.get('profanityEnabled') === 'on'
            };
            
            try {
                const response = await fetch(`/api/v1/groups/${groupId}/settings`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(settings)
                });
                
                const result = await response.json();
                if (result.success) {
                    alert('Settings updated successfully!');
                }
                
            } catch (error) {
                console.error('Failed to update settings:', error);
                alert('Failed to update settings');
            }
        }
        
        // Load group statistics  
        async function loadGroupStats(groupId) {
            try {
                const response = await fetch(`/api/v1/groups/${groupId}/stats`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const { stats } = await response.json();
                
                alert(`Group Statistics:
                Members: ${stats.totalMembers}
                Deletions Today: ${stats.deletionsToday}
                Active Strikes: ${stats.activeStrikes}
                Messages/Day: ${stats.avgMessagesPerDay}`);
                
            } catch (error) {
                console.error('Failed to load statistics:', error);
            }
        }
    </script>
</body>
</html>
```

### Telegram Mini App Example

```html
<!DOCTYPE html>
<html>
<head>
    <title>Bot Mini App</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
</head>
<body>
    <div id="app">
        <h1>Group Management</h1>
        <div id="content">Loading...</div>
    </div>

    <script>
        // Initialize Telegram WebApp
        const tg = window.Telegram.WebApp;
        tg.expand();
        
        let authToken = null;
        
        // Authenticate with Mini App
        async function authenticate() {
            try {
                const initData = tg.initData;
                
                const response = await fetch('/api/v1/webapp/auth', {
                    method: 'POST',
                    headers: {
                        'X-Telegram-Init-Data': initData,
                        'Content-Type': 'application/json'
                    }
                });
                
                const result = await response.json();
                if (result.success) {
                    authToken = result.token;
                    await loadApp();
                }
                
            } catch (error) {
                console.error('Authentication failed:', error);
                document.getElementById('content').innerHTML = 'Authentication failed';
            }
        }
        
        // Load mini app content
        async function loadApp() {
            try {
                // Get user's groups using WebApp endpoint
                const response = await fetch('/api/v1/webapp/user/groups', {
                    headers: { 'X-Telegram-Init-Data': tg.initData }
                });
                const { groups } = await response.json();
                
                let content = '<h2>Your Groups</h2>';
                for (const group of groups) {
                    content += `
                        <div style="border: 1px solid #ccc; margin: 10px; padding: 10px;">
                            <h3>${group.chatTitle}</h3>
                            <p>Members: ${group.memberCount}</p>
                            <p>Your Strikes: ${group.strikes.count}</p>
                            ${group.isAdmin ? `
                                <button onclick="manageGroup('${group.chatId}')">
                                    Manage Group
                                </button>
                            ` : ''}
                        </div>
                    `;
                }
                
                document.getElementById('content').innerHTML = content;
                
            } catch (error) {
                console.error('Failed to load app:', error);
            }
        }
        
        // Manage specific group
        async function manageGroup(groupId) {
            try {
                const response = await fetch(`/api/v1/webapp/group/${groupId}/settings`, {
                    headers: { 'X-Telegram-Init-Data': tg.initData }
                });
                const data = await response.json();
                
                let content = `<h2>${data.groupTitle} Settings</h2>`;
                content += `
                    <form onsubmit="updateGroupSettings(event, '${groupId}')">
                        <h3>Penalty Levels</h3>
                        <label>Alert Level: 
                            <input type="number" name="alert" value="${data.settings.penalties.alert}">
                        </label><br>
                        <label>Mute Level: 
                            <input type="number" name="mute" value="${data.settings.penalties.mute}">
                        </label><br>
                        
                        <h3>Detection Settings</h3>
                        <label>Spam Threshold: 
                            <input type="range" name="spamThreshold" 
                                   value="${data.settings.detection.spamThreshold}" 
                                   min="0" max="1" step="0.1">
                        </label><br>
                        
                        <button type="submit">Update Settings</button>
                        <button type="button" onclick="loadApp()">Back to Groups</button>
                    </form>
                `;
                
                document.getElementById('content').innerHTML = content;
                
            } catch (error) {
                console.error('Failed to load group settings:', error);
            }
        }
        
        // Update group settings
        async function updateGroupSettings(event, groupId) {
            event.preventDefault();
            
            const formData = new FormData(event.target);
            const settings = {
                penalties: {
                    alert: parseInt(formData.get('alert')),
                    mute: parseInt(formData.get('mute'))
                },
                detection: {
                    spamThreshold: parseFloat(formData.get('spamThreshold'))
                }
            };
            
            try {
                const response = await fetch(`/api/v1/webapp/group/${groupId}/settings`, {
                    method: 'PUT',
                    headers: {
                        'X-Telegram-Init-Data': tg.initData,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(settings)
                });
                
                const result = await response.json();
                if (result.success) {
                    tg.showAlert('Settings updated successfully!');
                    await loadApp();
                }
                
            } catch (error) {
                console.error('Failed to update settings:', error);
                tg.showAlert('Failed to update settings');
            }
        }
        
        // Start the app
        authenticate();
    </script>
</body>
</html>
```

## 🔧 Configuration

### Environment Variables

```bash
# API Configuration
API_PORT=3000
API_BASE_URL=http://localhost:3000
NODE_ENV=development

# Authentication
JWT_SECRET=your-super-long-random-secret-string-here
TELEGRAM_BOT_SECRET=your-bot-secret-from-botfather

# CORS Configuration  
ALLOWED_ORIGIN=http://localhost:8080
ADDITIONAL_ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX_REQUESTS=5

# Security
TRUST_PROXY=false
```

### Swagger Configuration

The API automatically generates Swagger documentation available at:
`http://localhost:3000/api/docs`

### CORS Configuration

The API automatically configures CORS for:
- Telegram WebApp domains
- localhost (development)
- ngrok tunnels (testing) 
- Custom configured domains

## 🧪 Testing

### Manual Testing

```bash
# Test health endpoint
curl http://localhost:3000/api/v1/webapp/health

# Test authentication (replace with your data)
curl -X POST http://localhost:3000/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"id": 123456789, "first_name": "Test", "auth_date": 1678886400, "hash": "test_hash"}'

# Test with JWT token
curl http://localhost:3000/api/v1/groups \
  -H "Authorization: Bearer your-jwt-token-here"

# Test with WebApp initData
curl http://localhost:3000/api/v1/webapp/user/groups \
  -H "X-Telegram-Init-Data: your-init-data-here"
```

### Integration Testing

The project includes comprehensive API tests in `__tests__/api/`:
- Authentication tests
- Endpoint functionality tests
- Error handling tests
- Security tests

## 📝 Best Practices

### Authentication
1. Always validate JWT tokens on server-side
2. Use HTTPS in production
3. Implement proper token refresh mechanisms
4. Store tokens securely on client-side

### Error Handling
1. Always check response status codes
2. Implement proper error messaging for users
3. Log errors for debugging
4. Provide fallback options for failed requests

### Performance
1. Implement client-side caching where appropriate
2. Use pagination for large data sets
3. Minimize API calls with batch operations
4. Monitor rate limits

### Security
1. Never expose API keys in client-side code
2. Validate all user inputs
3. Implement proper CORS policies
4. Use HTTPS for all communications

---

**For bot command documentation, see [BOT_COMMANDS.md](./BOT_COMMANDS.md)**
