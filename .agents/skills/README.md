# Shadowbox Agent Skills

This directory contains [Agent Skills](https://agentskills.io/) that extend agent capabilities with specialized knowledge and workflows.

## Available Skills

| Skill                           | Description                                               |
| ------------------------------- | --------------------------------------------------------- |
| [git-workflow](./git-workflow/) | Safe git operations: branching, committing, status checks |
| [security](./security/)         | Security audits, vulnerability scanning, code review      |
| [pr-workflow](./pr-workflow/)   | Create, review, and merge Pull Requests                   |

## Skill Format

Each skill follows the [Agent Skills specification](https://agentskills.io/specification):

```
skill-name/
└── SKILL.md          # Required: YAML frontmatter + instructions
```

## How Skills Work

Skills use **progressive disclosure**:

1. **Discovery**: Agent loads skill name/description at startup
2. **Activation**: Full SKILL.md loaded when task matches
3. **Execution**: Agent follows instructions, loads references as needed

## Creating New Skills

Template for new skill:

```markdown
---
name: skill-name
description: What this skill does and when to use it
license: MIT
metadata:
  author: Your Name
  version: "1.0"
---

# Skill Name

## When to Use This Skill

Use when...

## Instructions

Step-by-step guidance...

## Examples

Example usage...

## Safety Rules

Important constraints...
```

## Integration

These skills integrate with [AGENTS.md](../../AGENTS.md):

- `git-workflow` implements Section 9 (Git Protocol) and Section 12 (Multi-Agent Safety)
- `security` implements the Security Auditor role
- `pr-workflow` implements the DevOps/Git Operator role

## References

- [Agent Skills Website](https://agentskills.io/)
- [Specification](https://agentskills.io/specification)
- [Example Skills](https://github.com/anthropics/skills)
