/**
 * Standalone Migration Script: Add Email Change and Account Deletion Columns
 * Run this directly: node run-email-migration.js
 */

const sequelize = require('./src/config/database');
const { QueryInterface } = require('sequelize');

async function runMigration() {
  const queryInterface = sequelize.getQueryInterface();
  
  console.log('🔄 Starting migration: Add email change and account deletion columns...\n');
  
  try {
    // Check if columns already exist
    const tableDescription = await queryInterface.describeTable('users');
    
    if (!tableDescription.pending_email) {
      console.log('  ➕ Adding column: pending_email');
      await queryInterface.addColumn('users', 'pending_email', {
        type: sequelize.Sequelize.STRING,
        allowNull: true
      });
    } else {
      console.log('  ✅ Column already exists: pending_email');
    }
    
    if (!tableDescription.email_change_token) {
      console.log('  ➕ Adding column: email_change_token');
      await queryInterface.addColumn('users', 'email_change_token', {
        type: sequelize.Sequelize.STRING,
        allowNull: true
      });
    } else {
      console.log('  ✅ Column already exists: email_change_token');
    }
    
    if (!tableDescription.email_change_token_expiry) {
      console.log('  ➕ Adding column: email_change_token_expiry');
      await queryInterface.addColumn('users', 'email_change_token_expiry', {
        type: sequelize.Sequelize.DATE,
        allowNull: true
      });
    } else {
      console.log('  ✅ Column already exists: email_change_token_expiry');
    }
    
    if (!tableDescription.deletion_reason) {
      console.log('  ➕ Adding column: deletion_reason');
      await queryInterface.addColumn('users', 'deletion_reason', {
        type: sequelize.Sequelize.TEXT,
        allowNull: true
      });
    } else {
      console.log('  ✅ Column already exists: deletion_reason');
    }
    
    if (!tableDescription.restoration_deadline) {
      console.log('  ➕ Adding column: restoration_deadline');
      await queryInterface.addColumn('users', 'restoration_deadline', {
        type: sequelize.Sequelize.DATE,
        allowNull: true
      });
    } else {
      console.log('  ✅ Column already exists: restoration_deadline');
    }
    
    console.log('\n✅ Migration completed successfully!');
    console.log('\nNew columns added to users table:');
    console.log('  - pending_email (for email change workflow)');
    console.log('  - email_change_token (verification token)');
    console.log('  - email_change_token_expiry (token expiry time)');
    console.log('  - deletion_reason (why user deleted account)');
    console.log('  - restoration_deadline (30-day recovery window)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run migration
runMigration();
