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

// Number of CPU cores available
const numCPUs = os.cpus().length;

// Only use clustering in production (Railway)
const USE_CLUSTERING = process.env.NODE_ENV === 'production' && process.env.ENABLE_CLUSTERING !== 'false';

if (USE_CLUSTERING && cluster.isMaster) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 ErrorWise Cluster Manager Started`);
  console.log(`${'='.repeat(60)}`);
  console.log(`💻 CPU Cores: ${numCPUs}`);
  console.log(`👷 Spawning ${numCPUs} worker processes...`);
  console.log(`${'='.repeat(60)}\n`);

  // Fork workers (one per CPU core)
  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    console.log(`✅ Worker ${worker.process.pid} started`);
  }

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
