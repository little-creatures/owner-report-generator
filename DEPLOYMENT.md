# Deployment Plan

This POC is a static Vite/React app served by nginx. It has no backend, database, email integration, accounting integration, or runtime secret requirement.

## Local Artifacts

- `Dockerfile` builds the Vite app with Node 22 and serves `dist/` from nginx on container port `8080`.
- `nginx.conf` provides SPA fallback, static asset caching, security headers, and `/healthz`.
- `compose.portainer.yml` is a Portainer-compatible stack template for a single static service.
- `.env.example` contains placeholder values only. Real infrastructure secrets must not be committed.

## Suggested Hostname

Use `owner-reports.littlecreatures.cc` for the public POC hostname if the user approves external deployment.

## Local Verification

```bash
npm run lint
npm run build
docker build -t owner-report-generator:local .
docker compose -f compose.portainer.yml --env-file .env.example up -d
curl -fsS http://127.0.0.1:8088/healthz
docker compose -f compose.portainer.yml --env-file .env.example down
```

## Approval-Blocked External Steps

Do not perform these steps without explicit user approval:

1. Publish or push code/image to GitHub or any registry.
2. Create or update a Portainer stack.
3. Read deployment secrets from 1Password or any secret inventory.
4. Create or update Cloudflare DNS records, tunnel routes, or tunnel tokens for `owner-reports.littlecreatures.cc`.
5. Create or update an NPM reverse proxy host, TLS certificate, or public route.
6. Expose the service publicly under `littlecreatures.cc`.

## Deployment Checklist After Approval

1. Confirm the final hostname, expected audience, and whether this should be public or access-controlled.
2. Confirm the target host, Portainer environment, stack name, and network/proxy pattern.
3. Build and publish an image or configure Portainer to build from the approved source.
4. Create the stack from `compose.portainer.yml` with environment values from the approved deployment target.
5. Configure the approved Cloudflare tunnel or DNS route to the service.
6. Configure the approved NPM proxy host and TLS certificate if the route is not tunnel-only.
7. Verify container health, `GET /healthz`, public HTTPS load, static assets, and upload workflow with sample CSV/XLSX fixtures.
8. Update the Workboard ticket with the deployed URL and verification results.
