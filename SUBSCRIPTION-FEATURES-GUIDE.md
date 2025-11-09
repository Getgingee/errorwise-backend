# ErrorWise Subscription Features Guide

## Overview
This guide explains what happens when users subscribe to different plans and what features are automatically enabled.

---

## 🎯 Subscription Tiers

### 1. **FREE Tier** (Default)
**Cost**: $0/month  
**Features**:
- ✅ Basic error analysis with Google Gemini AI
- ✅ 10 queries per day
- ✅ Standard response time
- ✅ Email support
- ❌ No team features
- ❌ No advanced AI models
- ❌ No URL scraping

**Automatically Granted**: When user registers

---

### 2. **PRO Tier** 💎
**Cost**: $3/month  
**Product ID**: `pdt_OKdKW76gtO6vBWltBBV5d`

**What Happens When User Subscribes**:
1. ✅ **Webhook fires**: `subscription.active`
2. ✅ **Database updated**:
   - User's `subscriptionTier` → `'pro'`
   - User's `subscriptionStatus` → `'active'`
   - Subscription record created with end date (+1 month)
3. ✅ **Features unlocked**:

#### Pro Features:
- 🤖 **Advanced AI**: Claude Haiku model access
- 🔥 **Unlimited queries**: No daily limits
- 🌐 **URL scraping**: Can analyze errors from URLs
- ⚡ **Priority support**: Faster response times
- 📊 **Advanced analytics**: Detailed error insights
- 💾 **History**: Extended query history
- ❌ **No team features**

**Frontend Changes**:
- Badge shows "PRO" 
- Can access pro-only features
- Dashboard shows unlimited usage

---

### 3. **TEAM Tier** 👥
**Cost**: $8/month  
**Product ID**: `pdt_Zbn5YM2pCgkKcdQyV0ouY`

**What Happens When User Subscribes**:
1. ✅ **Webhook fires**: `subscription.active`
2. ✅ **Database updated**:
   - User's `subscriptionTier` → `'team'`
   - User's `subscriptionStatus` → `'active'`
   - Subscription record created
3. ✅ **User becomes**: **TEAM OWNER/ADMIN**
4. ✅ **Can now create teams** via `/api/teams` endpoint

#### Team Features:
- 🤖 **Best AI**: Claude Sonnet model access
- 🔥 **Unlimited queries**: No limits
- 🌐 **URL scraping**: Full access
- 👥 **Team Management**:
  - ✅ Create unlimited teams
  - ✅ Invite unlimited team members
  - ✅ Assign roles (owner/admin/member)
  - ✅ Manage member permissions
  - ✅ Remove team members
- 📤 **Error Sharing**: Share errors with team
- 💬 **Team Chat**: Collaborate on errors
- 🎥 **Video Chat**: Built-in video rooms for each team
- 📊 **Team Analytics**: View team-wide statistics
- 🎯 **Advanced Permissions**: Fine-grained access control

**Frontend Changes**:
- Badge shows "TEAM"
- Team management UI unlocked
- Can create/manage teams
- Team dashboard accessible

---

## 🔄 Automatic Webhook Processing

### When Payment Confirmed

#### Step 1: DodoPayments Checkout
```
User clicks "Upgrade to Pro Plan"
  ↓
Redirects to DodoPayments checkout
  ↓
User completes payment
  ↓
DodoPayments processes payment
```

#### Step 2: Webhook Fired
```
DodoPayments → POST /api/webhooks/dodo
Event: subscription.active
Data: {
  id: "sub_xxx",
  metadata: {
    userId: "123",
    planId: "pro",
    planName: "Pro Plan"
  }
}
```

#### Step 3: Backend Processing
```javascript
// File: src/services/paymentService.js
// Handler: handleSubscriptionActive()

1. Verify webhook signature ✓
2. Extract user ID and plan from metadata
3. Update Subscription table:
   - Create/update subscription record
   - Set tier to "pro" or "team"
   - Set status to "active"
   - Set end date (+1 month from now)
4. Update User table:
   - Set subscriptionTier to plan tier
   - Set subscriptionStatus to "active"
   - Set subscriptionEndDate
5. Return success response
```

#### Step 4: Frontend Updates
```
User redirected back to ErrorWise
  ↓
Frontend fetches user data
  ↓
Sees subscriptionTier = "pro" or "team"
  ↓
Unlocks premium features
  ↓
Shows success message
```

---

## 👥 Team Management Flow

### For TEAM Tier Users

#### 1. Create Team
**Endpoint**: `POST /api/teams`  
**Requires**: Active TEAM subscription

```javascript
// Request
{
  "name": "Frontend Team",
  "description": "Team for frontend error handling",
  "maxMembers": -1  // -1 = unlimited
}

// Response
{
  "team": {
    "id": 1,
    "name": "Frontend Team",
    "owner_id": "user-uuid",
    "video_room_id": "errorwise-team-uuid",
    "role": "owner",
    "unlimited_members": true
  }
}
```

**What Happens**:
1. ✅ Team created in database
2. ✅ User automatically added as OWNER
3. ✅ Unique video room ID generated
4. ✅ Owner gets full permissions:
   ```javascript
   {
     can_invite_members: true,
     can_manage_errors: true,
     can_start_video_chat: true,
     can_view_analytics: true
   }
   ```

#### 2. Invite Team Members
**Endpoint**: `POST /api/teams/:teamId/invite`  
**Requires**: Owner or Admin role

```javascript
// Request
{
  "email": "teammate@example.com",
  "role": "member"  // or "admin"
}

// Response
{
  "message": "Invitation sent",
  "member": {
    "user_id": "new-user-uuid",
    "role": "member",
    "status": "pending"
  }
}
```

**What Happens**:
1. ✅ TeamMember record created with status = "pending"
2. ✅ Email sent to invitee (if email service configured)
3. ✅ Invitee sees pending invitation
4. ✅ Can accept/reject via `/api/teams/:teamId/join`

**Member Roles**:
- **Owner**: Full control, created team, cannot be removed
- **Admin**: Can invite members, manage team, share errors
- **Member**: Can view shared errors, participate in chats

#### 3. Accept Invitation
**Endpoint**: `POST /api/teams/:teamId/join`

**What Happens**:
1. ✅ TeamMember status changed: `pending` → `active`
2. ✅ `joined_at` timestamp set
3. ✅ User can now access team features
4. ✅ User appears in team member list

**Important**: Invited members DON'T need TEAM subscription - only the owner needs it!

#### 4. Share Errors with Team
**Endpoint**: `POST /api/teams/:teamId/errors`

```javascript
{
  "errorQuery": "TypeError: Cannot read property...",
  "solution": "AI-generated solution",
  "visibility": "team"  // or "private"
}
```

**What Happens**:
1. ✅ Error saved to SharedError table
2. ✅ All team members can view it
3. ✅ Team members can comment/collaborate
4. ✅ Searchable in team error library

---

## 🎨 Feature Access Matrix

| Feature | FREE | PRO | TEAM |
|---------|------|-----|------|
| **AI Model** | Gemini | Claude Haiku | Claude Sonnet |
| **Daily Queries** | 10 | Unlimited | Unlimited |
| **URL Scraping** | ❌ | ✅ | ✅ |
| **Query History** | 7 days | 30 days | Unlimited |
| **Create Teams** | ❌ | ❌ | ✅ |
| **Invite Members** | ❌ | ❌ | ✅ (unlimited) |
| **Share Errors** | ❌ | ❌ | ✅ |
| **Video Chat** | ❌ | ❌ | ✅ |
| **Team Analytics** | ❌ | ❌ | ✅ |
| **Priority Support** | ❌ | ✅ | ✅✅ |

---

## 🔒 Permission System

### Team Member Permissions

#### Owner (Auto-assigned when creating team)
```javascript
{
  can_invite_members: true,
  can_manage_errors: true,
  can_start_video_chat: true,
  can_view_analytics: true
}
```

#### Admin (Can be promoted by owner)
```javascript
{
  can_invite_members: true,
  can_manage_errors: true,
  can_start_video_chat: true,
  can_view_analytics: false
}
```

#### Member (Default for invited users)
```javascript
{
  can_invite_members: false,
  can_manage_errors: true,
  can_start_video_chat: true,
  can_view_analytics: false
}
```

### Updating Permissions
**Endpoint**: `PUT /api/teams/:teamId/members/:userId`

```javascript
{
  "role": "admin",  // Upgrade to admin
  "permissions": {
    "can_view_analytics": true  // Grant specific permission
  }
}
```

---

## 📊 Database Schema

### User Table (Updated on Subscription)
```sql
users {
  id: UUID
  email: string
  subscriptionTier: 'free' | 'pro' | 'team'  -- Updated by webhook
  subscriptionStatus: 'active' | 'cancelled' | 'expired'
  subscriptionStartDate: timestamp
  subscriptionEndDate: timestamp
}
```

### Subscription Table
```sql
subscriptions {
  id: UUID
  userId: UUID  -- Foreign key to users
  tier: 'free' | 'pro' | 'team'
  status: 'active' | 'cancelled' | 'past_due' | 'expired'
  startDate: timestamp
  endDate: timestamp
  dodoSubscriptionId: string  -- DodoPayments subscription ID
}
```

### Team Table
```sql
teams {
  id: integer
  name: string
  description: text
  owner_id: UUID  -- User who created team (TEAM subscriber)
  subscription_id: UUID  -- Links to subscription
  max_members: integer  -- -1 = unlimited
  video_room_id: string  -- Unique room for video chat
  is_active: boolean
}
```

### TeamMember Table
```sql
team_members {
  id: integer
  team_id: integer  -- Foreign key to teams
  user_id: UUID  -- Foreign key to users
  role: 'owner' | 'admin' | 'member'
  status: 'pending' | 'active' | 'suspended'
  invited_by: UUID  -- Who sent the invitation
  joined_at: timestamp
  permissions: JSON  -- Granular permissions
}
```

### SharedError Table
```sql
shared_errors {
  id: UUID
  team_id: integer
  shared_by: UUID  -- User who shared
  error_query: text
  solution: text
  visibility: 'team' | 'private'
  created_at: timestamp
}
```

---

## 🚀 API Endpoints Summary

### Team Management
```
POST   /api/teams                    -- Create team (TEAM tier only)
GET    /api/teams                    -- Get user's teams
GET    /api/teams/:teamId            -- Get team details
PUT    /api/teams/:teamId            -- Update team
DELETE /api/teams/:teamId            -- Delete team (owner only)
```

### Team Members
```
POST   /api/teams/:teamId/invite     -- Invite member
POST   /api/teams/:teamId/join       -- Accept invitation
GET    /api/teams/:teamId/members    -- List team members
PUT    /api/teams/:teamId/members/:userId  -- Update member role
DELETE /api/teams/:teamId/members/:userId  -- Remove member
```

### Error Sharing
```
POST   /api/teams/:teamId/errors     -- Share error with team
GET    /api/teams/:teamId/errors     -- Get team errors
PUT    /api/teams/:teamId/errors/:errorId  -- Update shared error
DELETE /api/teams/:teamId/errors/:errorId  -- Delete shared error
```

### Team Features
```
GET    /api/teams/:teamId/dashboard  -- Team dashboard
GET    /api/teams/:teamId/analytics  -- Team analytics
POST   /api/teams/:teamId/video/start  -- Start video chat
POST   /api/teams/:teamId/video/end    -- End video chat
```

---

## 🔄 Subscription Lifecycle

### 1. New Subscription
```
Webhook: subscription.active
Action: 
  - Create subscription record
  - Set user tier to pro/team
  - Grant features immediately
```

### 2. Renewal
```
Webhook: subscription.renewed
Action:
  - Extend endDate by +1 month
  - Keep status as active
  - No interruption to features
```

### 3. Payment Failed
```
Webhook: payment.failed
Action:
  - Set status to past_due
  - User keeps access for grace period
  - Send reminder email
```

### 4. Subscription Cancelled
```
Webhook: subscription.cancelled
Action:
  - Set status to cancelled
  - Keep access until end date
  - Show renewal prompt
```

### 5. Subscription Expired
```
Webhook: subscription.expired
Action:
  - Set status to expired
  - Downgrade tier to free
  - Revoke premium features
  - For TEAM: Teams remain but features locked
```

---

## ✅ Feature Checklist

### Already Built ✅
- [x] User subscription model
- [x] Team model
- [x] TeamMember model
- [x] SharedError model
- [x] Team controller with all features
- [x] Team routes
- [x] Webhook handlers for subscriptions
- [x] Permission system
- [x] Role-based access control
- [x] Video room generation
- [x] Error sharing system
- [x] Team analytics

### Enabled (Just Now) ✅
- [x] Team routes registered in server.js
- [x] Team API endpoints accessible

### Frontend Needs (To Be Built)
- [ ] Team creation UI
- [ ] Team member invitation UI
- [ ] Team dashboard page
- [ ] Error sharing interface
- [ ] Video chat integration
- [ ] Permission management UI
- [ ] Team settings page

---

## 📝 Summary

**The backend is 100% ready!** 🎉

When a user subscribes:
1. ✅ DodoPayments processes payment
2. ✅ Webhook automatically updates database
3. ✅ User tier changed to pro/team
4. ✅ Features unlocked instantly
5. ✅ TEAM users can create/manage teams
6. ✅ TEAM owners can invite unlimited members
7. ✅ All API endpoints are working

**What's needed**: Frontend UI to interact with these backend features.

---

**Last Updated**: November 10, 2025  
**Status**: Backend fully functional ✅  
**API Version**: 1.0.0
