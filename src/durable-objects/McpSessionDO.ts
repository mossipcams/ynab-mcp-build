import { DurableObject } from "cloudflare:workers";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createMcpServer } from "../mcp/server.js";
import { resolveAppEnv } from "../shared/env.js";

const SESSION_TTL_MS = 30 * 60 * 1000;

class ResumableTransport extends WebStandardStreamableHTTPServerTransport {
  restoreSession(sessionId: string): void {
    // Restore in-memory state after DO hibernation so the transport
    // accepts non-initialize requests without forcing client re-init.
    (this as any)._initialized = true;
    this.sessionId = sessionId;
  }
}

export class McpSessionDO extends DurableObject<Env> {
  private transport: ResumableTransport | null = null;
  private server: McpServer | null = null;

  private async ensureInitialized(): Promise<ResumableTransport> {
    if (this.transport && this.server) {
      return this.transport;
    }

    const sessionId = this.ctx.id.toString();
    const transport = new ResumableTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: async () => {
        await this.ctx.storage.put("initialized", true);
      },
      onsessionclosed: () => {
        this.transport = null;
        this.server = null;
      }
    });

    const wasInitialized = await this.ctx.storage.get<boolean>("initialized");
    if (wasInitialized) {
      transport.restoreSession(sessionId);
    }

    const env = resolveAppEnv(this.env);
    this.server = createMcpServer(env);
    this.transport = transport;
    await this.server.connect(transport);

    return transport;
  }

  async fetch(request: Request): Promise<Response> {
    const transport = await this.ensureInitialized();
    await this.ctx.storage.setAlarm(Date.now() + SESSION_TTL_MS);
    return transport.handleRequest(request);
  }

  async alarm(): Promise<void> {
    await this.ctx.storage.delete("initialized");
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
      this.server = null;
    }
  }
}
