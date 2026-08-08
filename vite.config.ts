import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import dotenv from "dotenv";
import type { ServerResponse } from "http";

// Server-only secrets (SUPABASE_SERVICE_ROLE_KEY etc.) live in .env but are not
// VITE_-prefixed, so Vite never exposes them to the client. Load them into
// process.env here so the /api dev middleware below can use them, mirroring
// how Vercel injects them for the real serverless functions in api/*.ts.
dotenv.config();

/**
 * `vite dev` only serves the SPA — it knows nothing about the api/*.ts
 * Vercel serverless functions, which is why they 404 locally. This plugin
 * makes local dev match production by loading each api/<name>.ts module on
 * request and invoking its default export with a minimal Vercel-shaped
 * req/res. On Vercel itself this plugin is inert (production builds don't
 * run the Vite dev server), so the real serverless runtime handles them.
 */
function localApiPlugin(): Plugin {
  return {
    name: "local-vercel-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();

        const routeName = req.url.split("?")[0].replace("/api/", "");
        const modulePath = `/api/${routeName}.ts`;

        try {
          const mod = await server.ssrLoadModule(modulePath);
          const handler = mod.default as (req: unknown, res: unknown) => Promise<void> | void;
          if (typeof handler !== "function") return next();

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const rawBody = Buffer.concat(chunks).toString("utf-8");
          let parsedBody: unknown = {};
          if (rawBody) {
            try {
              parsedBody = JSON.parse(rawBody);
            } catch {
              parsedBody = {};
            }
          }

          const vercelReq = Object.assign(req, { body: parsedBody, query: {} });
          const vercelRes = attachVercelHelpers(res);

          await handler(vercelReq, vercelRes);
        } catch (err) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
          }
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Server error" }));
        }
      });
    },
  };
}

function attachVercelHelpers(res: ServerResponse) {
  const helpers = {
    status(code: number) {
      res.statusCode = code;
      return helpers;
    },
    json(payload: unknown) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(payload));
    },
  };
  return Object.assign(res, helpers);
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
  server: {
    // 5173 by default, but honour PORT so a second dev server can be started
    // alongside one that's already running.
    port: Number(process.env.PORT) || 5173,
  },
});
