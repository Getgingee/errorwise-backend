require('dotenv').config();
const {Pool} = require('pg');

// Use Railway DATABASE_URL from .env or environment
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:FJuEbqaGARDJGJJuJYqrJUOVFUuwUPaJ@centerbeam.proxy.rlwy.net:42612/railway';

console.log('Connecting to:', connectionString.replace(/:[^:@]*@/, ':****@'));

const p = new Pool({
  connectionString: connectionString,
  ssl: false
});

p.query(`
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
`).then(() => {
  console.log('✅ Newsletter table created!');
  p.end();
}).catch(e => {
  console.error('❌', e.message);
  p.end();
});
