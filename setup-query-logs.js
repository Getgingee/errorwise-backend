/**
 * Setup Query Logs Table (A1 - Central Error Logging)
 * 
 * Run this script to create the query_logs table for the
 * central error logging system.
 * 
 * Usage: node setup-query-logs.js
 * 
 * @ticket A1 – Implement structured error logging for all queries
 * @epic EPIC A — Reliability & Error Handling
 */

require('dotenv').config();
const sequelize = require('./src/config/database');
const QueryLog = require('./src/models/QueryLog');

async function setupQueryLogs() {
  console.log('🔧 Setting up Query Logs table (A1 - Central Error Logging)...\n');
  
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Sync the QueryLog model (creates table if not exists)
    await QueryLog.sync({ alter: true });
    console.log('✅ QueryLog table created/updated');
    
    // Verify table structure
    const tableInfo = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'query_logs'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📋 Table structure:');
    console.log('-'.repeat(60));
    tableInfo[0].forEach(col => {
      console.log(`  ${col.column_name.padEnd(25)} ${col.data_type.padEnd(15)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    console.log('-'.repeat(60));
    
    // Check indexes
    const indexes = await sequelize.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'query_logs';
    `);
    
    console.log('\n📑 Indexes:');
    indexes[0].forEach(idx => {
      console.log(`  ${idx.indexname}`);
    });
    
    console.log('\n✅ Query Logs setup complete!');
    console.log('\n📝 Endpoints available:');
    console.log('  GET /api/admin/query-logs           - View recent logs');
    console.log('  GET /api/admin/query-logs/dashboard - Dashboard summary');
    console.log('  GET /api/admin/query-logs/stats     - Statistics');
    console.log('  GET /api/admin/query-logs/failures  - Recent failures');
    console.log('  GET /api/admin/query-logs/low-confidence - Low confidence responses');
    console.log('  GET /api/admin/query-logs/patterns  - Common error patterns');
    
  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('\n👋 Database connection closed');
  }
}

setupQueryLogs();
