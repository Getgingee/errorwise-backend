const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      // Add is_active column
      await queryInterface.addColumn('users', 'is_active', {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        allowNull: false
      });

      // Add role column
      await queryInterface.addColumn('users', 'role', {
        type: DataTypes.ENUM('user', 'admin'),
        defaultValue: 'user',
        allowNull: false
      });

      // Add subscription_status column
      await queryInterface.addColumn('users', 'subscription_status', {
        type: DataTypes.ENUM('free', 'team', 'premium'),
        defaultValue: 'free',
        allowNull: false
      });

      console.log('✅ Successfully added user fields: is_active, role, subscription_status');
    } catch (error) {
      console.error('❌ Error adding user fields:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      // Remove columns in reverse order
      await queryInterface.removeColumn('users', 'subscription_status');
      await queryInterface.removeColumn('users', 'role');
      await queryInterface.removeColumn('users', 'is_active');

      console.log('✅ Successfully removed user fields');
    } catch (error) {
      console.error('❌ Error removing user fields:', error);
      throw error;
    }
  }
};