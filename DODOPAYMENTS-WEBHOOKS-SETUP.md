# DodoPayments Webhooks Setup Guide

## Overview
This guide explains how to configure DodoPayments webhooks for your ErrorWise backend to receive real-time payment notifications.

## Webhook Endpoint
Your webhook endpoint URL:
```
https://errorwise-backend-production.up.railway.app/api/webhooks/dodo
```

## Configuration Steps

### 1. Access DodoPayments Dashboard
1. Go to [DodoPayments Dashboard](https://dodopayments.com/dashboard)
2. Navigate to **Settings → Webhooks**

### 2. Create Webhook Endpoint
1. Click **Add Webhook**
2. Enter the endpoint URL: `https://errorwise-backend-production.up.railway.app/api/webhooks/dodo`
3. Select the events you want to receive (see below)
4. Click **Save**

### 3. Get Webhook Secret
1. After creating the webhook, you'll see a **Secret Key**
2. Copy this key
3. Add it to your Railway environment variables as `DODO_WEBHOOK_SECRET`

### 4. Configure Railway Environment Variable
In your Railway project:
```bash
DODO_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

## Supported Webhook Events

### 🔵 Payment Events (4 events)
| Event | Description | Handler |
|-------|-------------|---------|
| `payment.succeeded` | Payment successfully processed | Updates subscription to active |
| `payment.failed` | Payment attempt failed | Updates subscription to past_due |
| `payment.processing` | Payment is being processed | Logs processing status |
| `payment.cancelled` | Payment was cancelled | Logs cancellation |

**Recommended to subscribe:** `payment.succeeded`, `payment.failed`

---

### 🟢 Subscription Events (7 events)
| Event | Description | Handler |
|-------|-------------|---------|
| `subscription.active` | Subscription is now active | Activates user subscription, sets tier |
| `subscription.on_hold` | Subscription temporarily on hold | Sets status to on_hold |
| `subscription.renewed` | Subscription successfully renewed | Extends end date by 1 month |
| `subscription.plan_changed` | User upgraded/downgraded plan | Updates subscription tier |
| `subscription.cancelled` | Subscription was cancelled | Sets status to cancelled |
| `subscription.failed` | Subscription creation failed | Sets status to failed |
| `subscription.expired` | Subscription reached end of term | Sets status to expired, tier to free |

**Recommended to subscribe:** ALL subscription events

---

### 💰 Refund Events (2 events)
| Event | Description | Handler |
|-------|-------------|---------|
| `refund.succeeded` | Refund successfully processed | Logs refund |
| `refund.failed` | Refund attempt failed | Logs failure |

**Recommended to subscribe:** `refund.succeeded`

---

### ⚠️ Dispute Events (7 events)
| Event | Description | Handler |
|-------|-------------|---------|
| `dispute.opened` | Customer initiated a dispute | Logs dispute for admin review |
| `dispute.expired` | Dispute expired without resolution | Logs expiration |
| `dispute.accepted` | Merchant accepted the dispute | Logs acceptance |
| `dispute.cancelled` | Dispute was cancelled | Logs cancellation |
| `dispute.challenged` | Merchant challenged the dispute | Logs challenge |
| `dispute.won` | Merchant won the dispute | Logs victory |
| `dispute.lost` | Merchant lost the dispute | Logs loss |

**Recommended to subscribe:** `dispute.opened`, `dispute.won`, `dispute.lost`

---

### 🔑 License Key Events (1 event)
| Event | Description | Handler |
|-------|-------------|---------|
| `license_key.created` | New license key was created | Logs license key creation |

**Optional** - Only if you use license keys

---

## Event Selection Recommendations

### Minimal Setup (Essential Events Only)
```
✅ payment.succeeded
✅ payment.failed
✅ subscription.active
✅ subscription.renewed
✅ subscription.cancelled
✅ subscription.expired
```

### Recommended Setup (Full Coverage)
```
✅ payment.succeeded
✅ payment.failed
✅ subscription.active
✅ subscription.on_hold
✅ subscription.renewed
✅ subscription.plan_changed
✅ subscription.cancelled
✅ subscription.failed
✅ subscription.expired
✅ refund.succeeded
✅ dispute.opened
✅ dispute.won
✅ dispute.lost
```

### Complete Setup (All Events)
Subscribe to all 20+ events for maximum visibility and logging.

## Webhook Security

### Signature Verification
All webhooks are automatically verified using HMAC SHA256 signatures. The verification happens in:
- `src/routes/webhookRoutes.js` - Initial verification
- `src/services/paymentService.js` - Signature checking

### Headers
DodoPayments sends these headers with each webhook:
```
webhook-id: Unique identifier for idempotency
webhook-signature: HMAC SHA256 signature
webhook-timestamp: Unix timestamp
```

### Idempotency
The webhook endpoint implements idempotency checking using `webhook-id` to prevent duplicate processing.

## Testing Webhooks

### Using DodoPayments Dashboard
1. Go to **Settings → Webhooks**
2. Click on your endpoint
3. Go to **Testing** tab
4. Select an event type
5. Click **Send Example**
6. Check Railway logs for processing

### Test Checkout Flow
1. Go to https://www.errorwise.tech/subscription
2. Click **Upgrade to Pro Plan**
3. Use test card: `4242 4242 4242 4242`
4. Complete payment
5. Webhook should fire: `subscription.active`

## Monitoring

### Railway Logs
View webhook processing in real-time:
```bash
# View in Railway dashboard
Deployments → Latest → Logs

# Look for:
Processing webhook event: subscription.active
✅ Subscription activated for user 123
```

### DodoPayments Dashboard
Monitor webhook delivery:
1. Go to **Settings → Webhooks**
2. Click on your endpoint
3. View **Logs** tab for delivery status
4. View **Activity** tab for analytics

## Troubleshooting

### Webhook Not Received
1. ✅ Check endpoint URL is correct
2. ✅ Verify Railway backend is deployed and healthy
3. ✅ Ensure `DODO_WEBHOOK_SECRET` is set correctly
4. ✅ Check selected events include the one you're testing

### Signature Verification Failed
1. ✅ Verify `DODO_WEBHOOK_SECRET` matches dashboard
2. ✅ Check for typos in environment variable
3. ✅ Ensure webhook secret hasn't been rotated

### Event Not Processing
1. ✅ Check Railway logs for errors
2. ✅ Verify event type is in the switch statement
3. ✅ Check database connection is working
4. ✅ Ensure user/subscription exists in database

## Webhook Retries

DodoPayments automatically retries failed webhooks:
| Attempt | Delay | Total Time |
|---------|-------|------------|
| 1 | Immediate | 0s |
| 2 | 5 seconds | 5s |
| 3 | 5 minutes | 5m 5s |
| 4 | 30 minutes | 35m 5s |
| 5 | 2 hours | 2h 35m 5s |
| 6 | 5 hours | 7h 35m 5s |
| 7 | 10 hours | 17h 35m 5s |
| 8 | 10 hours | 27h 35m 5s (final) |

Your endpoint must return `200` status to stop retries.

## Advanced Configuration

### Rate Limiting
Control webhook delivery rate in DodoPayments dashboard:
1. Go to webhook endpoint → **Advanced** tab
2. Configure rate limit if needed
3. Default: No rate limit

### Custom Headers
Add custom headers to webhook requests:
1. Go to webhook endpoint → **Advanced** tab
2. Add key-value pairs
3. Example: `X-API-Version: 1.0`

### Transformations
Modify webhook payload before delivery:
1. Go to webhook endpoint → **Advanced** tab
2. Enable transformations
3. Add JavaScript transformation code

## Environment Variables Summary

Required for DodoPayments integration:
```bash
# API Keys
DODO_API_KEY=pk_live_xxxxxxxxxxxxx        # Publishable key (client-side)
DODO_SECRET_KEY=sk_live_xxxxxxxxxxxxx     # Secret key (server-side)
DODO_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx   # Webhook verification

# API Configuration
DODO_BASE_URL=https://live.dodopayments.com

# Product IDs (from database)
PRO_PLAN: pdt_OKdKW76gtO6vBWltBBV5d
TEAM_PLAN: pdt_Zbn5YM2pCgkKcdQyV0ouY
```

## Code Reference

### Webhook Route
File: `src/routes/webhookRoutes.js`
- Handles POST requests to `/api/webhooks/dodo`
- Verifies webhook signatures
- Processes events asynchronously

### Payment Service
File: `src/services/paymentService.js`
- Contains all webhook event handlers
- Updates database records
- Sends email notifications (if configured)

### Models
- `src/models/Subscription.js` - Subscription records
- `src/models/User.js` - User subscription status

## Support

For issues with:
- **DodoPayments API**: [DodoPayments Support](https://dodopayments.com/support)
- **Documentation**: [DodoPayments Docs](https://docs.dodopayments.com)
- **ErrorWise Backend**: Check Railway logs and GitHub issues

## Next Steps

After setting up webhooks:
1. ✅ Test with a real payment
2. ✅ Monitor webhook logs in dashboard
3. ✅ Verify database updates correctly
4. ✅ Test subscription renewal (wait for next billing cycle or use test mode)
5. ✅ Configure email notifications for failed payments (optional)

---

**Last Updated**: November 10, 2025  
**Backend Version**: Railway Production  
**DodoPayments Integration**: Live Mode ✅
