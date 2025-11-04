/**
 * Newsletter Migration Script
 * Creates NewsletterSubscriptions and NewsletterCampaigns tables
 */

const pool = require('./src/config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('📦 Starting newsletter migration...\n');

    // Read the SQL migration file
    const sqlPath = path.join(__dirname, 'migrations', 'add-newsletter-table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 Executing migration SQL...');

    // Execute the migration
    await pool.query(sql);

    console.log('✅ Newsletter tables created successfully!\n');

    // Verify tables were created
    const tablesCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('newslettersubscriptions', 'newslettercampaigns')
      ORDER BY table_name;
    `);

    console.log('📊 Created tables:');
    tablesCheck.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    // Get counts
    const countsResult = await pool.query(`
      SELECT 
        'NewsletterSubscriptions' as table_name, 
        COUNT(*) as record_count 
      FROM NewsletterSubscriptions
      UNION ALL
      SELECT 
        'Feedback' as table_name, 
        COUNT(*) as record_count 
      FROM Feedback
      UNION ALL
      SELECT 
        'ContactMessages' as table_name, 
        COUNT(*) as record_count 
      FROM ContactMessages;
    `);

    console.log('\n📈 Table record counts:');
    countsResult.rows.forEach(row => {
      console.log(`   ${row.table_name}: ${row.record_count}`);
    });

    console.log('\n🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigration();
