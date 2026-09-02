// Sandboxing depends on a platform-specific binary that isn't available on every
// runner -- confirmed against GitHub Actions' hosted ubuntu-latest, which rejects it
// outright ("sandboxing is not supported in this environment"). `CI` is the one env
// var essentially every CI system sets by convention (GitHub Actions, GitLab CI,
// CircleCI, ...), so this generalizes rather than special-casing one provider.
//
// This isn't a security regression in CI: the runner itself is an ephemeral, disposable
// VM, unlike a developer's own persistent machine, where sandboxing stays on. And the
// tool-level restrictions in agents/triage.ts and agents/fix.ts (no "shell" tool granted
// to either agent, and triage additionally has no "edit") are unaffected either way --
// those are an allowlist enforced independent of sandboxOptions, not a sandbox feature.
export const SANDBOX_OPTIONS = { enabled: !process.env.CI };
