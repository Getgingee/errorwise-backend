/**
 * Metrics Controller (D2, D3)
 * 
 * Internal metrics dashboard and month-1 success criteria endpoints.
 * Admin-only access for business analytics.
 * 
 * @ticket D2 – Create internal metrics view (can be very simple)
 * @ticket D3 – Implement script or view for month-1 decision metrics
 * @epic EPIC D — Analytics & Success Metrics (Month-1 Evaluation)
 */

const User = require('../models/User');
const Subscription = require('../models/Subscription');
const eventTracking = require('../services/eventTrackingService');
const queryLogger = require('../services/queryLogger');
const { Op } = require('sequelize');

/**
 * Get internal metrics dashboard (D2)
 * GET /api/admin/metrics/dashboard
 */
async function getDashboard(req, res) {
  try {
    // Get all metrics in parallel
    const [
      eventMetrics,
      userMetrics,
      queryMetrics
    ] = await Promise.all([
      eventTracking.getDashboardMetrics(),
      getUserMetrics(),
      queryLogger.getStatistics('week')
    ]);
    
    res.json({
      success: true,
      dashboard: {
        // D2 Key metrics
        signupsThisWeek: eventMetrics.signupsThisWeek,
        activeUsersThisWeek: eventMetrics.activeUsersThisWeek,
        totalQueriesThisWeek: eventMetrics.totalQueriesThisWeek,
        querySuccessRate: eventMetrics.querySuccessRate,
        upgradeClicks: eventMetrics.upgradeClicks,
        proUsers: userMetrics.proUsers,
        
        // Additional context
        totalUsers: userMetrics.totalUsers,
        freeUsers: userMetrics.freeUsers,
        teamUsers: userMetrics.teamUsers,
        
        // Satisfaction
        satisfactionRate: eventMetrics.satisfactionRate,
        
        // Retention
        day7Retention: eventMetrics.day7Retention,
        
        // Trends
        dailyActiveUsers: eventMetrics.dailyActiveUsers,
        
        // Query quality
        queryStats: {
          total: queryMetrics.total,
          successRate: queryMetrics.rates.success,
          failureRate: queryMetrics.rates.failure,
          avgLatency: queryMetrics.averages.latencyMs,
          avgConfidence: queryMetrics.averages.confidence
        },
        
        // Timestamps
        generatedAt: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error fetching metrics dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
}

/**
 * Get month-1 success criteria (D3)
 * GET /api/admin/metrics/month-1
 */
async function getMonth1Criteria(req, res) {
  try {
    const month1Metrics = await eventTracking.getMonth1Metrics();
    
    res.json({
      success: true,
      month1: month1Metrics
    });
    
  } catch (error) {
    console.error('Error fetching month-1 metrics:', error);
    res.status(500).json({ error: 'Failed to fetch month-1 metrics' });
  }
}

/**
 * Get user metrics breakdown
 */
async function getUserMetrics() {
  try {
    const [totalUsers, proUsers, teamUsers, freeUsers, recentSignups] = await Promise.all([
      User.count({ where: { deletedAt: null } }),
      User.count({ where: { subscriptionTier: 'pro', deletedAt: null } }),
      User.count({ where: { subscriptionTier: 'team', deletedAt: null } }),
      User.count({ where: { subscriptionTier: 'free', deletedAt: null } }),
      User.count({
        where: {
          createdAt: { [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          deletedAt: null
        }
      })
    ]);
    
    return {
      totalUsers,
      proUsers,
      teamUsers,
      freeUsers,
      recentSignups,
      paidUsers: proUsers + teamUsers
    };
  } catch (error) {
    console.error('Error getting user metrics:', error);
    return {
      totalUsers: 0,
      proUsers: 0,
      teamUsers: 0,
      freeUsers: 0,
      recentSignups: 0,
      paidUsers: 0
    };
  }
}

/**
 * Get upgrade funnel metrics
 * GET /api/admin/metrics/upgrade-funnel
 */
async function getUpgradeFunnel(req, res) {
  try {
    const { period } = req.query;
    const funnel = await eventTracking.getUpgradeFunnel(period || 'month');
    
    res.json({
      success: true,
      funnel
    });
    
  } catch (error) {
    console.error('Error fetching upgrade funnel:', error);
    res.status(500).json({ error: 'Failed to fetch upgrade funnel' });
  }
}

/**
 * Get event counts breakdown
 * GET /api/admin/metrics/events
 */
async function getEventBreakdown(req, res) {
  try {
    const { period } = req.query;
    const counts = await eventTracking.getEventCounts(period || 'week');
    
    res.json({
      success: true,
      period: period || 'week',
      events: counts,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching event breakdown:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
}

/**
 * Get retention metrics
 * GET /api/admin/metrics/retention
 */
async function getRetention(req, res) {
  try {
    const [day7, dailyActive] = await Promise.all([
      eventTracking.getDay7Retention(),
      eventTracking.getDailyActiveUsers(14)
    ]);
    
    res.json({
      success: true,
      retention: {
        day7,
        dailyActiveUsers: dailyActive
      },
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching retention metrics:', error);
    res.status(500).json({ error: 'Failed to fetch retention' });
  }
}

/**
 * Get user activity heatmap (queries per day/hour)
 * GET /api/admin/metrics/activity-heatmap
 */
async function getActivityHeatmap(req, res) {
  try {
    const Event = require('../models/Event');
    const { days } = req.query;
    const numDays = Math.min(parseInt(days) || 7, 30);
    
    const since = new Date(Date.now() - numDays * 24 * 60 * 60 * 1000);
    
    // Get hourly activity
    const hourlyActivity = await Event.findAll({
      where: {
        event_name: eventTracking.EVENTS.QUERY_SUBMITTED,
        timestamp: { [Op.gte]: since }
      },
      attributes: [
        [Event.sequelize.fn('DATE', Event.sequelize.col('timestamp')), 'date'],
        [Event.sequelize.fn('EXTRACT', Event.sequelize.literal("HOUR FROM timestamp")), 'hour'],
        [Event.sequelize.fn('COUNT', '*'), 'count']
      ],
      group: ['date', 'hour'],
      raw: true
    });
    
    res.json({
      success: true,
      heatmap: hourlyActivity,
      period: `${numDays} days`,
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error fetching activity heatmap:', error);
    res.status(500).json({ error: 'Failed to fetch heatmap' });
  }
}

/**
 * Simple HTML dashboard page (D2 - can be very simple)
 * GET /api/admin/metrics/html
 */
async function getHtmlDashboard(req, res) {
  try {
    const [eventMetrics, userMetrics] = await Promise.all([
      eventTracking.getDashboardMetrics(),
      getUserMetrics()
    ]);
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <title>ErrorWise Metrics Dashboard</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 20px;
      margin: 0;
    }
    h1 { color: #22d3ee; margin-bottom: 30px; }
    h2 { color: #94a3b8; font-size: 14px; text-transform: uppercase; margin-top: 30px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
    }
    .card {
      background: #1e293b;
      padding: 20px;
      border-radius: 12px;
      border: 1px solid #334155;
    }
    .card h3 { color: #64748b; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase; }
    .card .value { font-size: 32px; font-weight: bold; color: #f8fafc; }
    .card .subtext { font-size: 12px; color: #64748b; margin-top: 4px; }
    .good { color: #22c55e; }
    .warning { color: #f59e0b; }
    .bad { color: #ef4444; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #334155; }
    th { color: #64748b; font-size: 12px; text-transform: uppercase; }
    .refresh { color: #64748b; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <h1>📊 ErrorWise Metrics Dashboard</h1>
  
  <h2>This Week</h2>
  <div class="grid">
    <div class="card">
      <h3>New Signups</h3>
      <div class="value">${eventMetrics.signupsThisWeek}</div>
    </div>
    <div class="card">
      <h3>Active Users</h3>
      <div class="value">${eventMetrics.activeUsersThisWeek}</div>
      <div class="subtext">Used ≥1 query</div>
    </div>
    <div class="card">
      <h3>Total Queries</h3>
      <div class="value">${eventMetrics.totalQueriesThisWeek}</div>
    </div>
    <div class="card">
      <h3>Success Rate</h3>
      <div class="value ${parseFloat(eventMetrics.querySuccessRate) >= 95 ? 'good' : 'warning'}">${eventMetrics.querySuccessRate}</div>
    </div>
  </div>
  
  <h2>Users</h2>
  <div class="grid">
    <div class="card">
      <h3>Total Users</h3>
      <div class="value">${userMetrics.totalUsers}</div>
    </div>
    <div class="card">
      <h3>Pro Users</h3>
      <div class="value good">${userMetrics.proUsers}</div>
    </div>
    <div class="card">
      <h3>Team Users</h3>
      <div class="value good">${userMetrics.teamUsers}</div>
    </div>
    <div class="card">
      <h3>Free Users</h3>
      <div class="value">${userMetrics.freeUsers}</div>
    </div>
  </div>
  
  <h2>Upgrade Funnel</h2>
  <div class="grid">
    <div class="card">
      <h3>Hit Limit</h3>
      <div class="value">${eventMetrics.usersHitLimit}</div>
      <div class="subtext">Users who reached 50 queries</div>
    </div>
    <div class="card">
      <h3>Upgrade Clicks</h3>
      <div class="value">${eventMetrics.upgradeClicks}</div>
    </div>
    <div class="card">
      <h3>Completed</h3>
      <div class="value good">${eventMetrics.upgradeCompleted}</div>
    </div>
  </div>
  
  <h2>Retention</h2>
  <div class="grid">
    <div class="card">
      <h3>Day-7 Retention</h3>
      <div class="value ${parseFloat(eventMetrics.day7Retention?.retentionRate) >= 30 ? 'good' : parseFloat(eventMetrics.day7Retention?.retentionRate) >= 15 ? 'warning' : 'bad'}">${eventMetrics.day7Retention?.retentionRate || 'N/A'}</div>
      <div class="subtext">Cohort: ${eventMetrics.day7Retention?.cohortSize || 0} users</div>
    </div>
    <div class="card">
      <h3>Satisfaction</h3>
      <div class="value">${eventMetrics.satisfactionRate}</div>
      <div class="subtext">Thumbs up rate</div>
    </div>
  </div>
  
  <h2>Daily Active Users (Last 7 Days)</h2>
  <table>
    <tr><th>Date</th><th>Active Users</th></tr>
    ${eventMetrics.dailyActiveUsers.map(d => `<tr><td>${d.date}</td><td>${d.activeUsers}</td></tr>`).join('')}
  </table>
  
  <p class="refresh">Generated: ${new Date().toLocaleString()} | <a href="?" style="color: #22d3ee;">Refresh</a></p>
</body>
</html>
    `;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
    
  } catch (error) {
    console.error('Error generating HTML dashboard:', error);
    res.status(500).send('<h1>Error loading dashboard</h1>');
  }
}

module.exports = {
  getDashboard,
  getMonth1Criteria,
  getUserMetrics,
  getUpgradeFunnel,
  getEventBreakdown,
  getRetention,
  getActivityHeatmap,
  getHtmlDashboard
};
