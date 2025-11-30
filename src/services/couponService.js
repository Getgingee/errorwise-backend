const Coupon = require('../models/Coupon');
const CouponRedemption = require('../models/CouponRedemption');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { Op } = require('sequelize');
const logger = require('../utils/logger');

class CouponService {
  
  /**
   * Validate a coupon code for a specific user and plan
   */
  async validateCoupon(code, userId, planId, planPrice) {
    try {
      // Normalize the code
      const normalizedCode = code.toUpperCase().trim();
      
      // Find the coupon
      const coupon = await Coupon.findOne({
        where: { code: normalizedCode }
      });
      
      if (!coupon) {
        return {
          valid: false,
          error: 'Invalid coupon code',
          errorCode: 'INVALID_CODE'
        };
      }
      
      // Check basic validity
      if (!coupon.isValid()) {
        if (!coupon.isActive) {
          return { valid: false, error: 'This coupon is no longer active', errorCode: 'INACTIVE' };
        }
        if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
          return { valid: false, error: 'This coupon has expired', errorCode: 'EXPIRED' };
        }
        if (coupon.startsAt && new Date(coupon.startsAt) > new Date()) {
          return { valid: false, error: 'This coupon is not yet active', errorCode: 'NOT_STARTED' };
        }
        if (coupon.maxRedemptions && coupon.redemptionCount >= coupon.maxRedemptions) {
          return { valid: false, error: 'This coupon has reached its usage limit', errorCode: 'MAX_REACHED' };
        }
      }
      
      // Check if coupon applies to this plan
      if (coupon.applicablePlans && Array.isArray(coupon.applicablePlans)) {
        if (!coupon.applicablePlans.includes(planId)) {
          return {
            valid: false,
            error: `This coupon is only valid for: ${coupon.applicablePlans.join(', ')} plans`,
            errorCode: 'WRONG_PLAN'
          };
        }
      }
      
      // Check minimum purchase
      if (coupon.minimumPurchase && planPrice < parseFloat(coupon.minimumPurchase)) {
        return {
          valid: false,
          error: `Minimum purchase of $${coupon.minimumPurchase} required`,
          errorCode: 'MINIMUM_NOT_MET'
        };
      }
      
      // Check user-specific restrictions
      const user = await User.findByPk(userId);
      if (!user) {
        return { valid: false, error: 'User not found', errorCode: 'USER_NOT_FOUND' };
      }
      
      // Check first-time user restriction
      if (coupon.firstTimeOnly) {
        const hasPaidBefore = await Subscription.count({
          where: {
            userId,
            status: { [Op.in]: ['active', 'cancelled', 'expired'] },
            tier: { [Op.ne]: 'free' }
          }
        });
        
        if (hasPaidBefore > 0) {
          return {
            valid: false,
            error: 'This coupon is only for first-time subscribers',
            errorCode: 'NOT_FIRST_TIME'
          };
        }
      }
      
      // Check new user days restriction
      if (coupon.newUserDays) {
        const userCreatedAt = new Date(user.createdAt);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - coupon.newUserDays);
        
        if (userCreatedAt < cutoffDate) {
          return {
            valid: false,
            error: `This coupon is only for accounts created within the last ${coupon.newUserDays} days`,
            errorCode: 'ACCOUNT_TOO_OLD'
          };
        }
      }
      
      // Check per-user redemption limit
      const userRedemptions = await CouponRedemption.count({
        where: {
          couponId: coupon.id,
          userId,
          status: { [Op.in]: ['pending', 'applied'] }
        }
      });
      
      if (userRedemptions >= coupon.maxRedemptionsPerUser) {
        return {
          valid: false,
          error: 'You have already used this coupon',
          errorCode: 'ALREADY_USED'
        };
      }
      
      // Calculate discount
      const discountAmount = coupon.calculateDiscount(planPrice);
      const finalPrice = Math.max(0, planPrice - discountAmount);
      
      return {
        valid: true,
        coupon: coupon.toPublicJSON(),
        discount: {
          type: coupon.discountType,
          value: parseFloat(coupon.discountValue),
          amount: discountAmount,
          originalPrice: planPrice,
          finalPrice,
          savings: discountAmount,
          savingsPercent: Math.round((discountAmount / planPrice) * 100)
        }
      };
      
    } catch (error) {
      logger.error('Coupon validation error:', error);
      return {
        valid: false,
        error: 'Failed to validate coupon',
        errorCode: 'SYSTEM_ERROR'
      };
    }
  }
  
  /**
   * Apply a coupon to a subscription (create redemption record)
   */
  async applyCoupon(code, userId, planId, planPrice, options = {}) {
    try {
      const validation = await this.validateCoupon(code, userId, planId, planPrice);
      
      if (!validation.valid) {
        return validation;
      }
      
      const coupon = await Coupon.findOne({
        where: { code: code.toUpperCase().trim() }
      });
      
      // Create redemption record
      const redemption = await CouponRedemption.create({
        couponId: coupon.id,
        userId,
        planId,
        originalPrice: planPrice,
        discountAmount: validation.discount.amount,
        finalPrice: validation.discount.finalPrice,
        status: 'pending',
        remainingCycles: coupon.durationType === 'repeating' ? coupon.durationMonths : null,
        ipAddress: options.ipAddress,
        userAgent: options.userAgent,
        paymentSessionId: options.paymentSessionId,
        metadata: options.metadata || {}
      });
      
      // Increment coupon redemption count
      await coupon.increment('redemptionCount');
      
      logger.info('Coupon applied:', {
        couponCode: code,
        userId,
        planId,
        discount: validation.discount.amount,
        redemptionId: redemption.id
      });
      
      return {
        success: true,
        redemption: {
          id: redemption.id,
          code: coupon.code,
          ...validation.discount
        }
      };
      
    } catch (error) {
      logger.error('Coupon application error:', error);
      return {
        success: false,
        error: 'Failed to apply coupon',
        errorCode: 'SYSTEM_ERROR'
      };
    }
  }
  
  /**
   * Mark redemption as applied (after successful payment)
   */
  async confirmRedemption(redemptionId, subscriptionId) {
    try {
      const redemption = await CouponRedemption.findByPk(redemptionId);
      
      if (!redemption) {
        return { success: false, error: 'Redemption not found' };
      }
      
      await redemption.update({
        status: 'applied',
        subscriptionId,
        appliedAt: new Date()
      });
      
      logger.info('Coupon redemption confirmed:', { redemptionId, subscriptionId });
      
      return { success: true };
      
    } catch (error) {
      logger.error('Coupon confirmation error:', error);
      return { success: false, error: 'Failed to confirm redemption' };
    }
  }
  
  /**
   * Cancel/expire a pending redemption
   */
  async cancelRedemption(redemptionId) {
    try {
      const redemption = await CouponRedemption.findByPk(redemptionId);
      
      if (!redemption) {
        return { success: false, error: 'Redemption not found' };
      }
      
      if (redemption.status !== 'pending') {
        return { success: false, error: 'Can only cancel pending redemptions' };
      }
      
      // Decrement coupon count
      await Coupon.decrement('redemptionCount', {
        where: { id: redemption.couponId }
      });
      
      await redemption.update({ status: 'expired' });
      
      return { success: true };
      
    } catch (error) {
      logger.error('Coupon cancellation error:', error);
      return { success: false, error: 'Failed to cancel redemption' };
    }
  }
  
  /**
   * Create a new coupon (admin function)
   */
  async createCoupon(couponData, adminUserId) {
    try {
      // Validate required fields
      if (!couponData.code || !couponData.name || !couponData.discountValue) {
        return { success: false, error: 'Missing required fields: code, name, discountValue' };
      }
      
      // Check if code already exists
      const existing = await Coupon.findOne({
        where: { code: couponData.code.toUpperCase() }
      });
      
      if (existing) {
        return { success: false, error: 'Coupon code already exists' };
      }
      
      // Validate discount value
      if (couponData.discountType === 'percentage' && couponData.discountValue > 100) {
        return { success: false, error: 'Percentage discount cannot exceed 100%' };
      }
      
      const coupon = await Coupon.create({
        ...couponData,
        createdBy: adminUserId
      });
      
      logger.info('Coupon created:', { 
        code: coupon.code, 
        createdBy: adminUserId 
      });
      
      return { success: true, coupon };
      
    } catch (error) {
      logger.error('Coupon creation error:', error);
      return { success: false, error: error.message || 'Failed to create coupon' };
    }
  }
  
  /**
   * Update an existing coupon
   */
  async updateCoupon(couponId, updates, adminUserId) {
    try {
      const coupon = await Coupon.findByPk(couponId);
      
      if (!coupon) {
        return { success: false, error: 'Coupon not found' };
      }
      
      // Don't allow changing the code if it has redemptions
      if (updates.code && updates.code !== coupon.code) {
        const hasRedemptions = await CouponRedemption.count({
          where: { couponId }
        });
        
        if (hasRedemptions > 0) {
          return { success: false, error: 'Cannot change code for a coupon with existing redemptions' };
        }
      }
      
      await coupon.update(updates);
      
      logger.info('Coupon updated:', { 
        couponId, 
        updatedBy: adminUserId,
        updates: Object.keys(updates)
      });
      
      return { success: true, coupon };
      
    } catch (error) {
      logger.error('Coupon update error:', error);
      return { success: false, error: 'Failed to update coupon' };
    }
  }
  
  /**
   * Deactivate a coupon
   */
  async deactivateCoupon(couponId, adminUserId) {
    try {
      const coupon = await Coupon.findByPk(couponId);
      
      if (!coupon) {
        return { success: false, error: 'Coupon not found' };
      }
      
      await coupon.update({ isActive: false });
      
      logger.info('Coupon deactivated:', { 
        couponId, 
        code: coupon.code,
        deactivatedBy: adminUserId 
      });
      
      return { success: true };
      
    } catch (error) {
      logger.error('Coupon deactivation error:', error);
      return { success: false, error: 'Failed to deactivate coupon' };
    }
  }
  
  /**
   * Get all coupons (admin)
   */
  async getAllCoupons(options = {}) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        activeOnly = false,
        campaign = null,
        search = null
      } = options;
      
      const where = {};
      
      if (activeOnly) {
        where.isActive = true;
      }
      
      if (campaign) {
        where.campaign = campaign;
      }
      
      if (search) {
        where[Op.or] = [
          { code: { [Op.iLike]: `%${search}%` } },
          { name: { [Op.iLike]: `%${search}%` } }
        ];
      }
      
      const { count, rows } = await Coupon.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
        offset: (page - 1) * limit
      });
      
      return {
        success: true,
        coupons: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      };
      
    } catch (error) {
      logger.error('Get coupons error:', error);
      return { success: false, error: 'Failed to fetch coupons' };
    }
  }
  
  /**
   * Get coupon analytics
   */
  async getCouponAnalytics(couponId = null) {
    try {
      const where = couponId ? { couponId } : {};
      
      // Get total redemptions
      const totalRedemptions = await CouponRedemption.count({
        where: { ...where, status: 'applied' }
      });
      
      // Get total savings
      const savingsResult = await CouponRedemption.sum('discountAmount', {
        where: { ...where, status: 'applied' }
      });
      
      // Get revenue (final prices)
      const revenueResult = await CouponRedemption.sum('finalPrice', {
        where: { ...where, status: 'applied' }
      });
      
      // Get redemptions by plan
      const byPlan = await CouponRedemption.findAll({
        where: { ...where, status: 'applied' },
        attributes: [
          'planId',
          [require('sequelize').fn('COUNT', '*'), 'count'],
          [require('sequelize').fn('SUM', require('sequelize').col('discount_amount')), 'totalDiscount']
        ],
        group: ['planId']
      });
      
      // Get top coupons if not filtering by coupon
      let topCoupons = [];
      if (!couponId) {
        topCoupons = await CouponRedemption.findAll({
          where: { status: 'applied' },
          attributes: [
            'couponId',
            [require('sequelize').fn('COUNT', '*'), 'redemptions'],
            [require('sequelize').fn('SUM', require('sequelize').col('discount_amount')), 'totalDiscount']
          ],
          group: ['couponId'],
          order: [[require('sequelize').fn('COUNT', '*'), 'DESC']],
          limit: 10,
          include: [{
            model: Coupon,
            attributes: ['code', 'name']
          }]
        });
      }
      
      return {
        success: true,
        analytics: {
          totalRedemptions,
          totalSavings: parseFloat(savingsResult) || 0,
          totalRevenue: parseFloat(revenueResult) || 0,
          byPlan: byPlan.map(p => ({
            planId: p.planId,
            count: parseInt(p.get('count')),
            totalDiscount: parseFloat(p.get('totalDiscount')) || 0
          })),
          topCoupons: topCoupons.map(c => ({
            couponId: c.couponId,
            code: c.Coupon?.code,
            name: c.Coupon?.name,
            redemptions: parseInt(c.get('redemptions')),
            totalDiscount: parseFloat(c.get('totalDiscount')) || 0
          }))
        }
      };
      
    } catch (error) {
      logger.error('Coupon analytics error:', error);
      return { success: false, error: 'Failed to fetch analytics' };
    }
  }
  
  /**
   * Generate a unique coupon code
   */
  generateCouponCode(prefix = '', length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = prefix.toUpperCase();
    
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return code;
  }
  
  /**
   * Bulk create coupons (for campaigns)
   */
  async bulkCreateCoupons(template, count, adminUserId) {
    try {
      const coupons = [];
      
      for (let i = 0; i < count; i++) {
        const code = this.generateCouponCode(template.codePrefix || '', template.codeLength || 8);
        
        coupons.push({
          ...template,
          code,
          createdBy: adminUserId
        });
      }
      
      const created = await Coupon.bulkCreate(coupons);
      
      logger.info('Bulk coupons created:', { 
        count: created.length, 
        campaign: template.campaign,
        createdBy: adminUserId 
      });
      
      return { success: true, count: created.length, coupons: created };
      
    } catch (error) {
      logger.error('Bulk coupon creation error:', error);
      return { success: false, error: 'Failed to create coupons' };
    }
  }
}

module.exports = new CouponService();
