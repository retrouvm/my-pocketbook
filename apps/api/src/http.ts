import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

export type HandlerEvent = APIGatewayProxyEventV2 & {
  bodyJson?: unknown;
};

export function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization,content-type",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

export function parseBody<T = unknown>(event: APIGatewayProxyEventV2): T {
  if (!event.body) return {} as T;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(raw) as T;
}

export function userIdFromEvent(event: APIGatewayProxyEventV2): string {
  const authorizer = (
    event.requestContext as APIGatewayProxyEventV2["requestContext"] & {
      authorizer?: { jwt?: { claims?: Record<string, unknown> } };
    }
  ).authorizer;
  const claims = authorizer?.jwt?.claims;
  if (claims?.sub) return String(claims.sub);
  return process.env.USER_ID ?? "me";
}

export function query(event: APIGatewayProxyEventV2) {
  return event.queryStringParameters ?? {};
}
