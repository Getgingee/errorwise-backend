// Migration runner for UserLearningLibrary table
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
        WHERE table_name = 'user_learning_libraries'
      );
    `);

    if (checkTable.rows[0].exists) {
      console.log('⚠️  user_learning_libraries table already exists. Skipping creation.');
      await client.end();
      return;
    }

    console.log('📝 Creating ENUM types...');

    // Create ENUM types
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_user_learning_libraries_difficulty" AS ENUM('beginner', 'intermediate', 'advanced');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_user_learning_libraries_source" AS ENUM('ai', 'forum', 'documentation', 'stackoverflow', 'personal');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await client.query(`
      DO $$ BEGIN
        CREATE TYPE "enum_user_learning_libraries_status" AS ENUM('active', 'archived', 'deprecated');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    console.log('✅ ENUM types created/verified');

    console.log('📝 Creating user_learning_libraries table...');

    // Create table
    await client.query(`
      CREATE TABLE IF NOT EXISTS "user_learning_libraries" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" UUID NOT NULL,
        
        -- Core Content Fields
        "errorCode" VARCHAR(50),
        "errorPattern" TEXT,
        "title" VARCHAR(500) NOT NULL,
        "errorMessage" TEXT NOT NULL,
        "explanation" TEXT NOT NULL,
        "solution" TEXT NOT NULL,
        "codeExample" TEXT,
        
        -- Categorization
        "category" VARCHAR(100),
        "subcategory" VARCHAR(100),
        "language" VARCHAR(50),
        "framework" VARCHAR(100),
        
        -- Metadata
        "difficulty" "enum_user_learning_libraries_difficulty" DEFAULT 'intermediate',
        "timeToSolve" INTEGER,
        "source" "enum_user_learning_libraries_source" DEFAULT 'personal',
        "sourceUrl" VARCHAR(1000),
        
        -- Arrays (JSONB)
        "tags" JSONB DEFAULT '[]'::jsonb,
        "platforms" JSONB DEFAULT '[]'::jsonb,
        "commonCauses" JSONB DEFAULT '[]'::jsonb,
        "preventionTips" JSONB DEFAULT '[]'::jsonb,
        
        -- Usage & Rating
        "referenceCount" INTEGER DEFAULT 0,
        "userRating" INTEGER CHECK ("userRating" >= 0 AND "userRating" <= 5),
        "lastReferencedAt" TIMESTAMP WITH TIME ZONE,
        "isVerified" BOOLEAN DEFAULT FALSE,
        
        -- Sharing
        "isShared" BOOLEAN DEFAULT FALSE,
        
        -- Status & Notes
        "status" "enum_user_learning_libraries_status" DEFAULT 'active',
        "notes" TEXT,
        
        -- Timestamps
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        -- Foreign Key
        CONSTRAINT user_learning_libraries_userId_fkey 
          FOREIGN KEY ("userId") 
          REFERENCES "Users"("id") 
          ON DELETE CASCADE 
          ON UPDATE CASCADE
      );
    `);;

    console.log('✅ user_learning_libraries table created');

    // Create indexes
    console.log('📝 Creating indexes...');

    // Index 1: userId lookup
    await client.query(`
      CREATE INDEX CONCURRENTLY idx_user_learning_libraries_userId 
      ON "user_learning_libraries"("userId");
    `).catch(err => {
      if (err.message.includes('already exists')) {
        console.log('⚠️  Index idx_user_learning_libraries_userId already exists');
      } else {
        throw err;
      }
    });

    // Index 2: userId + category filtering
    await client.query(`
      CREATE INDEX CONCURRENTLY idx_user_learning_libraries_userId_category 
      ON "user_learning_libraries"("userId", "category");
    `).catch(err => {
      if (err.message.includes('already exists')) {
        console.log('⚠️  Index idx_user_learning_libraries_userId_category already exists');
      } else {
        throw err;
      }
    });

    // Index 3: userId + status filtering
    await client.query(`
      CREATE INDEX CONCURRENTLY idx_user_learning_libraries_userId_status 
      ON "user_learning_libraries"("userId", "status");
    `).catch(err => {
      if (err.message.includes('already exists')) {
        console.log('⚠️  Index idx_user_learning_libraries_userId_status already exists');
      } else {
        throw err;
      }
    });

    // Index 4: userId + errorPattern (for pattern matching)
    await client.query(`
      CREATE INDEX CONCURRENTLY idx_user_learning_libraries_userId_errorPattern 
      ON "user_learning_libraries"("userId", "errorPattern");
    `).catch(err => {
      if (err.message.includes('already exists')) {
        console.log('⚠️  Index idx_user_learning_libraries_userId_errorPattern already exists');
      } else {
        throw err;
      }
    });

    // Index 5: errorCode global lookup
    await client.query(`
      CREATE INDEX CONCURRENTLY idx_user_learning_libraries_errorCode 
      ON "user_learning_libraries"("errorCode");
    `).catch(err => {
      if (err.message.includes('already exists')) {
        console.log('⚠️  Index idx_user_learning_libraries_errorCode already exists');
      } else {
        throw err;
      }
    });

    console.log('✅ All indexes created successfully');

    console.log('🎉 User Learning Library migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run migration
runMigration().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
