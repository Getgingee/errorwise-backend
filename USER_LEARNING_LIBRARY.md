# User-Specific Learning Library

## Overview

The Learning Library is now **user-specific**, meaning each user has their own personal knowledge base separate from the system-wide library.

### Key Changes

1. **UserLearningLibrary Model** - New database table for storing user-specific learned errors
2. **Personal Knowledge Base** - Each user builds their own collection of solutions
3. **Privacy** - User solutions are private by default (not visible to other users)
4. **Separate from System Library** - Distinct from pre-built system solutions

---

## Architecture

### Before (System-Wide Learning)
```
All Users → Shared Error Patterns → System Library (All Users See)
```

### After (User-Specific Learning)
```
User 1 → User 1's Learning Library (Private)
User 2 → User 2's Learning Library (Private)
User 3 → User 3's Learning Library (Private)
System → System Library (Pre-built, Shared)
```

---

## Database Model: UserLearningLibrary

### Fields

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Unique entry identifier |
| `userId` | UUID | Owner of this entry |
| `title` | String | User-friendly title |
| `errorMessage` | Text | Original error they encountered |
| `errorCode` | String | Error code (ERR_001, 404, etc) |
| `errorPattern` | Text | Normalized pattern for matching similar errors |
| `category` | String | Category (programming, networking, automotive, etc) |
| `subcategory` | String | More specific category |
| `language` | String | Programming language (javascript, python, etc) |
| `framework` | String | Framework (React, Django, etc) |
| `explanation` | Text | Why this error occurs |
| `solution` | Text | Step-by-step solution |
| `codeExample` | Text | Code snippet showing the fix |
| `commonCauses` | JSONB | Array of common causes |
| `preventionTips` | JSONB | Tips to prevent in future |
| `difficulty` | Enum | beginner, intermediate, advanced |
| `timeToSolve` | Integer | How long it took to solve (minutes) |
| `source` | Enum | Where the solution came from: ai, forum, documentation, stackoverflow, personal |
| `sourceUrl` | Text | Link to forum/documentation |
| `tags` | JSONB | Custom tags for organization |
| `platforms` | JSONB | Platforms affected (Windows, Mac, Linux, etc) |
| `referenceCount` | Integer | How many times user looked it up |
| `userRating` | Integer | User's 1-5 rating of this solution |
| `lastReferencedAt` | DateTime | When user last looked it up |
| `isVerified` | Boolean | User confirmed solution still works |
| `isShared` | Boolean | Whether to share with community (future) |
| `status` | Enum | active, archived, deprecated |
| `notes` | Text | User's additional notes |
| `createdAt` | DateTime | When user added this |
| `updatedAt` | DateTime | Last modification |

### Indexes

- `userId` - Fast user lookups
- `userId + category` - Category filtering
- `userId + status` - Status filtering
- `userId + errorPattern` - Pattern matching
- `errorCode` - Global error code search

---

## API Endpoints

All user learning library endpoints require authentication (`authMiddleware`).

### Get User's Learning Library
```
GET /api/user/learning-library
Query Params:
  - category (optional): Filter by category
  - search (optional): Search title, error message, solution
  - page: Page number (default: 1)
  - limit: Results per page (default: 20)
  - sort: 'recent', 'popular', 'top-rated' (default: recent)

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Connection Timeout Error",
      "errorMessage": "connection timeout at socket.js:123",
      "category": "network",
      "difficulty": "intermediate",
      "tags": ["javascript", "network", "timeout"],
      "referenceCount": 5,
      "userRating": 5,
      "lastReferencedAt": "2025-01-15T10:30:00Z",
      "isVerified": true,
      "createdAt": "2025-01-10T08:00:00Z"
    }
  ],
  "pagination": {
    "total": 42,
    "page": 1,
    "pages": 3,
    "hasMore": true
  }
}
```

### Get Learning Library Categories
```
GET /api/user/learning-library/categories

Response:
{
  "success": true,
  "categories": [
    {
      "category": "programming",
      "count": 15,
      "avgRating": 4.8
    },
    {
      "category": "network",
      "count": 8,
      "avgRating": 4.6
    }
  ]
}
```

### Get Single Learning Entry
```
GET /api/user/learning-library/{id}

Response:
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Connection Timeout Error",
    "errorMessage": "...",
    "explanation": "...",
    "solution": "...",
    "codeExample": "...",
    "commonCauses": ["network issue", "firewall", "dns problem"],
    "preventionTips": ["use connection pooling", "set timeouts"],
    "timeToSolve": 45,
    "source": "stackoverflow",
    "sourceUrl": "https://stackoverflow.com/...",
    "userRating": 5,
    "referenceCount": 5,
    "lastReferencedAt": "2025-01-15T10:30:00Z",
    "isVerified": true
  }
}
```

### Add to Learning Library
```
POST /api/user/learning-library
Body:
{
  "errorMessage": "connection timeout at socket.js:123",
  "title": "Connection Timeout - How to Fix", (optional)
  "explanation": "This happens when the server is too slow to respond",
  "solution": "1. Check server health\n2. Increase timeout\n3. Use connection pooling",
  "category": "network",
  "subcategory": "connectivity",
  "language": "javascript",
  "framework": "node.js",
  "difficulty": "intermediate",
  "timeToSolve": 45,
  "source": "stackoverflow",
  "sourceUrl": "https://stackoverflow.com/...",
  "tags": ["javascript", "network", "timeout", "node.js"],
  "codeExample": "socket.setTimeout(5000);",
  "commonCauses": ["slow server", "network latency", "firewall"],
  "preventionTips": ["monitor response times", "use connection pooling"],
  "notes": "Remember to also check firewall settings"
}

Response:
{
  "success": true,
  "message": "Added to your learning library",
  "data": { ...entry }
}
```

### Update Learning Entry
```
PUT /api/user/learning-library/{id}
Body:
{
  "userRating": 4,
  "notes": "Updated solution - works better with retries",
  "isVerified": true,
  "tags": ["javascript", "network", "retry-logic"]
}

Response:
{
  "success": true,
  "message": "Entry updated",
  "data": { ...updated entry }
}
```

### Delete from Learning Library
```
DELETE /api/user/learning-library/{id}

Response:
{
  "success": true,
  "message": "Entry deleted"
}
```
Note: Soft delete - status set to 'archived'

### Get Learning Statistics
```
GET /api/user/learning-library/stats

Response:
{
  "success": true,
  "data": {
    "totalEntries": 42,
    "totalReferences": 156,
    "avgRating": "4.7",
    "byCategory": [
      {
        "category": "programming",
        "count": 15,
        "avgRating": "4.8",
        "totalReferences": "78"
      }
    ],
    "lastAdded": {
      "title": "React Hook Dependencies Issue",
      "createdAt": "2025-01-15T10:30:00Z"
    }
  }
}
```

---

## Features

### 1. Personal Knowledge Base
- Users build their own searchable database of solved errors
- Only they can see their entries
- Better than relying solely on system library

### 2. Smart Organization
- Automatic categorization (programming, network, automotive, appliances, etc)
- User-defined tags for custom organization
- Subcategories for granular filtering

### 3. Tracking & Analytics
- Reference count - how many times user looked it up
- User rating - 1-5 star rating of usefulness
- Last referenced date - quickly find frequently used solutions
- Time to solve - track learning progress

### 4. Rich Content
- Error code & pattern for pattern matching
- Code examples with syntax highlighting
- Common causes list
- Prevention tips
- Custom notes for variations

### 5. Source Attribution
- Track where solution came from (AI, forum, documentation, personal)
- Link to original source for verification
- Helps user remember reference material

### 6. Verification
- Mark solutions as verified when tested again
- Track which solutions still work
- Archive outdated solutions

---

## Usage Scenarios

### Scenario 1: Developer's Coding Library
```javascript
// Jane is a JavaScript developer
// She adds this to her learning library when debugging a React issue

POST /api/user/learning-library
{
  "errorMessage": "Cannot read property 'map' of undefined",
  "title": "React - undefined .map() Error",
  "explanation": "Usually happens when state hasn't loaded yet",
  "solution": "Add optional chaining or check if array exists",
  "codeExample": "{items?.map(...)} or {items && items.map(...)}",
  "category": "programming",
  "language": "javascript",
  "framework": "react",
  "tags": ["javascript", "react", "hooks", "state-management"]
}

// Later, when she encounters a similar error, she searches her library:
GET /api/user/learning-library?search=undefined%20map
// Instantly finds her documented solution
```

### Scenario 2: Home User's Tech Support Library
```javascript
// Bob is not a programmer - he's learning to fix his home equipment
// He documents solutions to his printer issues

POST /api/user/learning-library
{
  "errorMessage": "HP Printer - Paper Jam Error",
  "title": "How to Fix HP Printer Paper Jam",
  "explanation": "Paper gets stuck in the paper path",
  "solution": "1. Turn off printer\n2. Open all covers\n3. Remove stuck paper carefully\n4. Close covers and restart",
  "category": "appliances",
  "source": "youtube",
  "tags": ["hp-printer", "maintenance", "paper-jam"],
  "timeToSolve": 20,
  "notes": "Check left side of printer first - that's where it usually jams"
}

// Next time paper jams, he just looks it up instead of searching YouTube again
GET /api/user/learning-library/{id}
// Reference count increments each time he reads it
```

### Scenario 3: Car Owner's Maintenance Log
```javascript
// Ahmed tracks his car maintenance

POST /api/user/learning-library
{
  "errorMessage": "Subaru - Check Engine Light",
  "title": "My Subaru Check Engine Light Issues",
  "explanation": "O2 sensor was failing",
  "solution": "Replaced O2 sensor - cost $200 at dealership",
  "category": "automotive",
  "source": "personal",
  "tags": ["subaru-outback", "check-engine", "sensors"],
  "timeToSolve": 0,
  "notes": "Dealership said ~$400 but I found cheaper parts online"
}

// Later, if light comes on again:
GET /api/user/learning-library?search=check%20engine

// User can quickly reference his previous solution
```

---

## Comparison: User Library vs System Library

| Aspect | User Library | System Library |
|--------|-------------|-----------------|
| **Visibility** | Private, user-only | Visible to all users |
| **Customization** | Fully customizable | Pre-built by system |
| **Ownership** | User owns their entries | System owns entries |
| **Relevance** | Highly relevant to user | General knowledge |
| **Size** | Few to hundreds | Thousands of pre-built entries |
| **Update Control** | User can update anytime | System manages |
| **Sharing** | Private (future: optional sharing) | Always shared |
| **Examples** | Personal experiences | Best practices |
| **Use Case** | Personal reference | Community knowledge |

---

## Implementation Details

### Finding Similar Errors
The system can match user's current error against their learning library:

```javascript
// When user encounters error, system normalizes it:
const pattern = normalizeErrorPattern(
  "Cannot read property 'map' of undefined",
  'reference-error',
  'javascript'
);

// Searches user's library for similar patterns:
const similar = await UserLearningLibrary.findAll({
  where: {
    userId: userA.id,
    errorPattern: {
      [Op.iLike]: `%${pattern}%`
    },
    status: 'active'
  }
});

// Returns user's documented solution
```

### Privacy & Security
- All queries include `userId` filter
- Users can only access their own entries
- Soft delete (archive) prevents accidental loss
- No cross-user visibility unless explicitly shared

---

## Migration Path

### Phase 1 (Current)
- New UserLearningLibrary model
- API endpoints for personal library
- Users manually add errors they solve

### Phase 2 (Planned)
- Auto-suggest adding to user library after solving
- Share button to contribute to system library
- Community library with privacy controls
- Analytics on most-referenced solutions

### Phase 3 (Future)
- Team libraries (share with teammates)
- Public sharing with attribution
- Solution voting/rating system
- AI-generated learning suggestions

---

## Benefits

1. **Personal Knowledge Base** - Users build searchable database of their experiences
2. **Faster Problem-Solving** - Reference previous solutions instead of re-searching
3. **Better Organization** - Personal tagging and categorization system
4. **Learning Progress** - Track what problems they've solved
5. **Privacy** - Solutions remain private unless explicitly shared
6. **Separation** - Clear distinction from system library
7. **Accountability** - User owns and verifies their solutions
8. **Community-Ready** - Foundation for optional sharing features

---

## Database Setup

```sql
-- UserLearningLibrary table is created by migration
-- Includes indexes for:
-- - Fast user lookups
-- - Category filtering  
-- - Pattern matching
-- - Error code searches

-- Ensure foreign key references User table
ALTER TABLE user_learning_libraries
ADD CONSTRAINT fk_user_id
FOREIGN KEY (userId) REFERENCES users(id)
ON DELETE CASCADE;
```

---

## Next Steps

1. Test user library endpoints
2. Add auto-suggest feature after solving errors
3. Implement sharing/contribution system
4. Add library analytics dashboard
5. Create mobile app for library access
6. Build team/organization library features
