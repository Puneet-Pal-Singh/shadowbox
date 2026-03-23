import type { ToolboxEvent } from "./ToolboxEventFactory";

export interface ToolboxEventPublisher {
  publish(event: ToolboxEvent): void;
}

export class ConsoleToolboxEventPublisher implements ToolboxEventPublisher {
  publish(event: ToolboxEvent): void {
    console.log(`[toolbox/event] ${JSON.stringify(event)}`);
  }
}
