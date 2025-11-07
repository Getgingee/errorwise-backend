// Quick migration runner - Run this on Railway or locally pointing to Railway DB
const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
  // Determine if we need SSL (Railway uses SSL, local might not)
  const isProduction = process.env.DATABASE_URL?.includes('railway') || 
                       process.env.DATABASE_URL?.includes('aws') ||
                       process.env.DATABASE_URL?.includes('azure');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ...(isProduction && {
      ssl: {
        rejectUnauthorized: false
      }
    })
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Check if table exists
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'ErrorQueries'
      );
    `);

    if (checkTable.rows[0].exists) {
      console.log('⚠️  ErrorQueries table already exists. Skipping creation.');
      return;
    }

    console.log('📝 Creating ErrorQueries table...');

    // Create table
    await client.query(`
      CREATE TABLE "ErrorQueries" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        "errorMessage" TEXT NOT NULL,
        "explanation" TEXT NOT NULL,
        "solution" TEXT,
        "errorCategory" VARCHAR(255) DEFAULT 'general',
        "aiProvider" VARCHAR(255) DEFAULT 'mock',
        "userSubscriptionTier" VARCHAR(255) NOT NULL DEFAULT 'free' CHECK ("userSubscriptionTier" IN ('free', 'pro', 'team')),
        "responseTime" INTEGER,
        "tags" JSONB DEFAULT '[]'::jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✅ ErrorQueries table created');

    // Create indexes
    console.log('📝 Creating indexes...');
    
    await client.query(`
      CREATE INDEX "error_queries_user_created_idx" ON "ErrorQueries" ("userId", "createdAt");
    `);
    
    await client.query(`
      CREATE INDEX "error_queries_category_idx" ON "ErrorQueries" ("errorCategory");
    `);

    console.log('✅ Indexes created');
    console.log('✨ Migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

runMigration()
  .then(() => {
    console.log('🎉 Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Error:', error);
    process.exit(1);
  });
