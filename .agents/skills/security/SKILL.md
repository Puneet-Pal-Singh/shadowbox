---
name: security
description: Perform security audits, vulnerability scanning, and security-focused code reviews. Use when the user asks about security, mentions vulnerabilities, requests security audits, or when reviewing code that handles sensitive data, authentication, or external input.
license: MIT
metadata:
  author: Shadowbox Team
  version: "1.0"
---

# Security Skill

Perform comprehensive security audits and implement security best practices.

## When to Use This Skill

Use this skill when:

- User requests a security audit or review
- Reviewing code that handles authentication/authorization
- Working with user input or external data
- Code interacts with filesystem, network, or databases
- Implementing features involving secrets or credentials
- You spot potential security issues during development

## Security Mindset

**Default to defensive programming**:

- Never trust user input
- Never trust external data
- Always validate and sanitize
- Fail securely (deny by default)
- Log security events

## Critical Security Checks

### 1. Input Validation

**Red flags to look for**:

```typescript
// ❌ DANGEROUS - Never do this
eval(userInput);
new Function(userInput)();
document.write(userInput);
innerHTML = userInput;

// ❌ DANGEROUS - SQL injection risk
const query = `SELECT * FROM users WHERE id = ${userId}`;

// ❌ DANGEROUS - Command injection
exec(`ls ${userDirectory}`);

// ❌ DANGEROUS - Path traversal
readFile(`./uploads/${filename}`);
```

**Safe patterns**:

```typescript
// ✅ Use parameterized queries
const query = "SELECT * FROM users WHERE id = ?";
await db.query(query, [userId]);

// ✅ Validate and sanitize paths
import path from "path";
const safePath = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, "");
const fullPath = path.join(UPLOAD_DIR, safePath);

// ✅ Whitelist allowed operations
const ALLOWED_COMMANDS = ["ls", "cat", "grep"];
if (!ALLOWED_COMMANDS.includes(command)) {
  throw new Error("Command not allowed");
}
```

### 2. Path Traversal Prevention

Always validate file paths:

```typescript
import path from "path";

function validatePath(userPath: string, baseDir: string): string {
  // Resolve the full path
  const fullPath = path.resolve(baseDir, userPath);

  // Ensure it's within the base directory
  if (!fullPath.startsWith(path.resolve(baseDir))) {
    throw new Error("Path traversal attempt detected");
  }

  return fullPath;
}
```

### 3. Secrets Management

**Never commit secrets**:

```bash
# Check for secrets before committing
grep -r "api_key\|password\|secret\|token" --include="*.ts" --include="*.js" .

# Check .env files are in .gitignore
cat .gitignore | grep -E "^\.env"
```

**Safe secret handling**:

```typescript
// ✅ Use environment variables
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  throw new Error("API_KEY not configured");
}

// ✅ Validate secret format
if (!/^[a-zA-Z0-9_-]{32,}$/.test(API_KEY)) {
  throw new Error("Invalid API key format");
}

// ❌ Never hardcode secrets
const API_KEY = "sk_live_abc123"; // WRONG!
```

### 4. Authentication & Authorization

```typescript
// ✅ Always verify authentication
async function protectedEndpoint(req: Request) {
  const user = await authenticate(req);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ✅ Check authorization
  if (!user.hasPermission("resource:action")) {
    return new Response("Forbidden", { status: 403 });
  }

  // Proceed with authorized action
}

// ✅ Use secure session handling
import { createCookieSessionStorage } from "@remix-run/node";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET!],
    secure: process.env.NODE_ENV === "production",
  },
});
```

### 5. Dependency Security

```bash
# Audit dependencies
npm audit

# Fix automatically
npm audit fix

# Check for high/critical vulnerabilities
npm audit --audit-level=high

# Use Snyk for deeper scanning
npx snyk test

# Check for outdated packages
npm outdated
```

## Security Audit Workflow

### Step 1: Identify Attack Surface

```typescript
// Review all entry points:
// - API endpoints
// - File uploads
// - User input fields
// - External API calls
// - Database queries
// - System commands
```

### Step 2: Check for Common Vulnerabilities

**OWASP Top 10 checklist**:

1. [ ] Broken Access Control - Proper auth on all endpoints
2. [ ] Cryptographic Failures - HTTPS, secure hashing
3. [ ] Injection - SQL, NoSQL, Command, XSS prevention
4. [ ] Insecure Design - Security by design principles
5. [ ] Security Misconfiguration - Secure defaults
6. [ ] Vulnerable Components - Dependency audits
7. [ ] Authentication Failures - Secure auth patterns
8. [ ] Software Integrity Failures - Supply chain security
9. [ ] Logging Failures - Security event logging
10. [ ] Server-Side Request Forgery - SSRF prevention

### Step 3: Review Code Patterns

**Authentication checks**:

```typescript
// Every protected endpoint must have:
async function handler(req: Request) {
  // 1. Authentication
  const user = await authenticate(req);
  if (!user) return unauthorized();

  // 2. Authorization
  if (!canAccess(user, resource)) return forbidden();

  // 3. Input validation
  const input = validateInput(req.body, schema);
  if (!input.success) return badRequest(input.errors);

  // 4. Business logic
  const result = await process(input.data);

  // 5. Safe output
  return json(sanitizeOutput(result));
}
```

**File operations**:

```typescript
// Before any file operation:
// 1. Validate path (prevent traversal)
// 2. Check permissions
// 3. Validate file type
// 4. Scan for malware (if uploading)
// 5. Use least privilege
```

### Step 4: Test Security Controls

```typescript
// Write tests for security scenarios:
describe("Security", () => {
  it("should reject unauthenticated requests", async () => {
    const res = await request("/api/protected");
    expect(res.status).toBe(401);
  });

  it("should reject path traversal attempts", async () => {
    const res = await request("/api/files/../../../etc/passwd");
    expect(res.status).toBe(400);
  });

  it("should sanitize user input", async () => {
    const input = '<script>alert("xss")</script>';
    const res = await request("/api/echo").send({ input });
    expect(res.body.output).not.toContain("<script>");
  });
});
```

## Code Review Security Checklist

When reviewing code, check for:

### Input Handling

- [ ] All user input is validated
- [ ] Input length limits enforced
- [ ] Type checking with Zod or similar
- [ ] No dynamic code execution (eval, new Function)

### Data Protection

- [ ] Sensitive data encrypted at rest
- [ ] HTTPS for all communications
- [ ] Secrets not logged or exposed
- [ ] PII handled according to regulations

### Access Control

- [ ] Authentication on all endpoints
- [ ] Authorization checks
- [ ] Principle of least privilege
- [ ] No hardcoded credentials

### Error Handling

- [ ] Generic error messages to users
- [ ] Detailed logging internally
- [ ] No stack traces in production
- [ ] Fail secure (deny by default)

### Dependencies

- [ ] No known vulnerabilities (npm audit)
- [ ] Dependencies pinned/locked
- [ ] Minimal dependency tree
- [ ] Reputable sources only

## Security Anti-Patterns

**Never allow**:

```typescript
// ❌ eval() or equivalent
eval(userCode);
new Function(userCode)();

// ❌ Inline SQL
`SELECT * FROM users WHERE id = ${id}`;

// ❌ Unsafe deserialization
JSON.parse(untrustedData); // Without validation

// ❌ Direct file paths
fs.readFile(userProvidedPath);

// ❌ Weak cryptography
md5(password);
sha1(token);

// ❌ Information disclosure
res.status(500).send(err.stack);
res.json({ error: err.message, query: sqlQuery });

// ❌ CORS misconfiguration
app.use(cors({ origin: "*" }));

// ❌ Missing rate limiting
// No rate limit on auth endpoints

// ❌ Verbose logging
console.log("User login:", username, password);
```

## Reporting Security Issues

If you find a security vulnerability:

1. **Do not create a public issue**
2. Document the vulnerability privately
3. Notify the security team
4. Follow responsible disclosure

## Integration with AGENTS.md

This skill implements the Security Auditor role from AGENTS.md:

- Defensive mindset
- Rejects plans using eval() or unvalidated input
- Focuses on "Airlock" boundaries
- Security Auditor tools: `read_file`, `run_command` (snyk/audit), `list_files`

Reference AGENTS.md Section 8 (Coding Standards) and Section 10 (Runtime Constraints) for additional security requirements.
