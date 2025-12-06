/**
 * Cluster Manager for ErrorWise Backend
 * 
 * This enables multi-core CPU usage and prevents crashes from affecting all users.
 * Benefits:
 * - Uses all CPU cores (4 cores = 4 processes)
 * - If one worker crashes, others keep running
 * - Better performance for concurrent users
 * - Automatic worker restart on failure
 */

const cluster = require('cluster');
const os = require('os');

// Detect available memory and CPU cores
const totalMemoryGB = os.totalmem() / (1024 ** 3);
const availableCPUs = os.cpus().length;

// Calculate optimal worker count based on available resources
let numCPUs;

if (totalMemoryGB < 1) {
  // Less than 1GB RAM - run single process (Railway free tier: 512MB)
  numCPUs = 1;
} else if (totalMemoryGB < 2) {
  // 1-2GB RAM - run 2 workers max
  numCPUs = Math.min(2, availableCPUs);
} else if (totalMemoryGB < 4) {
  // 2-4GB RAM - run half of CPU cores (max 4)
  numCPUs = Math.min(Math.ceil(availableCPUs / 2), 4);
} else {
  // 4GB+ RAM - use all cores (up to 8 for efficiency)
  numCPUs = Math.min(availableCPUs, 8);
}

// Only use clustering in production (Railway)
const USE_CLUSTERING = process.env.NODE_ENV === 'production' && process.env.ENABLE_CLUSTERING !== 'false';

if (USE_CLUSTERING && cluster.isMaster) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 ErrorWise Cluster Manager Started`);
  console.log(`${'='.repeat(60)}`);
  console.log(`📊 Total Memory: ${totalMemoryGB.toFixed(2)}GB`);
  console.log(`💻 CPU Cores Available: ${availableCPUs}`);
  console.log(`👷 Workers to Spawn: ${numCPUs} (optimized for available memory)`);
  
  if (totalMemoryGB < 1) {
    console.log(`⚠️  LOW MEMORY MODE: Running single process to prevent OOM kills`);
  } else if (totalMemoryGB < 2) {
    console.log(`💡 LIMITED MEMORY: Running ${numCPUs} workers for balance`);
  } else {
    console.log(`🚀 HIGH MEMORY: Running ${numCPUs} workers for max performance`);
  }
  
  console.log(`${'='.repeat(60)}\n`);

  // ============================================================================
  // RUN MIGRATIONS IN MASTER PROCESS BEFORE FORKING WORKERS
  // This prevents race conditions where multiple workers try to create tables
  // ============================================================================
  const runMasterMigrations = async () => {
    console.log('📦 Master process running database migrations...');
    
    try {
      const sequelize = require('./src/config/database');
      
      // Test connection
      await sequelize.authenticate();
      console.log('✅ Master: Database connected');
      
      // Run all migrations in master first (set environment variable)
      process.env.SKIP_WORKER_MIGRATIONS = 'true';
      
      // Load models to ensure they're registered
      require('./src/models/User');
      require('./src/models/Subscription');
      require('./src/models/Team');
      require('./src/models/TeamMember');
      require('./src/models/ErrorQuery');
      require('./src/models/Event');
      require('./src/models/VideoMeeting');
      
      // Run sync first to create basic tables
      await sequelize.sync({ alter: false });
      console.log('✅ Master: Database sync complete');
      
      // Close master connection - workers will open their own
      await sequelize.close();
      console.log('✅ Master: Database connection closed, forking workers...\n');
      
    } catch (migrationError) {
      console.error('❌ Master: Database migration failed:', migrationError.message);
      // Continue anyway - workers will try to handle it
    }
  };
  
  // Run migrations then fork workers
  runMasterMigrations().then(() => {
    // Fork workers (one per CPU core)
    for (let i = 0; i < numCPUs; i++) {
      const worker = cluster.fork({ SKIP_WORKER_MIGRATIONS: 'false' });
      console.log(`✅ Worker ${worker.process.pid} started`);
    }
  }).catch((err) => {
    console.error('❌ Master startup failed:', err);
    process.exit(1);
  });

  // Handle worker crashes
  cluster.on('exit', (worker, code, signal) => {
    console.error(`\n❌ Worker ${worker.process.pid} died (${signal || code})`);
    console.log(`🔄 Spawning replacement worker...`);
    
    const newWorker = cluster.fork();
    console.log(`✅ Replacement worker ${newWorker.process.pid} started\n`);
  });

  // Handle messages from workers
  cluster.on('message', (worker, message) => {
    if (message.type === 'error') {
      console.error(`⚠️  Worker ${worker.process.pid} error:`, message.error);
    }
  });

  // Graceful shutdown
  const gracefulShutdown = (signal) => {
    console.log(`\n⚠️  ${signal} received. Shutting down cluster...`);
    
    // Disconnect all workers
    for (const id in cluster.workers) {
      cluster.workers[id].disconnect();
    }

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

} else {
  // Worker process - run the actual server
  if (USE_CLUSTERING) {
    console.log(`👷 Worker ${process.pid} is running the server`);
  } else {
    console.log(`📌 Running in single-process mode (development)`);
  }
  
  require('./server.js');
}
