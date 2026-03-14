import type { RunEvent } from "@repo/shared-types";
import type { RuntimeDurableObjectState } from "../types.js";

const RUN_EVENTS_KEY_PREFIX = "run_events:";

export class RunEventRepository {
  constructor(private readonly ctx: RuntimeDurableObjectState) {}

  async append(runId: string, event: RunEvent): Promise<void> {
    const key = this.getRunEventsKey(runId);
    await this.ctx.blockConcurrencyWhile(async () => {
      const events = (await this.ctx.storage.get<RunEvent[]>(key)) ?? [];
      await this.ctx.storage.put(key, [...events, event]);
    });
  }

  async getByRun(runId: string): Promise<RunEvent[]> {
    return (await this.ctx.storage.get<RunEvent[]>(this.getRunEventsKey(runId))) ?? [];
  }

  async clear(runId: string): Promise<void> {
    await this.ctx.storage.delete(this.getRunEventsKey(runId));
  }

  private getRunEventsKey(runId: string): string {
    return `${RUN_EVENTS_KEY_PREFIX}${runId}`;
  }
}
