const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const couponService = require('../services/couponService');
const { authMiddleware, isAdmin } = require('../middleware/auth');

// Rate limiters
const validateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 validation attempts per 15 min
  message: { error: 'Too many coupon validation attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 apply attempts per hour
  message: { error: 'Too many coupon applications. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================================================
// PUBLIC ENDPOINTS (require authentication)
// ============================================================================

/**
 * POST /api/coupons/validate
 * Validate a coupon code for a specific plan
 */
router.post('/validate', authMiddleware, validateLimiter, async (req, res) => {
  try {
    const { code, planId, planPrice } = req.body;
    const userId = req.user.id;
    
    if (!code) {
      return res.status(400).json({ error: 'Coupon code is required' });
    }
    
    if (!planId) {
      return res.status(400).json({ error: 'Plan ID is required' });
    }
    
    // Get plan price if not provided
    let price = planPrice;
    if (!price) {
      const { SUBSCRIPTION_TIERS } = require('../controllers/subscriptionController');
      const plan = SUBSCRIPTION_TIERS[planId];
      if (!plan) {
        return res.status(400).json({ error: 'Invalid plan ID' });
      }
      price = plan.price;
    }
    
    const result = await couponService.validateCoupon(code, userId, planId, price);
    
    if (result.valid) {
      res.json({
        valid: true,
        coupon: result.coupon,
        discount: result.discount
      });
    } else {
      res.status(400).json({
        valid: false,
        error: result.error,
        errorCode: result.errorCode
      });
    }
    
  } catch (error) {
    console.error('Coupon validation error:', error);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

/**
 * POST /api/coupons/apply
 * Apply a coupon to a pending checkout
 */
router.post('/apply', authMiddleware, applyLimiter, async (req, res) => {
  try {
    const { code, planId, planPrice, paymentSessionId } = req.body;
    const userId = req.user.id;
    
    if (!code || !planId) {
      return res.status(400).json({ error: 'Coupon code and plan ID are required' });
    }
    
    // Get plan price if not provided
    let price = planPrice;
    if (!price) {
      const { SUBSCRIPTION_TIERS } = require('../controllers/subscriptionController');
      const plan = SUBSCRIPTION_TIERS[planId];
      if (!plan) {
        return res.status(400).json({ error: 'Invalid plan ID' });
      }
      price = plan.price;
    }
    
    const result = await couponService.applyCoupon(code, userId, planId, price, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      paymentSessionId
    });
    
    if (result.success) {
      res.json({
        success: true,
        redemption: result.redemption
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        errorCode: result.errorCode
      });
    }
    
  } catch (error) {
    console.error('Coupon application error:', error);
    res.status(500).json({ error: 'Failed to apply coupon' });
  }
});

/**
 * DELETE /api/coupons/redemption/:id
 * Cancel a pending coupon redemption
 */
router.delete('/redemption/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await couponService.cancelRedemption(parseInt(id));
    
    if (result.success) {
      res.json({ success: true, message: 'Redemption cancelled' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
    
  } catch (error) {
    console.error('Redemption cancellation error:', error);
    res.status(500).json({ error: 'Failed to cancel redemption' });
  }
});

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * GET /api/coupons
 * List all coupons (admin only)
 */
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { page, limit, active, campaign, search } = req.query;
    
    const result = await couponService.getAllCoupons({
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      activeOnly: active === 'true',
      campaign,
      search
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
    
  } catch (error) {
    console.error('Get coupons error:', error);
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

/**
 * POST /api/coupons
 * Create a new coupon (admin only)
 */
router.post('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const result = await couponService.createCoupon(req.body, req.user.id);
    
    if (result.success) {
      res.status(201).json({
        success: true,
        coupon: result.coupon
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
    
  } catch (error) {
    console.error('Coupon creation error:', error);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

/**
 * PUT /api/coupons/:id
 * Update a coupon (admin only)
 */
router.put('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await couponService.updateCoupon(parseInt(id), req.body, req.user.id);
    
    if (result.success) {
      res.json({ success: true, coupon: result.coupon });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
    
  } catch (error) {
    console.error('Coupon update error:', error);
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

/**
 * DELETE /api/coupons/:id
 * Deactivate a coupon (admin only)
 */
router.delete('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await couponService.deactivateCoupon(parseInt(id), req.user.id);
    
    if (result.success) {
      res.json({ success: true, message: 'Coupon deactivated' });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
    
  } catch (error) {
    console.error('Coupon deactivation error:', error);
    res.status(500).json({ error: 'Failed to deactivate coupon' });
  }
});

/**
 * GET /api/coupons/analytics
 * Get coupon usage analytics (admin only)
 */
router.get('/analytics', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { couponId } = req.query;
    
    const result = await couponService.getCouponAnalytics(
      couponId ? parseInt(couponId) : null
    );
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
    
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

/**
 * POST /api/coupons/bulk
 * Bulk create coupons for a campaign (admin only)
 */
router.post('/bulk', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { template, count } = req.body;
    
    if (!template || !count) {
      return res.status(400).json({ error: 'Template and count are required' });
    }
    
    if (count > 1000) {
      return res.status(400).json({ error: 'Maximum 1000 coupons per batch' });
    }
    
    const result = await couponService.bulkCreateCoupons(template, count, req.user.id);
    
    if (result.success) {
      res.status(201).json({
        success: true,
        count: result.count,
        coupons: result.coupons.map(c => ({
          id: c.id,
          code: c.code,
          name: c.name
        }))
      });
    } else {
      res.status(400).json({ success: false, error: result.error });
    }
    
  } catch (error) {
    console.error('Bulk creation error:', error);
    res.status(500).json({ error: 'Failed to create coupons' });
  }
});

/**
 * POST /api/coupons/generate-code
 * Generate a unique coupon code (admin only)
 */
router.post('/generate-code', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { prefix, length } = req.body;
    
    const code = couponService.generateCouponCode(prefix || '', length || 8);
    
    res.json({ code });
    
  } catch (error) {
    console.error('Code generation error:', error);
    res.status(500).json({ error: 'Failed to generate code' });
  }
});

/**
 * GET /api/coupons/:code/info
 * Get public info about a coupon (for marketing/landing pages)
 */
router.get('/:code/info', async (req, res) => {
  try {
    const { code } = req.params;
    const Coupon = require('../models/Coupon');
    
    const coupon = await Coupon.findOne({
      where: { 
        code: code.toUpperCase().trim(),
        isActive: true
      }
    });
    
    if (!coupon || !coupon.isValid()) {
      return res.status(404).json({ 
        error: 'Coupon not found or expired' 
      });
    }
    
    res.json({
      code: coupon.code,
      name: coupon.name,
      discountType: coupon.discountType,
      discountValue: parseFloat(coupon.discountValue),
      description: coupon.description,
      applicablePlans: coupon.applicablePlans,
      expiresAt: coupon.expiresAt
    });
    
  } catch (error) {
    console.error('Coupon info error:', error);
    res.status(500).json({ error: 'Failed to fetch coupon info' });
  }
});

module.exports = router;
