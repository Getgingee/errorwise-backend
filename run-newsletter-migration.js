const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Running newsletter table migration on Railway...\n');
    
    const sql = require('fs').readFileSync('migrations/add-newsletter-table.sql', 'utf8');
    await client.query(sql);
    
    console.log('Migration completed successfully!\n');
    
    const check = await client.query(\
      SELECT table_name FROM information_schema.tables 
      WHERE table_name IN ('newslettersubscriptions', 'newslettercampaigns')
    \);
    console.log('Tables created:', check.rows.map(r => r.table_name));
    
  } catch (error) {
    console.error('Migration failed:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
