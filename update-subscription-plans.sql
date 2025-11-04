-- ============================================================
-- SUBSCRIPTION PLANS UPDATE - Align with Dodo Payments
-- ============================================================
-- This script updates subscription plans to match dodoPayments.js
-- and ensures payment webhooks properly grant features
-- ============================================================

-- 1. UPDATE FREE PLAN (Plan ID: 1)
UPDATE subscription_plans
SET 
  name = 'Free Plan',
  price = 0.00,
  billing_interval = 'month',
  trial_period_days = 0,
  dodo_plan_id = NULL,
  dodo_product_id = NULL,
  description = 'Perfect for trying out ErrorWise. Get 50 error explanations per month with 7-day history.',
  features = '{
    "dailyQueries": -1,
    "monthlyQueries": 50,
    "errorExplanation": true,
    "fixSuggestions": false,
    "codeExamples": false,
    "documentationLinks": true,
    "errorHistory": "7 days",
    "teamFeatures": false,
    "aiProvider": "claude-3-haiku-20240307",
    "maxTokens": 800,
    "supportLevel": "community",
    "advancedAnalysis": false,
    "priorityQueue": false,
    "exportHistory": false
  }'::jsonb,
  limits = '{
    "maxDailyQueries": -1,
    "maxMonthlyQueries": 50,
    "historyRetention": 7,
    "teamMembers": 1,
    "errorCategories": ["excel", "sql", "windows", "python", "javascript", "general"]
  }'::jsonb,
  is_active = true,
  updated_at = NOW()
WHERE plan_id = 1;

-- 2. UPDATE PRO PLAN MONTHLY (Plan ID: 2)
UPDATE subscription_plans
SET 
  name = 'Pro Plan',
  price = 2.00,
  billing_interval = 'month',
  trial_period_days = 7,
  dodo_plan_id = 'plan_pro_monthly',
  dodo_product_id = 'prod_pro_plan',
  description = 'Unlimited error queries with fixes, documentation links, and complete history.',
  features = '{
    "dailyQueries": -1,
    "monthlyQueries": -1,
    "errorExplanation": true,
    "fixSuggestions": true,
    "codeExamples": true,
    "preventionTips": true,
    "documentationLinks": true,
    "errorHistory": "unlimited",
    "teamFeatures": false,
    "aiProvider": "claude-3-haiku-20240307",
    "maxTokens": 1200,
    "supportLevel": "email",
    "advancedAnalysis": true,
    "priorityQueue": true,
    "multiLanguageSupport": true,
    "exportHistory": true,
    "urlScrapingContext": true
  }'::jsonb,
  limits = '{
    "maxDailyQueries": -1,
    "maxMonthlyQueries": -1,
    "historyRetention": 365,
    "teamMembers": 1,
    "errorCategories": ["excel", "sql", "windows", "python", "javascript", "java", "c++", "react", "node", "typescript", "php", "ruby", "go", "rust", "general"]
  }'::jsonb,
  is_active = true,
  updated_at = NOW()
WHERE plan_id = 2;

-- 3. UPDATE TEAM PLAN MONTHLY (Plan ID: 6)
UPDATE subscription_plans
SET 
  name = 'Team Plan',
  price = 8.00,
  billing_interval = 'month',
  trial_period_days = 14,
  dodo_plan_id = 'plan_team_monthly',
  dodo_product_id = 'prod_team_plan',
  description = 'Everything in Pro plus shared team history, team dashboard, and collaborative features.',
  features = '{
    "dailyQueries": -1,
    "monthlyQueries": -1,
    "errorExplanation": true,
    "fixSuggestions": true,
    "codeExamples": true,
    "preventionTips": true,
    "documentationLinks": true,
    "errorHistory": "unlimited",
    "teamFeatures": true,
    "teamMembers": 10,
    "sharedHistory": true,
    "teamDashboard": true,
    "teamInsights": true,
    "aiProvider": "claude-3-5-sonnet-20241022",
    "maxTokens": 2000,
    "supportLevel": "priority",
    "advancedAnalysis": true,
    "priorityQueue": true,
    "multiLanguageSupport": true,
    "exportHistory": true,
    "urlScrapingContext": true,
    "apiAccess": true,
    "customIntegrations": true
  }'::jsonb,
  limits = '{
    "maxDailyQueries": -1,
    "maxMonthlyQueries": -1,
    "historyRetention": -1,
    "teamMembers": 10,
    "sharedWorkspaces": 5,
    "errorCategories": ["excel", "sql", "windows", "python", "javascript", "java", "c++", "react", "node", "typescript", "php", "ruby", "go", "rust", "general"]
  }'::jsonb,
  max_users = 10,
  max_team_members = 10,
  is_active = true,
  updated_at = NOW()
WHERE plan_id = 6;

-- 4. UPDATE PRO PLAN YEARLY (Plan ID: 4) - Optional
UPDATE subscription_plans
SET 
  name = 'Pro Plan (Yearly)',
  price = 20.00,
  billing_interval = 'year',
  trial_period_days = 7,
  dodo_plan_id = 'plan_pro_yearly',
  dodo_product_id = 'prod_pro_plan',
  description = 'Annual Pro subscription - Save $4! (2 months free)',
  features = '{
    "dailyQueries": -1,
    "monthlyQueries": -1,
    "errorExplanation": true,
    "fixSuggestions": true,
    "codeExamples": true,
    "preventionTips": true,
    "documentationLinks": true,
    "errorHistory": "unlimited",
    "teamFeatures": false,
    "aiProvider": "claude-3-haiku-20240307",
    "maxTokens": 1200,
    "supportLevel": "email",
    "advancedAnalysis": true,
    "priorityQueue": true,
    "multiLanguageSupport": true,
    "exportHistory": true,
    "urlScrapingContext": true,
    "yearlyDiscount": true
  }'::jsonb,
  is_active = false,
  updated_at = NOW()
WHERE plan_id = 4;

-- 5. UPDATE TEAM PLAN YEARLY (Plan ID: 7) - Optional
UPDATE subscription_plans
SET 
  name = 'Team Plan (Yearly)',
  price = 80.00,
  billing_interval = 'year',
  trial_period_days = 14,
  dodo_plan_id = 'plan_team_yearly',
  dodo_product_id = 'prod_team_plan',
  description = 'Annual Team subscription - Save $16! (2 months free)',
  features = '{
    "dailyQueries": -1,
    "monthlyQueries": -1,
    "errorExplanation": true,
    "fixSuggestions": true,
    "codeExamples": true,
    "preventionTips": true,
    "documentationLinks": true,
    "errorHistory": "unlimited",
    "teamFeatures": true,
    "teamMembers": 10,
    "sharedHistory": true,
    "teamDashboard": true,
    "teamInsights": true,
    "aiProvider": "claude-3-5-sonnet-20241022",
    "maxTokens": 2000,
    "supportLevel": "priority",
    "advancedAnalysis": true,
    "priorityQueue": true,
    "multiLanguageSupport": true,
    "exportHistory": true,
    "urlScrapingContext": true,
    "apiAccess": true,
    "customIntegrations": true,
    "yearlyDiscount": true
  }'::jsonb,
  is_active = false,
  updated_at = NOW()
WHERE plan_id = 7;

-- 6. DISABLE ENTERPRISE PLANS (Not in dodoPayments.js)
UPDATE subscription_plans
SET 
  is_active = false,
  updated_at = NOW()
WHERE plan_id IN (3, 5);

-- ============================================================
-- VERIFY CHANGES
-- ============================================================
-- Check Free, Pro, and Team monthly plans only
SELECT 
  plan_id,
  name,
  price,
  billing_interval,
  trial_period_days,
  dodo_plan_id,
  is_active,
  features->>'aiProvider' as ai_provider,
  features->>'monthlyQueries' as monthly_queries,
  features->>'teamFeatures' as team_features
FROM subscription_plans
WHERE plan_id IN (1, 2, 6)
ORDER BY price ASC;

-- ============================================================
-- IMPORTANT NOTES:
-- ============================================================
-- After running this script:
-- 1. Plans are aligned with dodoPayments.js
-- 2. Only 3 active plans: Free, Pro Monthly, Team Monthly
-- 3. Dodo plan IDs match payment gateway configuration
-- 4. Features are properly structured for frontend display
-- 5. Yearly plans are disabled (can enable later)
-- 6. Enterprise plans are disabled
--
-- When Dodo webhook receives payment:
-- - Uses dodo_plan_id to find the plan
-- - Grants features from the 'features' JSONB column
-- - Updates user subscription tier
-- - Unlocks corresponding features in the app
-- ============================================================
