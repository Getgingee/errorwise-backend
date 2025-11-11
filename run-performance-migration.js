/**
 * Run Performance Optimization Migration
 * Safely adds database indexes to speed up queries
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');
const path = require('path');

// Database connection
const isProduction = process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway.app');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: (msg) => console.log(`[DB] ${msg}`),
  dialectOptions: {
    ssl: isProduction ? {
      require: true,
      rejectUnauthorized: false
    } : false
  }
});

async function runMigration() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║  ErrorWise Performance Optimization Migration        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  try {
    // Test connection
    console.log('🔌 Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    // Check existing indexes
    console.log('📊 Checking existing indexes...');
    const [existingIndexes] = await sequelize.query(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
      AND tablename IN ('ErrorQueries', 'Subscriptions', 'usage_logs', 'Users', 'TeamMembers', 'SharedErrors')
      ORDER BY tablename, indexname;
    `);

    console.log(`Found ${existingIndexes.length} existing indexes:\n`);
    
    const indexesByTable = {};
    existingIndexes.forEach(idx => {
      if (!indexesByTable[idx.tablename]) {
        indexesByTable[idx.tablename] = [];
      }
      indexesByTable[idx.tablename].push(idx.indexname);
    });

    Object.entries(indexesByTable).forEach(([table, indexes]) => {
      console.log(`  ${table}: ${indexes.length} indexes`);
      indexes.forEach(idx => console.log(`    - ${idx}`));
    });

    console.log('\n⚠️  About to add performance indexes...');
    console.log('This will improve query performance but may take 1-2 minutes.\n');

    // Countdown
    console.log('Starting in:');
    for (let i = 3; i > 0; i--) {
      process.stdout.write(`  ${i}...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('\n');

    // Load and run migration
    const migration = require('./migrations/006-add-performance-indexes.js');
    const queryInterface = sequelize.getQueryInterface();

    await migration.up(queryInterface, Sequelize);

    // Verify new indexes
    console.log('\n📊 Verifying new indexes...');
    const [newIndexes] = await sequelize.query(`
      SELECT 
        tablename,
        indexname
      FROM pg_indexes 
      WHERE schemaname = 'public'
      AND indexname LIKE 'idx_%'
      ORDER BY tablename, indexname;
    `);

    console.log(`\n✓ Total indexes: ${newIndexes.length}`);
    
    const newIndexesByTable = {};
    newIndexes.forEach(idx => {
      if (!newIndexesByTable[idx.tablename]) {
        newIndexesByTable[idx.tablename] = [];
      }
      newIndexesByTable[idx.tablename].push(idx.indexname);
    });

    console.log('\nIndexes by table:');
    Object.entries(newIndexesByTable).forEach(([table, indexes]) => {
      console.log(`  ${table}: ${indexes.length} indexes`);
    });

    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Migration Complete - Performance Optimized!       ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log('\n📈 Expected improvements:');
    console.log('  - Dashboard reload: 50-70% faster');
    console.log('  - Recent errors query: 70-90% faster');
    console.log('  - Subscription lookups: 60-80% faster');
    console.log('  - Team queries: 50-75% faster');
    console.log('\n💡 Test the improvements:');
    console.log('  1. Reload your dashboard');
    console.log('  2. Check browser DevTools → Network tab');
    console.log('  3. Compare response times\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error('\nError details:', error.message);
    
    if (error.name === 'SequelizeDatabaseError') {
      console.error('\n💡 Common fixes:');
      console.error('  - Index already exists: Safe to ignore');
      console.error('  - Table not found: Run table migrations first');
      console.error('  - Permission denied: Check database user permissions');
    }
    
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run migration
runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
