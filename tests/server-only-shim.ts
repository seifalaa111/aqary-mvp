// Vitest resolves modules through Vite, which does not honour node's
// `--conditions=react-server`. The `server-only` package is a build-time guard,
// so under test it is aliased to this no-op.
export {};
