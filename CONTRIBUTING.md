# 🤝 Contributing to ErrorWise Backend

Thank you for your interest in contributing to ErrorWise! We welcome contributions from the community.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Coding Standards](#coding-standards)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing](#testing)

---

## Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to support@errorwise.tech.

### Our Standards

- **Be Respectful**: Treat everyone with respect and kindness
- **Be Collaborative**: Work together constructively
- **Be Professional**: Maintain professionalism in all interactions
- **Be Inclusive**: Welcome diverse perspectives and backgrounds

---

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating bug reports, please check existing issues. When creating a bug report, include:

- **Clear title and description**
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Screenshots** (if applicable)
- **Environment details** (Node version, OS, etc.)

**Bug Report Template**:
```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment:**
 - OS: [e.g. Windows 11]
 - Node Version: [e.g. 16.14.0]
 - Database: [e.g. PostgreSQL 14]
```

### 💡 Suggesting Features

Feature requests are welcome! Please provide:

- **Clear use case**
- **Benefits to users**
- **Possible implementation approach**
- **Alternative solutions considered**

### 📝 Documentation

Documentation improvements are always appreciated:

- Fix typos or unclear sections
- Add examples and use cases
- Improve API documentation
- Create tutorials or guides

### 💻 Code Contributions

1. **Check existing issues** or create a new one
2. **Comment on the issue** to indicate you're working on it
3. **Fork the repository**
4. **Create a branch** from `main`
5. **Make your changes**
6. **Submit a pull request**

---

## Development Setup

### Prerequisites

- Node.js >= 16.x
- PostgreSQL >= 13.x
- Redis >= 6.x
- Git

### Setup Steps

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/errorwise-backend.git
   cd errorwise-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your local configuration
   ```

4. **Set up the database**
   ```bash
   createdb errorwise_dev
   npm run migrate
   ```

5. **Start Redis**
   ```bash
   redis-server
   ```

6. **Run the development server**
   ```bash
   npm run dev
   ```

7. **Run tests**
   ```bash
   npm test
   ```

---

## Coding Standards

### JavaScript Style Guide

We follow the [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript) with some modifications.

**Key Points**:

- Use `const` for constants, `let` for variables (never `var`)
- Use semicolons
- 2 spaces for indentation
- Single quotes for strings
- Use async/await over promises
- Add JSDoc comments for functions

**Example**:
```javascript
/**
 * Analyze an error using AI
 * @param {string} errorMessage - The error message to analyze
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Analysis result
 */
async function analyzeError(errorMessage, options = {}) {
  try {
    // Implementation
    return result;
  } catch (error) {
    logger.error('Error analyzing:', error);
    throw error;
  }
}
```

### File Structure

- Place routes in `src/routes/`
- Place controllers in `src/controllers/`
- Place models in `src/models/`
- Place utilities in `src/utils/`
- Place middleware in `src/middleware/`

### Naming Conventions

- **Files**: camelCase (e.g., `userController.js`)
- **Classes**: PascalCase (e.g., `UserService`)
- **Functions**: camelCase (e.g., `getUserProfile`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRIES`)
- **Private functions**: prefix with `_` (e.g., `_validateInput`)

### Error Handling

Always use try-catch blocks and proper error responses:

```javascript
app.post('/api/users', async (req, res) => {
  try {
    const user = await createUser(req.body);
    res.status(201).json({ user });
  } catch (error) {
    logger.error('Failed to create user:', error);
    res.status(500).json({ 
      error: 'Failed to create user',
      message: error.message 
    });
  }
});
```

---

## Commit Guidelines

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples**:
```bash
feat(auth): add GitHub OAuth support

Implemented GitHub OAuth authentication flow with proper
token handling and user creation.

Closes #123

---

fix(api): resolve rate limiting issue

Fixed race condition in Redis-based rate limiter that
caused false positives.

---

docs(readme): update installation instructions

Added more detailed steps for Windows users and
troubleshooting section.
```

### Commit Best Practices

- Keep commits atomic (one logical change per commit)
- Write clear, descriptive messages
- Reference issues when applicable
- Use present tense ("add feature" not "added feature")

---

## Pull Request Process

### Before Submitting

- [ ] Code follows style guidelines
- [ ] All tests pass (`npm test`)
- [ ] Added tests for new features
- [ ] Updated documentation
- [ ] No console.log statements (use logger)
- [ ] Resolved all merge conflicts
- [ ] Branch is up-to-date with main

### PR Title Format

```
[Type] Brief description
```

Examples:
- `[Feature] Add email verification`
- `[Fix] Resolve authentication bug`
- `[Docs] Update API documentation`

### PR Description Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues
Closes #123

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing completed

## Screenshots (if applicable)
[Add screenshots]

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
- [ ] Tests pass locally
```

### Review Process

1. **Automated checks** run on your PR
2. **Code review** by maintainers
3. **Request for changes** (if needed)
4. **Approval and merge** by maintainers

### After Merge

- Delete your branch
- Pull latest changes to your fork
- Celebrate! 🎉

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/tests/auth.test.js

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Writing Tests

Use Jest for testing:

```javascript
const request = require('supertest');
const app = require('../server');

describe('Authentication API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Test123!',
          name: 'Test User'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('user');
      expect(response.body).toHaveProperty('accessToken');
    });

    it('should reject duplicate email', async () => {
      // First registration
      await request(app).post('/api/auth/register').send({...});

      // Duplicate attempt
      const response = await request(app)
        .post('/api/auth/register')
        .send({...});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already exists');
    });
  });
});
```

### Test Coverage Goals

- **Minimum**: 70% overall coverage
- **Target**: 80%+ coverage
- **Critical paths**: 90%+ coverage (auth, payments)

---

## Project Structure

```
errorwise-backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Express middleware
│   ├── models/          # Database models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   └── utils/           # Utility functions
├── tests/               # Test files
├── docs/                # Documentation
├── migrations/          # Database migrations
└── server.js            # Entry point
```

---

## Areas Needing Contribution

### High Priority

- [ ] GraphQL API implementation
- [ ] WebSocket support for real-time updates
- [ ] Advanced analytics dashboard
- [ ] Mobile app API endpoints
- [ ] Performance optimizations

### Medium Priority

- [ ] Additional AI model integrations
- [ ] Multi-language documentation
- [ ] Extended test coverage
- [ ] Docker optimization
- [ ] CI/CD pipeline improvements

### Good First Issues

Look for issues labeled `good first issue` or `help wanted` in the issue tracker.

---

## Communication

### Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and discussions
- **Email**: support@errorwise.tech

### Response Times

- **Bug reports**: Within 48 hours
- **Feature requests**: Within 1 week
- **Pull requests**: Within 3-5 days

---

## Recognition

Contributors will be:

- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Given credit in documentation

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## Questions?

Don't hesitate to ask questions:

- Open a GitHub Discussion
- Email us at support@errorwise.tech
- Check existing documentation

---

**Thank you for contributing to ErrorWise! 🚀**

Every contribution, no matter how small, is valuable and appreciated.
