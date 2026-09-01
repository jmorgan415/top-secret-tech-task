import { Cursor } from "@cursor/sdk";

const result = await Cursor.auth.login();
console.log(`Logged in as ${result.email ?? "unknown"}.`);
console.log(`Key stored in ~/.cursor/sdk/auth.json, expires ${new Date(result.apiKeyExpiresAtMs).toISOString()}.`);
