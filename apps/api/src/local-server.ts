import http from "http";
import { handler } from "./handler.js";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

process.env.LOCAL_MODE = process.env.LOCAL_MODE ?? "true";
process.env.USER_ID = process.env.USER_ID ?? "me";
process.env.TABLE_NAME = process.env.TABLE_NAME ?? "pocketbook-dev";

const PORT = Number(process.env.PORT ?? 3001);

function toEvent(
  req: http.IncomingMessage,
  body: string,
  url: URL,
): APIGatewayProxyEventV2 {
  const pathParams: Record<string, string> = {};
  return {
    version: "2.0",
    routeKey: "$default",
    rawPath: url.pathname,
    rawQueryString: url.search.replace(/^\?/, ""),
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v ?? ""]),
    ),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    pathParameters: pathParams,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method: req.method ?? "GET",
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: req.headers["user-agent"] ?? "",
      },
      requestId: `local-${Date.now()}`,
      routeKey: "$default",
      stage: "$default",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    isBase64Encoded: false,
    body: body || undefined,
  } as APIGatewayProxyEventV2;
}

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks);
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    });
    res.end();
    return;
  }

  const contentType = req.headers["content-type"] ?? "";
  let body = raw.toString("utf8");
  // For local CSV upload, pass through as text
  if (contentType.includes("text/csv") || contentType.includes("application/octet-stream")) {
    body = raw.toString("utf8");
  }

  try {
    const result = await handler(toEvent(req, body, url), {} as never, () => undefined);
    const response =
      typeof result === "string"
        ? { statusCode: 200, headers: {}, body: result }
        : result ?? { statusCode: 204, headers: {}, body: "" };

    const headers = {
      "access-control-allow-origin": "*",
      ...(response.headers as Record<string, string>),
    };
    res.writeHead(response.statusCode ?? 200, headers);
    res.end(response.body ?? "");
  } catch (err) {
    console.error(err);
    res.writeHead(500, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : "error" }));
  }
});

server.listen(PORT, () => {
  console.log(`Pocketbook API (local) http://localhost:${PORT}`);
});
