#!/usr/bin/env node

/**
 * Seed Script for Subscription Plans
 * 
 * This script populates the database with default subscription plans
 * configured for Dodo Payments integration.
 */

require('dotenv').config();
const sequelize = require('./src/config/database');
const SubscriptionPlan = require('./src/models/SubscriptionPlan');

const defaultPlans = [
  {
    name: 'Free Plan',
    price: 0.00,
    billing_interval: 'month', // Monthly plan with daily limits
    trial_period_days: 0,
    features: {
      dailyQueries: 3, // 3 queries per day
      errorExplanation: true,
      fixSuggestions: false,
      documentationLinks: false,
      errorHistory: false,
      teamFeatures: false,
      supportLevel: 'community'
    },
    limits: {
      maxDailyQueries: 3,
      maxMonthlyQueries: 93, // ~3 per day
      errorCategories: ['excel', 'sql', 'windows', 'python', 'javascript', 'general'],
      historyRetention: 0, // No history
      teamMembers: 1
    },
    max_users: 1,
    max_team_members: 1,
    description: 'Perfect for trying out ErrorWise. Get clear explanations for 3 errors per day.',
    dodo_plan_id: null, // Free plan doesn't need Dodo integration
    dodo_product_id: null,
    is_active: true
  },
  {
    name: 'Pro Plan',
    price: 2.00,
    billing_interval: 'month',
    trial_period_days: 7, // 7-day free trial
    features: {
      dailyQueries: -1, // Unlimited
      errorExplanation: true,
      fixSuggestions: true,
      documentationLinks: true,
      errorHistory: true,
      teamFeatures: false,
      supportLevel: 'email',
      advancedAnalysis: true,
      codeSnippets: true
    },
    limits: {
      maxDailyQueries: -1, // Unlimited
      maxMonthlyQueries: -1, // Unlimited
      errorCategories: ['excel', 'sql', 'windows', 'python', 'javascript', 'java', 'c++', 'react', 'node', 'general'],
      historyRetention: 365, // 1 year history
      teamMembers: 1
    },
    max_users: 1,
    max_team_members: 1,
    description: 'Unlimited error queries with fixes, documentation links, and complete history.',
    dodo_plan_id: process.env.DODO_PRO_PLAN_ID || 'plan_pro_monthly',
    dodo_product_id: process.env.DODO_PRO_PRODUCT_ID || 'prod_pro_plan',
    is_active: true
  },
  {
    name: 'Team Plan',
    price: 8.00,
    billing_interval: 'month',
    trial_period_days: 14, // 14-day free trial
    features: {
      dailyQueries: -1, // Unlimited
      errorExplanation: true,
      fixSuggestions: true,
      documentationLinks: true,
      errorHistory: true,
      teamFeatures: true,
      sharedHistory: true,
      teamDashboard: true,
      supportLevel: 'priority',
      advancedAnalysis: true,
      codeSnippets: true,
      teamInsights: true
    },
    limits: {
      maxDailyQueries: -1, // Unlimited
      maxMonthlyQueries: -1, // Unlimited
      errorCategories: ['excel', 'sql', 'windows', 'python', 'javascript', 'java', 'c++', 'react', 'node', 'general'],
      historyRetention: -1, // Unlimited history
      teamMembers: 10, // Up to 10 team members
      sharedWorkspaces: 5
    },
    max_users: 10,
    max_team_members: 10,
    description: 'Everything in Pro plus shared team history, team dashboard, and collaborative features.',
    dodo_plan_id: process.env.DODO_TEAM_PLAN_ID || 'plan_team_monthly',
    dodo_product_id: process.env.DODO_TEAM_PRODUCT_ID || 'prod_team_plan',
    is_active: true
  },
  // Yearly plans with attractive discounts
  {
    name: 'Pro Plan (Yearly)',
    price: 20.00, // ~17% discount (2 months free)
    billing_interval: 'year',
    trial_period_days: 7,
    features: {
      dailyQueries: -1,
      errorExplanation: true,
      fixSuggestions: true,
      documentationLinks: true,
      errorHistory: true,
      teamFeatures: false,
      supportLevel: 'email',
      advancedAnalysis: true,
      codeSnippets: true,
      yearlyDiscount: true
    },
    limits: {
      maxDailyQueries: -1,
      maxMonthlyQueries: -1,
      errorCategories: ['excel', 'sql', 'windows', 'python', 'javascript', 'java', 'c++', 'react', 'node', 'general'],
      historyRetention: 365,
      teamMembers: 1
    },
    max_users: 1,
    max_team_members: 1,
    description: 'Annual Pro subscription - Save $4! (2 months free)',
    dodo_plan_id: process.env.DODO_PRO_YEARLY_PLAN_ID || 'plan_pro_yearly',
    dodo_product_id: process.env.DODO_PRO_PRODUCT_ID || 'prod_pro_plan',
    is_active: true
  },
  {
    name: 'Team Plan (Yearly)',
    price: 80.00, // ~17% discount (2 months free)
    billing_interval: 'year',
    trial_period_days: 14,
    features: {
      dailyQueries: -1,
      errorExplanation: true,
      fixSuggestions: true,
      documentationLinks: true,
      errorHistory: true,
      teamFeatures: true,
      sharedHistory: true,
      teamDashboard: true,
      supportLevel: 'priority',
      advancedAnalysis: true,
      codeSnippets: true,
      teamInsights: true,
      yearlyDiscount: true
    },
    limits: {
      maxDailyQueries: -1,
      maxMonthlyQueries: -1,
      errorCategories: ['excel', 'sql', 'windows', 'python', 'javascript', 'java', 'c++', 'react', 'node', 'general'],
      historyRetention: -1,
      teamMembers: 10,
      sharedWorkspaces: 5
    },
    max_users: 10,
    max_team_members: 10,
    description: 'Annual Team subscription - Save $16! (2 months free)',
    dodo_plan_id: process.env.DODO_TEAM_YEARLY_PLAN_ID || 'plan_team_yearly',
    dodo_product_id: process.env.DODO_TEAM_PRODUCT_ID || 'prod_team_plan',
    is_active: true
  }
];

async function seedSubscriptionPlans() {
  try {
    console.log('🌱 Starting subscription plans seeding...');
    
    // Connect to database
    await sequelize.authenticate();
    console.log('✅ Database connected');

    // Sync models
    await sequelize.sync();
    console.log('✅ Models synced');

    console.log(`📦 Seeding ${defaultPlans.length} subscription plans...`);

    for (const planData of defaultPlans) {
      try {
        const [plan, created] = await SubscriptionPlan.findOrCreate({
          where: { name: planData.name },
          defaults: planData
        });

        if (created) {
          console.log(`✅ Created plan: ${plan.name}`);
        } else {
          // Update existing plan with new data
          await plan.update(planData);
          console.log(`🔄 Updated plan: ${plan.name}`);
        }
      } catch (error) {
        console.error(`❌ Failed to seed plan: ${planData.name}`, error.message);
      }
    }

    // Display summary
    console.log('\n📊 Subscription Plans Summary:');
    const plans = await SubscriptionPlan.findAll({
      attributes: ['name', 'price', 'billing_interval', 'dodo_plan_id', 'is_active'],
      order: [['price', 'ASC']]
    });

    console.table(plans.map(p => ({
      Name: p.name,
      Price: `$${p.price}/${p.billing_interval}`,
      'Dodo Plan ID': p.dodo_plan_id || 'N/A',
      Active: p.is_active ? '✅' : '❌'
    })));

    console.log('\n🎉 Subscription plans seeding completed successfully!');

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// CLI interface
if (require.main === module) {
  seedSubscriptionPlans()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { seedSubscriptionPlans, defaultPlans };