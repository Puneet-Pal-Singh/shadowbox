import {
  OrchestrationError,
  type RunOrchestratorPort,
  type RunStateEnvelope,
  type RunStatus,
  type ScheduledTaskEnvelope,
} from "@shadowbox/orchestrator-core";

export interface CloudflareAgentsRunClient<TTaskInput = unknown> {
  getRunState(runId: string): Promise<RunStateEnvelope | null>;
  transitionRun(runId: string, newStatus: RunStatus): Promise<void>;
  scheduleNext(
    runId: string,
  ): Promise<ScheduledTaskEnvelope<TTaskInput> | null>;
}

export class CloudflareAgentsRunOrchestratorAdapter<TTaskInput = unknown>
  implements RunOrchestratorPort<TTaskInput>
{
  constructor(private readonly client: CloudflareAgentsRunClient<TTaskInput>) {}

  async getRunState(runId: string): Promise<RunStateEnvelope | null> {
    return this.callOrchestrator(runId, () => this.client.getRunState(runId));
  }

  async transitionRun(runId: string, newStatus: RunStatus): Promise<void> {
    await this.callOrchestrator(runId, () =>
      this.client.transitionRun(runId, newStatus),
    );
  }

  async scheduleNext(
    runId: string,
  ): Promise<ScheduledTaskEnvelope<TTaskInput> | null> {
    return this.callOrchestrator(runId, () => this.client.scheduleNext(runId));
  }

  async startRun(runId: string): Promise<RunStateEnvelope> {
    await this.transitionRun(runId, "CREATED");
    const runState = await this.getRunState(runId);
    if (!runState) {
      throw new OrchestrationError(
        `[orchestrator/cloudflare-agents] run not found after start transition: ${runId}`,
        "RUN_NOT_FOUND",
      );
    }
    return runState;
  }

  async cancelRun(runId: string): Promise<void> {
    await this.transitionRun(runId, "CANCELLED");
  }

  private async callOrchestrator<TResult>(
    runId: string,
    operation: () => Promise<TResult>,
  ): Promise<TResult> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (error instanceof OrchestrationError) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new OrchestrationError(
        `[orchestrator/cloudflare-agents] adapter call failed for run ${runId}: ${detail}`,
        "ORCHESTRATOR_UNAVAILABLE",
      );
    }
  }
}
