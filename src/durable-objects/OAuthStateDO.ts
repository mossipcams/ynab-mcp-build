import { DurableObject } from "cloudflare:workers";

import { handleOAuthStateRequest } from "./oauth-state-handler.js";

export class OAuthStateDO extends DurableObject<Env> {
  async fetch(request: Request) {
    return handleOAuthStateRequest(this.ctx.storage, request);
  }
}
