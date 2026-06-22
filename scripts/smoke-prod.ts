import { executeProductionSmoke } from "../src/tooling/production-smoke.js";

const result = await executeProductionSmoke({
  args: process.argv.slice(2),
  env: process.env,
});

console.log(JSON.stringify(result, null, 2));
