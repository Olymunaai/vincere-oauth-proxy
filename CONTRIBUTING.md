# Contributing to Vincere OAuth Proxy

Thank you for considering contributing! This document outlines the process and guidelines.

## Development Setup

### Prerequisites

- Node.js 18+ (use version from `.nvmrc`)
- Azure CLI (for Key Vault access)
- Git

### Local Setup

```bash
# Clone repository
git clone https://github.com/YOUR-ORG/vincere-oauth-proxy.git
cd vincere-oauth-proxy

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your values

# Azure login (for Key Vault)
az login

# Run in dev mode
npm run dev
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm test -- --coverage
```

### Code Quality

```bash
# Lint
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Type check
npm run typecheck
```

## Making Changes

### Branch Strategy

- `main` - production, protected
- `develop` - integration branch
- `feature/*` - new features
- `fix/*` - bug fixes
- `docs/*` - documentation only

### Workflow

1. Create feature branch from `develop`:
   ```bash
   git checkout develop
   git pull origin develop
   git checkout -b feature/your-feature-name
   ```

2. Make changes, write tests, commit:
   ```bash
   git add .
   git commit -m "feat: add new feature"
   ```

3. Push and open PR to `develop`:
   ```bash
   git push origin feature/your-feature-name
   ```

4. Ensure CI passes
5. Request review
6. Merge after approval

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - new feature
- `fix:` - bug fix
- `docs:` - documentation only
- `style:` - formatting, no code change
- `refactor:` - code change that neither fixes bug nor adds feature
- `test:` - adding/updating tests
- `chore:` - maintenance tasks

Examples:
```
feat: add support for JobAdder API
fix: handle 429 rate limit correctly
docs: update README with deployment steps
test: add unit tests for validators
```

## Code Standards

### TypeScript

- Use strict TypeScript (`strict: true` in tsconfig)
- Prefer interfaces over types for object shapes
- Use explicit return types for exported functions
- No `any` types (use `unknown` if needed)

### Security

- Never log secrets or tokens
- Validate all user inputs
- Use parameterized queries (if adding DB)
- Follow OWASP guidelines

### Testing

- Write tests for new features
- Maintain >70% coverage
- Test edge cases and error paths
- Use descriptive test names

Example:
```typescript
describe('validateTenantHost', () => {
  it('should accept valid Vincere hosts', () => {
    expect(validateTenantHost('test.vincere.io').valid).toBe(true);
  });

  it('should reject SSRF attempts', () => {
    expect(validateTenantHost('localhost').valid).toBe(false);
  });
});
```

### Documentation

- Update README for user-facing changes
- Update code comments for complex logic
- Add JSDoc for exported functions
- Update SECURITY.md for security-related changes

## Pull Request Process

### Before Opening PR

- [ ] Code builds successfully (`npm run build`)
- [ ] All tests pass (`npm test`)
- [ ] Linting passes (`npm run lint`)
- [ ] Code is formatted (`npm run format`)
- [ ] New code has tests
- [ ] Documentation updated

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Checklist
- [ ] Tests pass
- [ ] Linting passes
- [ ] Documentation updated
- [ ] No secrets in code
```

### Review Process

1. CI must pass
2. At least one approval required
3. Reviewer checks:
   - Code quality
   - Security implications
   - Test coverage
   - Documentation
4. Merge to `develop`
5. Deploy to dev environment (automatic)

## Release Process

1. Merge `develop` to `main`
2. GitHub Actions automatically deploys to production
3. Verify deployment
4. Tag release: `git tag v1.2.3`
5. Update CHANGELOG

## Reporting Issues

### Bug Reports

Include:
- Description of bug
- Steps to reproduce
- Expected vs actual behavior
- Environment (Azure region, Node version, etc.)
- Logs/screenshots if applicable

### Feature Requests

Include:
- Use case
- Proposed solution
- Alternatives considered
- Impact on existing functionality

### Security Vulnerabilities

**Do not open public issues.**

Email: security@YOUR-ORG.com

## Questions?

- Open a discussion on GitHub
- Email: dev@YOUR-ORG.com

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

