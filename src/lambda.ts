import awsLambdaFastify from "@fastify/aws-lambda";
import { buildServer } from "./app.js";

const app = await buildServer();
await app.ready();

export const handler = awsLambdaFastify(app);
