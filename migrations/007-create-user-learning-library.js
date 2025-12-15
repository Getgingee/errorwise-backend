/**
 * User Learning Library Migration
 * Creates user_learning_libraries table for storing user-specific learned errors
 * 
 * Purpose:
 * - Each user has a personal knowledge base of errors they've solved
 * - Separate from system-wide error library
 * - Fully searchable and categorized
 * 
 * Features:
 * - User-specific entries (private by default)
 * - Rich metadata (tags, categories, code examples, source links)
 * - Usage tracking (reference count, last accessed)
 * - Ratings and verification status
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🎓 Creating user_learning_libraries table...');

    try {
      // Create the main table
      await queryInterface.createTable('user_learning_libraries', {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
          allowNull: false
        },

        // Foreign key to users table
        userId: {
          type: Sequelize.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onDelete: 'CASCADE',
          comment: 'User who created this learning entry'
        },

        // Error identifiers
        errorCode: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Error code like E402, 404, ECONNREFUSED'
        },

        errorPattern: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Normalized pattern for matching similar errors'
        },

        // Content
        title: {
          type: Sequelize.STRING(255),
          allowNull: false,
          comment: 'User-friendly title'
        },

        errorMessage: {
          type: Sequelize.TEXT,
          allowNull: false,
          comment: 'Original error message user encountered'
        },

        explanation: {
          type: Sequelize.TEXT,
          allowNull: false,
          comment: 'Why this error occurs'
        },

        solution: {
          type: Sequelize.TEXT,
          allowNull: false,
          comment: 'Step-by-step solution'
        },

        codeExample: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Code snippet showing the fix'
        },

        // Categorization
        category: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'general',
          comment: 'Category for organizing'
        },

        subcategory: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'More specific category'
        },

        language: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: 'Programming language'
        },

        framework: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: 'Framework or platform'
        },

        // Metadata
        difficulty: {
          type: Sequelize.ENUM('beginner', 'intermediate', 'advanced'),
          defaultValue: 'intermediate',
          comment: 'Difficulty level'
        },

        timeToSolve: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: 'How long it took (minutes)'
        },

        source: {
          type: Sequelize.ENUM('ai', 'forum', 'documentation', 'stackoverflow', 'personal'),
          allowNull: true,
          comment: 'Where solution came from'
        },

        sourceUrl: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'Link to original source'
        },

        // Arrays (JSONB)
        tags: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: [],
          comment: 'Custom tags for organization'
        },

        platforms: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: [],
          comment: 'Platforms affected'
        },

        commonCauses: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: [],
          comment: 'Common causes'
        },

        preventionTips: {
          type: Sequelize.JSONB,
          allowNull: true,
          defaultValue: [],
          comment: 'Tips to prevent'
        },

        // Usage & Ratings
        referenceCount: {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: 'How many times user looked it up'
        },

        userRating: {
          type: Sequelize.INTEGER,
          defaultValue: 5,
          validate: {
            min: 1,
            max: 5
          },
          comment: 'User 1-5 rating'
        },

        lastReferencedAt: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: 'Last time user viewed'
        },

        isVerified: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          comment: 'User confirmed still works'
        },

        isShared: {
          type: Sequelize.BOOLEAN,
          defaultValue: false,
          comment: 'Share with community'
        },

        // Status
        status: {
          type: Sequelize.ENUM('active', 'archived', 'deprecated'),
          defaultValue: 'active',
          comment: 'Active, archived, or deprecated'
        },

        notes: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: 'User additional notes'
        },

        // Timestamps
        createdAt: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
          allowNull: false
        },

        updatedAt: {
          type: Sequelize.DATE,
          defaultValue: Sequelize.NOW,
          allowNull: false
        }
      });

      console.log('✓ Created table: user_learning_libraries');

      // Add indexes for performance
      await queryInterface.addIndex('user_learning_libraries', ['userId'], {
        name: 'idx_user_learning_userId',
        concurrently: true
      });
      console.log('✓ Added index: userId');

      await queryInterface.addIndex('user_learning_libraries', ['userId', 'category'], {
        name: 'idx_user_learning_userId_category',
        concurrently: true
      });
      console.log('✓ Added index: userId + category');

      await queryInterface.addIndex('user_learning_libraries', ['userId', 'status'], {
        name: 'idx_user_learning_userId_status',
        concurrently: true
      });
      console.log('✓ Added index: userId + status');

      await queryInterface.addIndex('user_learning_libraries', ['userId', 'errorPattern'], {
        name: 'idx_user_learning_userId_pattern',
        concurrently: true
      });
      console.log('✓ Added index: userId + errorPattern');

      await queryInterface.addIndex('user_learning_libraries', ['errorCode'], {
        name: 'idx_user_learning_errorCode',
        concurrently: true
      });
      console.log('✓ Added index: errorCode');

      console.log('✅ User learning library migration completed successfully!');

    } catch (error) {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 Reverting user_learning_libraries table...');

    try {
      // Remove all indexes first
      try {
        await queryInterface.removeIndex('user_learning_libraries', 'idx_user_learning_userId');
        await queryInterface.removeIndex('user_learning_libraries', 'idx_user_learning_userId_category');
        await queryInterface.removeIndex('user_learning_libraries', 'idx_user_learning_userId_status');
        await queryInterface.removeIndex('user_learning_libraries', 'idx_user_learning_userId_pattern');
        await queryInterface.removeIndex('user_learning_libraries', 'idx_user_learning_errorCode');
        console.log('✓ Removed indexes');
      } catch (e) {
        console.warn('⚠️ Some indexes may not have existed');
      }

      // Drop table
      await queryInterface.dropTable('user_learning_libraries');
      console.log('✓ Dropped table: user_learning_libraries');
      console.log('✅ Revert completed successfully!');

    } catch (error) {
      console.error('❌ Revert failed:', error.message);
      throw error;
    }
  }
};
