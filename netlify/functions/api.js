import serverless from "serverless-http";
import { app } from "../../server/index.js";

// Netlify hands every /api/* request to this function. Static files and the 404 page are
// served by the CDN from public/, so they never reach here.
export const handler = serverless(app, {
  requestTimeout: 30_000
});
