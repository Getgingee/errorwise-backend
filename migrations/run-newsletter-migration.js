const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function migrateNewsletter() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false
  });

  try {
    console.log('📧 Starting Newsletter table migration...');
    console.log(`Connecting to: ${process.env.DATABASE_URL.replace(/:[^:@]*@/, ':****@')}`);

    // Simplified SQL - just create the table without triggers
    const sql = `
      CREATE TABLE IF NOT EXISTS newslettersubscriptions (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        name VARCHAR(255),
        user_id UUID,
        status VARCHAR(50) DEFAULT 'active',
        source VARCHAR(50) DEFAULT 'website',
        subscription_type VARCHAR(50) DEFAULT 'general',
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

      CREATE TABLE IF NOT EXISTS newslettercampaigns (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        subject VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        template VARCHAR(100),
        status VARCHAR(50) DEFAULT 'draft',
        recipient_count INTEGER DEFAULT 0,
        sent_count INTEGER DEFAULT 0,
        opened_count INTEGER DEFAULT 0,
        clicked_count INTEGER DEFAULT 0,
        scheduled_for TIMESTAMP,
        sent_at TIMESTAMP,
        created_by UUID,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    console.log('\n📄 Executing SQL from add-newsletter-table.sql...');
    
    // Execute the SQL
    await pool.query(sql);

    console.log('\n✅ Success! Newsletter tables created:');
    console.log('   - newslettersubscriptions');
    console.log('   - newslettercampaigns');

    // Verify the tables exist
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('newslettersubscriptions', 'newslettercampaigns')
      ORDER BY table_name
    `);

    console.log('\n📋 Verified tables:');
    result.rows.forEach(row => console.log(`   ✓ ${row.table_name}`));

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.detail) console.error('Detail:', error.detail);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrateNewsletter();
