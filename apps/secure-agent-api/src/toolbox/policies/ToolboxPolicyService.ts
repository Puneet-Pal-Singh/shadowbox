import type {
  ToolboxPolicyDecision,
  ToolboxSessionRequest,
} from "../contracts/ToolboxSession";

export class ToolboxPolicyService {
  evaluate(
    request: ToolboxSessionRequest,
    allowlist: readonly string[],
  ): ToolboxPolicyDecision {
    const command = request.command.trim();
    if (!/^(?:[A-Za-z0-9._-]+|\.[/][A-Za-z0-9._-]+)$/.test(command)) {
      return { decision: "deny", reason: "Invalid command" };
    }
    if (!allowlist.includes(command)) {
      return {
        decision: "deny",
        reason: `Command not allowed: ${command}`,
      };
    }

    const args = request.args ?? [];
    for (const arg of args) {
      if (/[\0\r\n]/.test(arg)) {
        return {
          decision: "deny",
          reason: "Invalid command argument: multiline values are not allowed",
        };
      }
    }

    if (request.cwd && /[\0\r\n]/.test(request.cwd)) {
      return { decision: "deny", reason: "Invalid command cwd" };
    }

    return { decision: "allow" };
  }
}
