require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgresql://errorwise_user:secure_password_2024@localhost:5432/errorwise_db',
  {
    dialect: 'postgresql',
    logging: false
  }
);

// Import the User model
const User = require('./src/models/User')(sequelize, DataTypes);

async function resetPassword() {
  try {
    console.log('🔄 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    const email = 'pankaj@getgingee.com';
    const newPassword = 'Test123!@#';

    // Hash the password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update the user
    const result = await User.update(
      { password: hashedPassword },
      { where: { email } }
    );

    if (result[0] > 0) {
      console.log('✅ Password updated successfully!');
      console.log(`📧 Email: ${email}`);
      console.log(`🔐 New Password: ${newPassword}`);
    } else {
      console.log('❌ User not found or password not updated');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetPassword();
