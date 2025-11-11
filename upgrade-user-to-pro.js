const User = require('./src/models/User');
const Subscription = require('./src/models/Subscription');

(async () => {
  try {
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
    console.log('\n🎉 User can now access Pro features!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
  process.exit(0);
})();
