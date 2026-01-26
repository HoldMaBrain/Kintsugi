# Kintsugi API Reference

## Base URL
`http://localhost:3001/api`

## Authentication
All requests require the `x-user-email` header set to the authenticated user's email.

## Endpoints

### User Endpoints

#### GET `/user`
Get current user information.

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "user" | "admin",
    "created_at": "timestamp"
  }
}
```

### Conversation Endpoints

#### GET `/conversations`
Get all conversations for the current user (or all conversations if admin).

**Response:**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "created_at": "timestamp",
      "delete_after": "timestamp",
      "messages": [...]
    }
  ]
}
```

#### GET `/conversations/:id`
Get a specific conversation.

**Response:**
```json
{
  "conversation": {
    "id": "uuid",
    "user_id": "uuid",
    "created_at": "timestamp",
    "messages": [...]
  }
}
```

#### POST `/conversations`
Create a new conversation.

**Response:**
```json
{
  "conversation": {
    "id": "uuid",
    "user_id": "uuid",
    "created_at": "timestamp"
  }
}
```

#### DELETE `/conversations/:id`
Delete a conversation.

**Response:**
```json
{
  "success": true
}
```

### Chat Endpoints

#### POST `/chat/send`
Send a message in a conversation.

**Request:**
```json
{
  "conversationId": "uuid",
  "message": "User message text"
}
```

**Response:**
```json
{
  "message": {
    "id": "uuid",
    "conversation_id": "uuid",
    "sender": "ai",
    "content": "AI response",
    "risk_level": "low" | "medium" | "high",
    "flagged": false,
    "created_at": "timestamp"
  },
  "status": "delivered" | "pending",
  "riskLevel": "low" | "medium" | "high"
}
```

### Admin Endpoints

#### GET `/admin/flagged`
Get all flagged messages (admin only).

**Response:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "content": "AI response text",
      "risk_level": "high",
      "flagged": true,
      "conversations": {
        "users": {
          "email": "user@example.com"
        },
        "messages": [...]
      }
    }
  ]
}
```

#### POST `/admin/review`
Review a flagged message (admin only).

**Request:**
```json
{
  "messageId": "uuid",
  "verdict": "safe" | "unsafe",
  "feedback": "Optional feedback text",
  "correctedResponse": "Corrected response if unsafe"
}
```

**Response:**
```json
{
  "success": true
}
```

#### GET `/admin/metrics`
Get system metrics (admin only).

**Response:**
```json
{
  "totalMessages": 100,
  "flaggedCount": 5,
  "highRiskCount": 2,
  "mediumRiskCount": 3,
  "flaggedPercentage": 5.0,
  "correctionRate": 40.0,
  "totalReviews": 10
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message"
}
```

**Status Codes:**
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden (admin only)
- `500` - Internal Server Error
