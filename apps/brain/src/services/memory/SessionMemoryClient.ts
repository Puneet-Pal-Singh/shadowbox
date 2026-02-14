import type {
  MemoryEvent,
  MemorySnapshot,
} from "@shadowbox/execution-engine/runtime";

export interface SessionMemoryClientDependencies {
  durableObjectId: string;
  durableObjectStub: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export class SessionMemoryClient {
  private stub: {
    fetch: (request: Request) => Promise<Response>;
  };

  constructor(deps: SessionMemoryClientDependencies) {
    this.stub = deps.durableObjectStub;
  }

  async appendSessionMemory(event: MemoryEvent): Promise<boolean> {
    const response = await this.stub.fetch(
      new Request("http://localhost/append", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
      }),
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to append session memory: ${error}`);
    }

    const result = (await response.json()) as { success: boolean };
    return result.success;
  }

  async getSessionMemoryContext(
    sessionId: string,
    prompt: string,
    limit?: number,
  ): Promise<{
    events: MemoryEvent[];
    snapshot?: MemorySnapshot;
  }> {
    const response = await this.stub.fetch(
      new Request("http://localhost/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, prompt, limit }),
      }),
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get session memory context: ${error}`);
    }

    return (await response.json()) as {
      events: MemoryEvent[];
      snapshot?: MemorySnapshot;
    };
  }

  async getSessionSnapshot(
    sessionId: string,
  ): Promise<MemorySnapshot | undefined> {
    const response = await this.stub.fetch(
      new Request(
        `http://localhost/snapshot?sessionId=${encodeURIComponent(sessionId)}`,
        {
          method: "GET",
        },
      ),
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get session snapshot: ${error}`);
    }

    const result = (await response.json()) as { snapshot?: MemorySnapshot };
    return result.snapshot;
  }

  async upsertSessionSnapshot(snapshot: MemorySnapshot): Promise<void> {
    const response = await this.stub.fetch(
      new Request("http://localhost/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot }),
      }),
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to upsert session snapshot: ${error}`);
    }
  }

  async getSessionMemoryStats(sessionId: string): Promise<{
    eventCount: number;
    hasSnapshot: boolean;
  }> {
    const response = await this.stub.fetch(
      new Request(
        `http://localhost/stats?sessionId=${encodeURIComponent(sessionId)}`,
        {
          method: "GET",
        },
      ),
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to get session memory stats: ${error}`);
    }

    return (await response.json()) as {
      eventCount: number;
      hasSnapshot: boolean;
    };
  }

  async clearSessionMemory(sessionId: string): Promise<void> {
    const response = await this.stub.fetch(
      new Request("http://localhost/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }),
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to clear session memory: ${error}`);
    }
  }
}
