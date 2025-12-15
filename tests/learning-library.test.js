/**
 * User Learning Library - API Endpoint Tests
 * 
 * Test all user-specific learning library endpoints
 * Run with: npm test -- --testPathPattern="learning-library"
 */

const request = require('supertest');
const app = require('../app'); // Your Express app
const UserLearningLibrary = require('../models/UserLearningLibrary');
const User = require('../models/User');

describe('User Learning Library Endpoints', () => {
  let testUser;
  let authToken;
  let learningEntryId;

  // Setup: Create test user and get auth token
  beforeAll(async () => {
    // Create test user
    testUser = await User.create({
      email: 'learning-test@example.com',
      password: 'TestPassword123!',
      firstName: 'Learning',
      lastName: 'Tester',
      subscriptionTier: 'pro'
    });

    // Login and get token
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'learning-test@example.com',
        password: 'TestPassword123!'
      });

    authToken = loginRes.body.token;
  });

  // Cleanup: Delete test user and entries
  afterAll(async () => {
    await UserLearningLibrary.destroy({ where: { userId: testUser.id } });
    await testUser.destroy();
  });

  // ============================================================================
  // TEST: Add to Learning Library
  // ============================================================================
  describe('POST /api/user/learning-library', () => {
    it('should add a new entry to user learning library', async () => {
      const response = await request(app)
        .post('/api/user/learning-library')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          errorMessage: 'Cannot read property "map" of undefined',
          title: 'React - undefined .map() Error',
          explanation: 'This happens when state or props array hasn\'t loaded yet',
          solution: 'Use optional chaining (?.) or check if array exists before calling map()',
          category: 'programming',
          language: 'javascript',
          framework: 'react',
          difficulty: 'intermediate',
          timeToSolve: 45,
          source: 'stackoverflow',
          sourceUrl: 'https://stackoverflow.com/questions/12345',
          tags: ['javascript', 'react', 'hooks', 'state'],
          codeExample: '{items?.map(item => <div>{item.name}</div>)}',
          commonCauses: ['state not initialized', 'async data not loaded'],
          preventionTips: ['Initialize state with empty array', 'use loading state'],
          notes: 'Remember to check for undefined before using array methods'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('React - undefined .map() Error');
      expect(response.body.data.userId).toBe(testUser.id);
      
      learningEntryId = response.body.data.id;
    });

    it('should require error message and solution', async () => {
      const response = await request(app)
        .post('/api/user/learning-library')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Incomplete Entry'
          // Missing errorMessage and solution
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/user/learning-library')
        .send({
          errorMessage: 'Test error',
          solution: 'Test solution'
        });

      expect(response.status).toBe(401);
    });
  });

  // ============================================================================
  // TEST: Get User Learning Library
  // ============================================================================
  describe('GET /api/user/learning-library', () => {
    it('should get user learning library with pagination', async () => {
      const response = await request(app)
        .get('/api/user/learning-library')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toBeDefined();
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(1);
    });

    it('should filter by category', async () => {
      const response = await request(app)
        .get('/api/user/learning-library?category=programming')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.every(entry => entry.category === 'programming')).toBe(true);
    });

    it('should search by title', async () => {
      const response = await request(app)
        .get('/api/user/learning-library?search=undefined')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should support different sort orders', async () => {
      // Sort by recent
      const recentRes = await request(app)
        .get('/api/user/learning-library?sort=recent')
        .set('Authorization', `Bearer ${authToken}`);

      expect(recentRes.status).toBe(200);

      // Sort by popular
      const popularRes = await request(app)
        .get('/api/user/learning-library?sort=popular')
        .set('Authorization', `Bearer ${authToken}`);

      expect(popularRes.status).toBe(200);

      // Sort by top-rated
      const ratedRes = await request(app)
        .get('/api/user/learning-library?sort=top-rated')
        .set('Authorization', `Bearer ${authToken}`);

      expect(ratedRes.status).toBe(200);
    });
  });

  // ============================================================================
  // TEST: Get Single Learning Entry
  // ============================================================================
  describe('GET /api/user/learning-library/:id', () => {
    it('should get single learning entry', async () => {
      const response = await request(app)
        .get(`/api/user/learning-library/${learningEntryId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(learningEntryId);
      expect(response.body.data.title).toBe('React - undefined .map() Error');
    });

    it('should increment reference count when viewed', async () => {
      const before = await UserLearningLibrary.findByPk(learningEntryId);
      const beforeCount = before.referenceCount;

      await request(app)
        .get(`/api/user/learning-library/${learningEntryId}`)
        .set('Authorization', `Bearer ${authToken}`);

      const after = await UserLearningLibrary.findByPk(learningEntryId);
      expect(after.referenceCount).toBe(beforeCount + 1);
    });

    it('should return 404 for non-existent entry', async () => {
      const response = await request(app)
        .get('/api/user/learning-library/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should not allow access to other user entries', async () => {
      // Create another user
      const otherUser = await User.create({
        email: 'other-user@example.com',
        password: 'TestPassword123!',
        firstName: 'Other',
        lastName: 'User'
      });

      const otherLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'other-user@example.com',
          password: 'TestPassword123!'
        });

      const otherToken = otherLogin.body.token;

      // Try to access testUser's entry
      const response = await request(app)
        .get(`/api/user/learning-library/${learningEntryId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(response.status).toBe(404);

      // Cleanup
      await otherUser.destroy();
    });
  });

  // ============================================================================
  // TEST: Update Learning Entry
  // ============================================================================
  describe('PUT /api/user/learning-library/:id', () => {
    it('should update learning entry', async () => {
      const response = await request(app)
        .put(`/api/user/learning-library/${learningEntryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userRating: 4,
          notes: 'Updated: This solution works better with error boundaries'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.userRating).toBe(4);
      expect(response.body.data.notes).toContain('error boundaries');
    });

    it('should not allow updating userId or other protected fields', async () => {
      const response = await request(app)
        .put(`/api/user/learning-library/${learningEntryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          userId: 'different-user-id',
          createdAt: new Date()
        });

      expect(response.status).toBe(200);
      const updated = await UserLearningLibrary.findByPk(learningEntryId);
      expect(updated.userId).toBe(testUser.id); // Should not change
    });
  });

  // ============================================================================
  // TEST: Get Learning Categories
  // ============================================================================
  describe('GET /api/user/learning-library/categories', () => {
    it('should get categories with counts', async () => {
      const response = await request(app)
        .get('/api/user/learning-library/categories')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.categories)).toBe(true);
      
      if (response.body.categories.length > 0) {
        expect(response.body.categories[0]).toHaveProperty('category');
        expect(response.body.categories[0]).toHaveProperty('count');
        expect(response.body.categories[0]).toHaveProperty('avgRating');
      }
    });
  });

  // ============================================================================
  // TEST: Get Learning Statistics
  // ============================================================================
  describe('GET /api/user/learning-library/stats', () => {
    it('should get learning statistics', async () => {
      const response = await request(app)
        .get('/api/user/learning-library/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalEntries');
      expect(response.body.data).toHaveProperty('totalReferences');
      expect(response.body.data).toHaveProperty('avgRating');
      expect(response.body.data).toHaveProperty('byCategory');
      expect(response.body.data).toHaveProperty('lastAdded');
    });
  });

  // ============================================================================
  // TEST: Delete from Learning Library
  // ============================================================================
  describe('DELETE /api/user/learning-library/:id', () => {
    it('should soft delete (archive) learning entry', async () => {
      const response = await request(app)
        .delete(`/api/user/learning-library/${learningEntryId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify entry is archived, not deleted
      const entry = await UserLearningLibrary.findByPk(learningEntryId);
      expect(entry).toBeDefined();
      expect(entry.status).toBe('archived');
    });

    it('should not list archived entries by default', async () => {
      const response = await request(app)
        .get('/api/user/learning-library')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.data.map(e => e.id);
      expect(ids).not.toContain(learningEntryId);
    });

    it('should return 404 for non-existent entry', async () => {
      const response = await request(app)
        .delete('/api/user/learning-library/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================
  describe('Integration Tests', () => {
    let entryId;

    beforeAll(async () => {
      // Create multiple entries for testing
      for (let i = 0; i < 5; i++) {
        const entry = await UserLearningLibrary.create({
          userId: testUser.id,
          title: `Test Error ${i + 1}`,
          errorMessage: `Error message ${i + 1}`,
          explanation: 'Test explanation',
          solution: 'Test solution',
          category: i % 2 === 0 ? 'programming' : 'network',
          tags: ['test', `category-${i}`]
        });
        if (i === 0) entryId = entry.id;
      }
    });

    it('should retrieve entries with full search capability', async () => {
      const response = await request(app)
        .get('/api/user/learning-library?search=Error&category=programming&sort=recent&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data.every(e => e.category === 'programming')).toBe(true);
    });

    it('should track full lifecycle of an entry', async () => {
      // View entry (increments reference count)
      await request(app)
        .get(`/api/user/learning-library/${entryId}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Update rating
      await request(app)
        .put(`/api/user/learning-library/${entryId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userRating: 5, isVerified: true });

      // Get stats
      const statsRes = await request(app)
        .get('/api/user/learning-library/stats')
        .set('Authorization', `Bearer ${authToken}`);

      expect(statsRes.body.data.totalEntries).toBeGreaterThan(0);
      expect(statsRes.body.data.avgRating).toBeGreaterThan(0);
    });
  });
});
