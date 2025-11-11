require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');

// Railway database connection
const sequelize = new Sequelize('postgresql://postgres:FPWFyzqLGVaxxaHeRMWEgsEhBkcVfOaZ@autorack.proxy.rlwy.net:45542/railway', {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

// Define models inline
const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: DataTypes.STRING,
  username: DataTypes.STRING,
  subscriptionTier: { type: DataTypes.ENUM('free', 'pro', 'team'), defaultValue: 'free' },
  subscriptionStatus: { type: DataTypes.ENUM('active', 'cancelled', 'past_due'), defaultValue: 'active' },
  subscriptionEndDate: DataTypes.DATE
}, { tableName: 'Users' });

const Subscription = sequelize.define('Subscription', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  tier: { type: DataTypes.ENUM('free', 'pro', 'team'), defaultValue: 'free' },
  status: { type: DataTypes.ENUM('active', 'cancelled', 'past_due', 'paused'), defaultValue: 'active' },
  stripeCustomerId: DataTypes.STRING,
  stripeSubscriptionId: DataTypes.STRING,
  currentPeriodStart: DataTypes.DATE,
  currentPeriodEnd: DataTypes.DATE,
  cancelAtPeriodEnd: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'Subscriptions' });

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to Railway database');

    // Find the most recent user
    const user = await User.findOne({
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'email', 'username', 'subscriptionTier', 'subscriptionStatus', 'createdAt']
    });

    if (!user) {
      console.log('❌ No users found in database');
      process.exit(1);
    }

    console.log('\n👤 FOUND RECENT USER:');
    console.log('='.repeat(60));
    console.log(`📧 Email: ${user.email}`);
    console.log(`👤 Username: ${user.username}`);
    console.log(`🆔 User ID: ${user.id}`);
    console.log(`📅 Created: ${new Date(user.createdAt).toLocaleString()}`);
    console.log(`💳 Current Tier: ${user.subscriptionTier}`);
    console.log(`📊 Status: ${user.subscriptionStatus}`);
    console.log('='.repeat(60));

    if (user.subscriptionTier === 'pro' && user.subscriptionStatus === 'active') {
      console.log('\n✅ User is already on Pro plan!');
      await sequelize.close();
      process.exit(0);
    }

    console.log('\n🔄 UPGRADING TO PRO...');

    // Update user subscription
    await user.update({
      subscriptionTier: 'pro',
      subscriptionStatus: 'active',
      subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
    });

    // Create or update subscription record
    const [subscription, created] = await Subscription.findOrCreate({
      where: { userId: user.id },
      defaults: {
        userId: user.id,
        tier: 'pro',
        status: 'active',
        stripeCustomerId: `test_customer_${user.id}`,
        stripeSubscriptionId: `test_sub_${user.id}_${Date.now()}`,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false
      }
    });

    if (!created) {
      // Update existing subscription
      await subscription.update({
        tier: 'pro',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false
      });
    }

    console.log('\n✅ UPGRADE SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log(`📧 Email: ${user.email}`);
    console.log(`💳 New Tier: pro`);
    console.log(`📊 Status: active`);
    console.log(`📅 Valid Until: ${new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString()}`);
    console.log('='.repeat(60));
    console.log('\n🎉 User can now access Pro features!');
    console.log(`\n🔗 Login with: ${user.email}\n`);

    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    await sequelize.close();
  }
  process.exit(0);
})();
