// src/models/associations.js
const User = require('./User');
const ErrorQuery = require('./ErrorQuery');
const Subscription = require('./Subscription');
const Team = require('./Team');
const TeamMember = require('./TeamMember');
const ErrorLibrary = require('./ErrorLibrary');
const VideoMeeting = require('./VideoMeeting');
// Coupon system disabled - using Dodo Payments built-in coupons
// const Coupon = require('./Coupon');
// const CouponRedemption = require('./CouponRedemption');
// const SharedError = require('./SharedError');
// const SubscriptionPlan = require('./SubscriptionPlan');
// const Tenant = require('./Tenant');
// const ErrorHistory = require('./ErrorHistory');
// const TenantSettings = require('./TenantSettings');
// const UsageLog = require('./UsageLog');
// const UserSettings = require('./userSettings');

// Essential associations only
User.hasMany(ErrorQuery, {
  foreignKey: 'userId',
  as: 'errorQueries'
});

User.hasOne(Subscription, {
  foreignKey: 'userId',
  as: 'Subscription'
});

// ErrorQuery associations
ErrorQuery.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});
// Subscription associations
Subscription.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Team associations
Team.belongsTo(User, {
  foreignKey: 'owner_id',
  as: 'owner'
});

Team.hasMany(TeamMember, {
  foreignKey: 'team_id',
  as: 'members'
});

// TeamMember associations
TeamMember.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user'
});

TeamMember.belongsTo(Team, {
  foreignKey: 'team_id',
  as: 'team'
});

// User team associations
User.hasMany(Team, {
  foreignKey: 'owner_id',
  as: 'ownedTeams'
});

User.hasMany(TeamMember, {
  foreignKey: 'user_id',
  as: 'teamMemberships'
});

// ErrorLibrary associations (user templates)
ErrorLibrary.belongsTo(User, {
  foreignKey: 'userId',
  as: 'creator'
});

User.hasMany(ErrorLibrary, {
  foreignKey: 'userId',
  as: 'savedTemplates'
});

// Coupon associations - disabled, using Dodo Payments built-in coupons
// Coupon.hasMany(CouponRedemption, {
//   foreignKey: 'couponId',
//   as: 'redemptions'
// });

// CouponRedemption.belongsTo(Coupon, {
//   foreignKey: 'couponId',
//   as: 'Coupon'
// });

// CouponRedemption.belongsTo(User, {
//   foreignKey: 'userId',
//   as: 'user'
// });

// CouponRedemption.belongsTo(Subscription, {
//   foreignKey: 'subscriptionId',
//   as: 'subscription'
// });

// User.hasMany(CouponRedemption, {
//   foreignKey: 'userId',
//   as: 'couponRedemptions'
// });

// VideoMeeting associations
VideoMeeting.belongsTo(Team, {
  foreignKey: 'team_id',
  as: 'team'
});

VideoMeeting.belongsTo(User, {
  foreignKey: 'host_id',
  as: 'host'
});

Team.hasMany(VideoMeeting, {
  foreignKey: 'team_id',
  as: 'meetings'
});

User.hasMany(VideoMeeting, {
  foreignKey: 'host_id',
  as: 'hostedMeetings'
});

module.exports = {
  User,
  ErrorQuery,
  Subscription,
  Team,
  TeamMember,
  ErrorLibrary,
  VideoMeeting
  // Coupon,
  // CouponRedemption
};