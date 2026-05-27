import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

type DevResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: string) => void;
};

function sendJson(response: DevResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function fetchWithTimeout(url: string | URL, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function apiProxyPlugin(): Plugin {
  return {
    name: "local-api-proxy",
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, "");
      const openDartKey = env.VITE_OPENDART_API_KEY || env.OPENDART_API_KEY || "";
      const kosisKey = env.VITE_KOSIS_API_KEY || env.KOSIS_API_KEY || "";

      server.middlewares.use(async (request, response, next) => {
        if (!request.url?.startsWith("/api/")) {
          next();
          return;
        }

        try {
          const url = new URL(request.url, "http://localhost");

          if (url.pathname === "/api/opendart/list") {
            if (!openDartKey) {
              sendJson(response, 400, { status: "NO_KEY", message: "OpenDART API key is missing." });
              return;
            }
            url.searchParams.set("crtfc_key", openDartKey);
            const upstream = await fetchWithTimeout(`https://opendart.fss.or.kr/api/list.json?${url.searchParams.toString()}`);
            response.statusCode = upstream.status;
            response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
            response.end(await upstream.text());
            return;
          }

          if (url.pathname === "/api/opendart/company") {
            if (!openDartKey) {
              sendJson(response, 400, { status: "NO_KEY", message: "OpenDART API key is missing." });
              return;
            }
            url.searchParams.set("crtfc_key", openDartKey);
            const upstream = await fetchWithTimeout(`https://opendart.fss.or.kr/api/company.json?${url.searchParams.toString()}`);
            response.statusCode = upstream.status;
            response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
            response.end(await upstream.text());
            return;
          }

          if (url.pathname === "/api/kosis/proxy") {
            if (!kosisKey) {
              sendJson(response, 400, { status: "NO_KEY", message: "KOSIS API key is missing." });
              return;
            }
            const target = url.searchParams.get("target");
            if (!target) {
              sendJson(response, 400, { status: "NO_TARGET", message: "KOSIS target URL is missing." });
              return;
            }
            const targetUrl = new URL(target);
            targetUrl.searchParams.set("apiKey", kosisKey);
            const upstream = await fetchWithTimeout(targetUrl);
            response.statusCode = upstream.status;
            response.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
            response.end(await upstream.text());
            return;
          }

          sendJson(response, 404, { status: "NOT_FOUND", message: "Unknown local API route." });
        } catch (error) {
          sendJson(response, 500, { status: "PROXY_ERROR", message: error instanceof Error ? error.message : "Proxy request failed." });
        }
      });
    },
  };
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/CCA/" : "/",
  plugins: [react(), apiProxyPlugin()],
});
