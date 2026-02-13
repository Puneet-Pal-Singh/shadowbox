# Security Policy

## Supported Components

Security fixes are prioritized for the active branch (`main`) and current runtime surfaces:

- `apps/brain`
- `apps/secure-agent-api`
- `packages/execution-engine`

## Reporting a Vulnerability

Please report vulnerabilities privately by opening a GitHub Security Advisory draft for this repository.

Include:

- affected component and file path
- reproduction steps
- impact assessment
- suggested remediation (if available)

Do not open public issues for undisclosed vulnerabilities.

## Disclosure Process

1. Triage and acknowledgment target: within 3 business days.
2. Reproduction and severity classification.
3. Patch development and validation.
4. Coordinated disclosure after remediation is available.

## Scope Notes

- Runtime execution boundaries and command/path validation issues are treated as high-priority.
- Credential leakage, token exposure, and session boundary bypasses are high-priority.
- Denial-of-service vectors are prioritized based on exploitability and blast radius.
