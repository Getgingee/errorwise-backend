module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('ErrorQueries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      errorMessage: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      explanation: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      solution: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      errorCategory: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'general'
      },
      aiProvider: {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'mock'
      },
      userSubscriptionTier: {
        type: Sequelize.ENUM('free', 'pro', 'team'),
        allowNull: false,
        defaultValue: 'free'
      },
      responseTime: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      tags: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('ErrorQueries', ['userId', 'createdAt'], {
      name: 'error_queries_user_created_idx'
    });
    
    await queryInterface.addIndex('ErrorQueries', ['errorCategory'], {
      name: 'error_queries_category_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('ErrorQueries');
  }
};
