import { buildApp } from "./app.js";
import { env } from "./env.js";

const app = buildApp();
app.listen({ port: env.port, host: "0.0.0.0" }).then(() => {
  console.log(`API on :${env.port}`);
});
