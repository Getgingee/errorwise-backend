require('dotenv').config();
const { Pool } = require('pg');

/**
 * Migration: Add source column to Feedback table
 * Run with: node migrations/run-feedback-migration.js
 * 
 * This will run on Railway database if DATABASE_URL is set,
 * otherwise falls back to local configuration
 */

// Create pool with Railway DATABASE_URL or local config
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false  // Railway doesn't require SSL
});

async function runMigration() {
  console.log('🔗 Connecting to database...');
  console.log(`📍 Database: ${process.env.DATABASE_URL ? 'Railway (Production)' : 'Local'}\n`);
  
  const client = await pool.connect();
  
  try {
    console.log('🚀 Starting Feedback table migration...\n');
    
    await client.query('BEGIN');
    
    // First, create Feedback table if it doesn't exist
    console.log('📋 Checking if Feedback table exists...');
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'feedback'
      )
    `);
    
    if (!tableExists.rows[0].exists) {
      console.log('✅ Creating Feedback table...');
      await client.query(`
        CREATE TABLE Feedback (
          id SERIAL PRIMARY KEY,
          user_email VARCHAR(255) NOT NULL,
          feedback_type VARCHAR(50) NOT NULL DEFAULT 'demo_feedback',
          subject VARCHAR(255),
          message TEXT NOT NULL,
          rating INTEGER CHECK (rating >= 1 AND rating <= 5),
          source VARCHAR(50) DEFAULT 'demo_limit',
          user_agent TEXT,
          ip_address VARCHAR(45),
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create indexes
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_feedback_source ON Feedback(source)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_feedback_type ON Feedback(feedback_type)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON Feedback(created_at)
      `);
      
      console.log('✅ Feedback table created successfully with source column');
    } else {
      console.log('ℹ️  Feedback table already exists');
      
      // Check if source column exists
      const checkColumn = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'feedback' AND column_name = 'source'
      `);
      
      if (checkColumn.rows.length === 0) {
        console.log('✅ Adding source column to Feedback table...');
        await client.query(`
          ALTER TABLE Feedback 
          ADD COLUMN source VARCHAR(50) DEFAULT 'general'
        `);
        
        await client.query(`
          COMMENT ON COLUMN Feedback.source IS 'Source of feedback: demo_limit, general, feature_page, etc.'
        `);
        
        console.log('✅ Source column added successfully');
        
        // Create index on source column
        console.log('✅ Creating index on source column...');
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_feedback_source ON Feedback(source)
        `);
        console.log('✅ Index created successfully');
      } else {
        console.log('ℹ️  Source column already exists');
      }
    }
    
    // Verify the changes
    const verify = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'feedback' 
      AND column_name IN ('source', 'feedback_type', 'message', 'user_email')
      ORDER BY ordinal_position
    `);
    
    console.log('\n📋 Current Feedback table structure:');
    console.table(verify.rows);
    
    await client.query('COMMIT');
    
    console.log('\n✅ Migration completed successfully!');
    console.log('💡 The Feedback table now supports source tracking for feedback');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
