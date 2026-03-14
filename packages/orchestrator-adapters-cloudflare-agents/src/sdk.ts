import { Agent, getAgentByName, routeAgentRequest } from "agents";

export {
  Agent as CloudflareAgent,
  getAgentByName as getCloudflareAgentByName,
  routeAgentRequest as routeCloudflareAgentRequest,
};

export interface CloudflareAgentRouteBinding {
  namespace: unknown;
}

export async function fetchCloudflareAgentRoute(
  binding: CloudflareAgentRouteBinding,
  name: string,
  request: Request,
): Promise<Response> {
  const stub = await getAgentByName(
    binding.namespace as unknown as DurableObjectNamespace<Agent>,
    name,
  );
  return (await stub.fetch(request)) as unknown as Response;
}
