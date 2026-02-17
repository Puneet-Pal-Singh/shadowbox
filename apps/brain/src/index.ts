// apps/brain/src/index.ts
import { ChatController } from "./controllers/ChatController";
import { AuthController } from "./controllers/AuthController";
import { GitHubController } from "./controllers/GitHubController";
import { GitController } from "./controllers/GitController";
import { ProviderController } from "./controllers/ProviderController";
import { handleOptions, getCorsHeaders } from "./lib/cors";
import { Env } from "./types/ai";
import { RunEngineRuntime } from "./runtime/RunEngineRuntime";
import { SessionMemoryRuntime } from "./runtime/SessionMemoryRuntime";

export { RunEngineRuntime, SessionMemoryRuntime };

/**
 * Route configuration type with HTTP method support
 */
interface RouteConfig {
  pattern: RegExp;
  method: string;
  handler: (request: Request, env: Env) => Promise<Response>;
}

/**
 * Router class - Single Responsibility: Route matching only
 * Follows Open/Closed: New routes can be added without modifying existing code
 * Now includes HTTP method matching for RESTful API design
 */
class Router {
  private routes: RouteConfig[] = [];

  add(
    pattern: RegExp,
    handler: RouteConfig["handler"],
    method: string = "GET",
  ): void {
    this.routes.push({ pattern, method: method.toUpperCase(), handler });
  }

  async match(request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
    const requestMethod = request.method.toUpperCase();

    for (const route of this.routes) {
      if (route.pattern.test(url.pathname) && route.method === requestMethod) {
        return await route.handler(request, env);
      }
    }

    return null;
  }
}

/**
 * Create and configure router with all application routes
 * Separates route configuration from request handling logic
 */
function createRouter(): Router {
  const router = new Router();

  // Chat routes
  router.add(/\/chat/, ChatController.handle, "POST");

  // Auth routes - OAuth flow
  router.add(/\/auth\/github\/login/, AuthController.handleLogin);
  router.add(/\/auth\/github\/callback/, AuthController.handleCallback);
  router.add(/\/auth\/session/, AuthController.handleGetSession);
  router.add(/\/auth\/logout/, AuthController.handleLogout);

  // GitHub API routes
  router.add(/\/api\/github\/repos/, GitHubController.listRepositories);
  router.add(/\/api\/github\/branches/, GitHubController.listBranches);
  router.add(/\/api\/github\/contents/, GitHubController.getContents);
  router.add(/\/api\/github\/tree/, GitHubController.getTree);
  router.add(/\/api\/github\/pulls$/, GitHubController.listPullRequests, "GET");
  router.add(/\/api\/github\/pulls\//, GitHubController.getPullRequest, "GET");
  router.add(
    /\/api\/github\/pulls$/,
    GitHubController.createPullRequest,
    "POST",
  );

  // Git local routes (for sidebar)
  router.add(/\/api\/git\/status/, GitController.getStatus);
  router.add(/\/api\/git\/diff/, GitController.getDiff);
  router.add(/\/api\/git\/stage/, GitController.stageFiles, "POST");
  router.add(/\/api\/git\/commit/, GitController.commit, "POST");

  // Provider routes (BYOK configuration)
  router.add(/^\/api\/providers\/connect$/, ProviderController.connect, "POST");
  router.add(/^\/api\/providers\/disconnect$/, ProviderController.disconnect, "POST");
  router.add(/^\/api\/providers\/status$/, ProviderController.status, "GET");
  router.add(/^\/api\/providers\/models$/, ProviderController.models, "GET");

  return router;
}

/**
 * Main request handler
 * Delegates to controllers - follows Dependency Inversion Principle
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const optionsResponse = handleOptions(request, env);
    if (optionsResponse) return optionsResponse;

    const router = createRouter();

    try {
      const response = await router.match(request, env);

      if (response) {
        return response;
      }

      return new Response(
        JSON.stringify({
          error: "Not Found",
          path: new URL(request.url).pathname,
        }),
        {
          status: 404,
          headers: {
            ...getCorsHeaders(request, env),
            "Content-Type": "application/json",
          },
        },
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Internal Server Error";
      console.error("[Router] Error handling request:", error);

      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: {
          ...getCorsHeaders(request, env),
          "Content-Type": "application/json",
        },
      });
    }
  },
};
