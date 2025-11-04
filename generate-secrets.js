// Generate secure secrets for Railway deployment
const crypto = require('crypto');

console.log('\n🔐 Secure Secrets Generator for Railway Deployment\n');
console.log('Copy these values to your Railway Variables:\n');
console.log('─'.repeat(60));

console.log('\n📝 REQUIRED SECRETS:\n');
console.log(`JWT_SECRET=${crypto.randomBytes(32).toString('hex')}`);
console.log(`JWT_REFRESH_SECRET=${crypto.randomBytes(32).toString('hex')}`);
console.log(`SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`);
console.log(`CSRF_SECRET=${crypto.randomBytes(32).toString('hex')}`);

console.log('\n─'.repeat(60));
console.log('\n✅ Copy these secrets to Railway dashboard under Variables tab');
console.log('⚠️  Save these somewhere safe - you won\'t see them again!\n');

console.log('📋 OTHER REQUIRED VARIABLES (add manually):\n');
console.log('ANTHROPIC_API_KEY=sk-ant-[your-key-here]');
console.log('SENDGRID_API_KEY=SG.[your-key-here]');
console.log('FROM_EMAIL=noreply@yourdomain.com');
console.log('FRONTEND_URL=https://your-frontend-domain.com');
console.log('CORS_ORIGIN=https://your-frontend-domain.com');
console.log('NODE_ENV=production');
console.log('\n─'.repeat(60));
console.log('\n💡 Database & Redis URLs will be auto-filled by Railway addons\n');
