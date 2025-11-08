const User = require('./src/models/User');

console.log('👀 Real-time User Registration Monitor');
console.log('=====================================\n');
console.log('Watching for new user registrations...');
console.log('Press Ctrl+C to stop\n');

let lastCount = 0;

const checkUsers = async () => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'email', 'username', 'isEmailVerified', 'createdAt'],
      order: [['createdAt', 'DESC']]
    });
    
    if (users.length !== lastCount) {
      console.clear();
      console.log('👀 Real-time User Registration Monitor');
      console.log('=====================================\n');
      console.log(`📊 Total Users: ${users.length}`);
      console.log(`⏰ Last Update: ${new Date().toLocaleTimeString()}\n`);
      
      if (users.length > 0) {
        console.log('📋 Registered Users:');
        users.forEach((user, index) => {
          const verified = user.isEmailVerified ? '✅' : '⏳';
          console.log(`   ${index + 1}. ${verified} ${user.email} (${user.username})`);
          console.log(`      Created: ${new Date(user.createdAt).toLocaleString()}`);
        });
      } else {
        console.log('   No users registered yet...');
      }
      
      lastCount = users.length;
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

// Check every 2 seconds
setInterval(checkUsers, 2000);
checkUsers(); // Initial check
