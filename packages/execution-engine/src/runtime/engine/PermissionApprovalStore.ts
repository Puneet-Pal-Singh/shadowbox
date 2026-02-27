import type { RuntimeDurableObjectState } from "../types.js";

interface ApprovalState {
  crossRepo: Record<string, string>;
  destructiveExpiresAt?: string;
  updatedAt: string;
}

const APPROVAL_KEY_PREFIX = "permission:approvals:";

export class PermissionApprovalStore {
  constructor(
    private ctx: RuntimeDurableObjectState,
    private runId: string,
  ) {}

  async grantCrossRepo(repoRef: string, ttlMs: number): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.loadState();
      const now = Date.now();
      const nextState = this.withPrunedApprovals(state, now);
      nextState.crossRepo[repoRef] = new Date(now + ttlMs).toISOString();
      nextState.updatedAt = new Date(now).toISOString();
      await this.ctx.storage.put(this.key(), nextState);
    });
  }

  async hasCrossRepo(repoRef: string): Promise<boolean> {
    return await this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.loadState();
      const now = Date.now();
      const nextState = this.withPrunedApprovals(state, now);
      const expiresAt = nextState.crossRepo[repoRef];
      const allowed = Boolean(expiresAt && Date.parse(expiresAt) > now);
      await this.persistIfChanged(state, nextState);
      return allowed;
    });
  }

  async grantDestructive(ttlMs: number): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.loadState();
      const now = Date.now();
      const nextState = this.withPrunedApprovals(state, now);
      nextState.destructiveExpiresAt = new Date(now + ttlMs).toISOString();
      nextState.updatedAt = new Date(now).toISOString();
      await this.ctx.storage.put(this.key(), nextState);
    });
  }

  async hasDestructive(): Promise<boolean> {
    return await this.ctx.blockConcurrencyWhile(async () => {
      const state = await this.loadState();
      const now = Date.now();
      const nextState = this.withPrunedApprovals(state, now);
      const expiresAt = nextState.destructiveExpiresAt;
      const allowed = Boolean(expiresAt && Date.parse(expiresAt) > now);
      await this.persistIfChanged(state, nextState);
      return allowed;
    });
  }

  private key(): string {
    return `${APPROVAL_KEY_PREFIX}${this.runId}`;
  }

  private async loadState(): Promise<ApprovalState> {
    const stored = await this.ctx.storage.get<ApprovalState>(this.key());
    if (stored) {
      return {
        crossRepo: { ...(stored.crossRepo ?? {}) },
        destructiveExpiresAt: stored.destructiveExpiresAt,
        updatedAt: stored.updatedAt || new Date().toISOString(),
      };
    }
    return {
      crossRepo: {},
      updatedAt: new Date().toISOString(),
    };
  }

  private withPrunedApprovals(
    state: ApprovalState,
    nowMs: number,
  ): ApprovalState {
    const nextState: ApprovalState = {
      crossRepo: {},
      updatedAt: state.updatedAt,
      destructiveExpiresAt: state.destructiveExpiresAt,
    };

    for (const [repoRef, expiresAt] of Object.entries(state.crossRepo)) {
      if (Date.parse(expiresAt) > nowMs) {
        nextState.crossRepo[repoRef] = expiresAt;
      }
    }

    if (
      nextState.destructiveExpiresAt &&
      Date.parse(nextState.destructiveExpiresAt) <= nowMs
    ) {
      delete nextState.destructiveExpiresAt;
    }

    return nextState;
  }

  private async persistIfChanged(
    previousState: ApprovalState,
    nextState: ApprovalState,
  ): Promise<void> {
    if (isSameState(previousState, nextState)) {
      return;
    }
    nextState.updatedAt = new Date().toISOString();
    await this.ctx.storage.put(this.key(), nextState);
  }

}

function isSameState(a: ApprovalState, b: ApprovalState): boolean {
  if (a.destructiveExpiresAt !== b.destructiveExpiresAt) {
    return false;
  }

  const aEntries = Object.entries(a.crossRepo).sort(([aKey], [bKey]) =>
    aKey.localeCompare(bKey),
  );
  const bEntries = Object.entries(b.crossRepo).sort(([aKey], [bKey]) =>
    aKey.localeCompare(bKey),
  );

  if (aEntries.length !== bEntries.length) {
    return false;
  }

  for (let index = 0; index < aEntries.length; index += 1) {
    const aEntry = aEntries[index];
    const bEntry = bEntries[index];
    if (!aEntry || !bEntry) {
      return false;
    }
    if (aEntry[0] !== bEntry[0] || aEntry[1] !== bEntry[1]) {
      return false;
    }
  }

  return true;
}
