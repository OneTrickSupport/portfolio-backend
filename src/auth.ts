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
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    return reply.code(401).send({ error: "Missing Bearer token" });
  }
  const token = header.slice("bearer ".length);
  try {
    const payload = await getVerifier().verify(token);
    req.userId = payload.sub;
  } catch (err) {
    req.log.warn({ err }, "JWT verification failed");
    return reply.code(401).send({ error: "Invalid token" });
  }
}
