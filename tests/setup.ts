// Vitest runs with `--conditions=react-server` via the npm script so that the
// `server-only` guard resolves. Environment comes from .env via node --env-file.
process.env.TZ = "UTC";
