const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('postgresql://postgres:FPWFyzqLGVaxxaHeRMWEgsEhBkcVfOaZ@autorack.proxy.rlwy.net:45542/railway', {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { 
    ssl: { require: true, rejectUnauthorized: false },
    connectTimeout: 60000
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 60000,
    idle: 10000
  },
  retry: {
    max: 3
  }
});

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, primaryKey: true },
  email: DataTypes.STRING,
  username: DataTypes.STRING,
  subscriptionTier: DataTypes.ENUM('free', 'pro', 'team'),
  subscriptionStatus: DataTypes.ENUM('active', 'cancelled', 'past_due'),
  subscriptionEndDate: DataTypes.DATE
}, { tableName: 'Users' });

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to Railway');
    
    const user = await User.findOne({ where: { email: 'Hi@getgingee.com' } });
    if (!user) {
      console.log('❌ User Hi@getgingee.com not found');
      process.exit(1);
    }
    
    console.log(`\nCurrent: ${user.email} - ${user.subscriptionTier} (${user.subscriptionStatus})`);
    
    await user.update({
      subscriptionTier: 'pro',
      subscriptionStatus: 'active',
      subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });
    
    console.log(`✅ Updated: ${user.email} - ${user.subscriptionTier} (${user.subscriptionStatus})`);
    console.log(`📅 Valid until: ${user.subscriptionEndDate.toLocaleDateString()}\n`);
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await sequelize.close();
    process.exit(1);
  }
})();
