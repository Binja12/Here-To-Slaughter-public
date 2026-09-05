# Hosting an HTSR playtest from your own computer

`compose.internet.yaml` puts the client, lobby API, lobby event stream and
Socket.IO server behind one local Caddy address. Only Caddy is bound to the
host, at `127.0.0.1:8080`; the application and internal TCP ports remain inside
Docker.

## Why this uses a named tunnel

HTSR receives lobby updates through Server-Sent Events (SSE). Cloudflare Quick
Tunnels (`trycloudflare.com`) explicitly do not support SSE, so they cannot run
this game correctly. Use a named Cloudflare Tunnel with a stable public
hostname. A named tunnel requires a free Cloudflare account and a domain in
that account.

## One-time Cloudflare setup

1. In Cloudflare, open **Networking → Tunnels** and create a remotely-managed
   tunnel named `htsr-playtest`.
2. Add one public hostname, for example `play.example.com`.
3. Set its service type to **HTTP** and its service URL to
   `http://gateway:8080`.
4. Choose the Docker connector instructions and copy only the tunnel token—the
   long value after `--token`. Do not save or commit it in this repository.

## Start the public playtest

From the repository root in PowerShell:

```powershell
$env:CLOUDFLARE_TUNNEL_TOKEN = 'paste-token-here'
$env:HTSR_PUBLIC_ORIGIN = 'https://play.example.com'
docker compose -f compose.internet.yaml --profile cloudflare up --build -d
docker compose -f compose.internet.yaml ps
docker compose -f compose.internet.yaml logs --tail 50 tunnel
```

Open the configured `https://play.example.com` address yourself first, then
send that same address to the other players. They only need a browser.

The token exists only in this PowerShell process. Opening a new terminal or
restarting the stack requires setting it again.

## Stop the public playtest

```powershell
docker compose -f compose.internet.yaml --profile cloudflare down
Remove-Item Env:CLOUDFLARE_TUNNEL_TOKEN -ErrorAction SilentlyContinue
Remove-Item Env:HTSR_PUBLIC_ORIGIN -ErrorAction SilentlyContinue
```

Accounts and finished games persist in the `db` service (volume `htsr-db`).
Stopping or recreating the lobby/game containers still clears sessions, the
ready list and active games, which stay in memory.

## Local verification without exposing the computer

```powershell
docker compose -f compose.internet.yaml up --build -d
docker compose -f compose.internet.yaml ps
```

The gateway is then available at `http://localhost:8080`. Production cookies
are marked `Secure`, so use this address only to verify that the client and
static card assets load; login is expected to require the public HTTPS tunnel.

Stop the local-only stack with:

```powershell
docker compose -f compose.internet.yaml down
```

## Security boundaries

- Do not publish ports 3000, 3001, 3002, 4000 or 4001.
- Do not commit a tunnel token or paste it into a Compose file.
- Anyone with the public URL can reach HTSR's registration page. Turn the
  tunnel off when the playtest ends.
- Keep Docker Desktop, this stack and the computer running throughout the
  playtest. Disable sleep while players are connected.
