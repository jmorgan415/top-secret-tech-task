import { Cursor } from "@cursor/sdk";

// Agent.create resolves credentials itself (apiKey param -> CURSOR_API_KEY -> the file
// `Cursor.auth.login()` writes to ~/.cursor/sdk/auth.json), so this only needs to fail
// fast with a clear message when none of those will be there — not duplicate that chain.
export async function requireAuth(): Promise<void> {
  if (process.env.CURSOR_API_KEY) return;
  const status = await Cursor.auth.status();
  if (status.status === "logged-out") {
    console.error("Not authenticated — run `npm run login` first, or export CURSOR_API_KEY.");
    process.exit(1);
  }
}
