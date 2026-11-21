import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { FastifyReply, FastifyRequest } from "fastify";

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (verifier) return verifier;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  const clientId = process.env.COGNITO_CLIENT_ID;
  if (!userPoolId || !clientId) {
    throw new Error(
      "COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID env vars are required for auth",
    );
  }
  verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: "access",
    clientId,
  });
  return verifier;
}

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
    /** True for members of the Cognito group "admin": site moderators. */
    isAdmin?: boolean;
  }
}

/** Cognito group whose members may moderate (delete other people's designs and comments). */
export const ADMIN_GROUP = "admin";
const inAdminGroup = (payload: { "cognito:groups"?: string[] }) =>
  Array.isArray(payload["cognito:groups"]) && payload["cognito:groups"].includes(ADMIN_GROUP);

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return reply.code(401).send({ error: "Missing Bearer token" });
  }
  const token = header.slice("bearer ".length);
  try {
    const payload = await getVerifier().verify(token);
    req.userId = payload.sub;
    req.isAdmin = inAdminGroup(payload);
  } catch (err) {
    req.log.warn({ err }, "JWT verification failed");
    return reply.code(401).send({ error: "Invalid token" });
  }
}

/**
 * For routes anyone may read: sets req.userId when a valid token is sent, and
 * otherwise lets the request through as an anonymous visitor.
 */
export async function optionalAuth(req: FastifyRequest) {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith("bearer ")) return;
  try {
    const payload = await getVerifier().verify(header.slice("bearer ".length));
    req.userId = payload.sub;
    req.isAdmin = inAdminGroup(payload);
  } catch (err) {
    req.log.info({ err }, "ignoring invalid token on public route");
  }
}

export type AuthHooks = {
  requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
  optionalAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
};

export const cognitoAuth: AuthHooks = { requireAuth, optionalAuth };
