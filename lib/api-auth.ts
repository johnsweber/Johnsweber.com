import { verifyToken } from "@clerk/backend";

export type ApiUser = {
  id: string;
  sessionId?: string;
};

export async function requireApiUser(request: Request): Promise<ApiUser> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Response("Authentication is not configured.", { status: 503 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Response("Sign in required.", { status: 401 });
  }

  try {
    const payload = await verifyToken(authorization.slice(7), { secretKey });
    if (!payload.sub) throw new Error("Missing subject");
    return {
      id: payload.sub,
      sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
    };
  } catch {
    throw new Response("Your session is no longer valid.", { status: 401 });
  }
}
