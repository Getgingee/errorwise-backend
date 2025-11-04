-- Migration: Add Newsletter Subscriptions Table
-- Date: 2025-11-03
-- Description: Creates table to store newsletter subscriptions

BEGIN;

-- ============================================
-- NEWSLETTER SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS NewsletterSubscriptions (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255),
    user_id UUID REFERENCES Users(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced', 'complained')),
    source VARCHAR(50) DEFAULT 'website' CHECK (source IN ('website', 'footer', 'modal', 'api')),
    subscription_type VARCHAR(50) DEFAULT 'general' CHECK (subscription_type IN ('general', 'product_updates', 'tips', 'all')),
    preferences JSONB DEFAULT '{}',
    confirmation_token VARCHAR(255),
    confirmed_at TIMESTAMP,
    ip_address VARCHAR(45),
    user_agent TEXT,
    unsubscribe_token VARCHAR(255) UNIQUE,
    unsubscribed_at TIMESTAMP,
    unsubscribe_reason TEXT,
    last_email_sent_at TIMESTAMP,
    email_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for NewsletterSubscriptions
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON NewsletterSubscriptions(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_user_id ON NewsletterSubscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON NewsletterSubscriptions(status);
CREATE INDEX IF NOT EXISTS idx_newsletter_source ON NewsletterSubscriptions(source);
CREATE INDEX IF NOT EXISTS idx_newsletter_created_at ON NewsletterSubscriptions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token ON NewsletterSubscriptions(unsubscribe_token);

-- Trigger for updated_at
CREATE TRIGGER update_newsletter_updated_at BEFORE UPDATE ON NewsletterSubscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments
COMMENT ON TABLE NewsletterSubscriptions IS 'Stores newsletter subscription data from footer and modals';
COMMENT ON COLUMN NewsletterSubscriptions.email IS 'Subscriber email address (unique)';
COMMENT ON COLUMN NewsletterSubscriptions.status IS 'Subscription status: active, unsubscribed, bounced, complained';
COMMENT ON COLUMN NewsletterSubscriptions.source IS 'Where the subscription came from: website, footer, modal, api';
COMMENT ON COLUMN NewsletterSubscriptions.preferences IS 'JSON object storing email preferences';
COMMENT ON COLUMN NewsletterSubscriptions.unsubscribe_token IS 'Unique token for one-click unsubscribe';

-- ============================================
-- NEWSLETTER CAMPAIGNS TABLE (Optional for future)
-- ============================================
CREATE TABLE IF NOT EXISTS NewsletterCampaigns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    template VARCHAR(100),
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
    recipient_count INTEGER DEFAULT 0,
    sent_count INTEGER DEFAULT 0,
    opened_count INTEGER DEFAULT 0,
    clicked_count INTEGER DEFAULT 0,
    scheduled_for TIMESTAMP,
    sent_at TIMESTAMP,
    created_by UUID REFERENCES Users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for NewsletterCampaigns
CREATE INDEX IF NOT EXISTS idx_campaign_status ON NewsletterCampaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_scheduled ON NewsletterCampaigns(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_campaign_created_at ON NewsletterCampaigns(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_campaign_updated_at BEFORE UPDATE ON NewsletterCampaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE NewsletterCampaigns IS 'Stores newsletter campaign data for bulk emails';

COMMIT;

-- Verification: Check if tables were created
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('newslettersubscriptions', 'newslettercampaigns')
ORDER BY table_name;
