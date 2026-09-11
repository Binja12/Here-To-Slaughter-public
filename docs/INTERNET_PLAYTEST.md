# Hosting an HTSR playtest from your own computer

`compose.internet.yaml` puts the client, lobby API, lobby event stream and
Socket.IO server behind one local Caddy address. Only Caddy is bound to the
host, at `127.0.0.1:8080`; the application and internal TCP ports remain inside
Docker.

There are two ways to put that address on the internet: the one-command
localhost.run script below, or a named Cloudflare Tunnel.

## The quick route: `scripts/start-internet-playtest.ps1`

```powershell
.\scripts\start-internet-playtest.ps1
```

The script brings the stack up, opens an SSH tunnel to localhost.run, feeds
the hostname it hands back to the game process as `HTSR_PUBLIC_ORIGIN` (the
Socket.IO CORS origin), recreates `game` with it, then checks the client page,
the Socket.IO handshake and the lobby API through the public URL before
printing it.

No account and no domain are needed. Free localhost.run domains can change
while the same SSH process is running, and the free service has a speed limit
([provider documentation](https://localhost.run/docs/forever-free/)). A free
account with a registered SSH key gives longer-lived domains, not removal of
the free-tier speed limit.

Keep the launcher terminal open: it checks the public page every 15 seconds
and warns if the tunnel fails or announces a replacement address. It reads the
latest announced address, rather than retaining the first address in the log.
It does not automatically recreate the game server when an address changes,
because that would end active games. Restart the launcher to configure a new
address before continuing. The tunnel lives in an `ssh.exe` tracked by pid in
`%TEMP%`; closing the terminal stops monitoring but does not close that tunnel.

If PowerShell blocks scripts, use a policy override for this process only:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-internet-playtest.ps1
```

```powershell
.\scripts\start-internet-playtest.ps1 -Stop
```

That stops the tunnel and the stack together. Use the Cloudflare route below
instead when a stable hostname is worth the one-time setup.

If the board remains visible but game actions stop working, check the connection
status message at the top of the game and the launcher's tunnel warnings. The
settings and volume controls are local UI; their working does not establish
that the game server is still reachable. The game shows a reconnecting notice
after WebSocket disconnection and clears it when the connection returns.

## Why the art is fast over a tunnel

Everything a remote player fetches goes out over the host computer's upload
link, and the painted PNG masters under `client/public` weigh 450 MB (a
card is ~4 MB, the border widgets alone 21 MB). Measured through
localhost.run: one 1.5 MB button took 2.4 s, and even a
revalidation that transfers nothing took 0.8 s of round trip. The client build
prepares smaller delivery assets while keeping every original:

- **Images sized for the largest zoom.** Quality-90 WebP profiles cover 1080,
  1440 and 2160 effective stage heights, accounting for screen pixel density.
  The 1080 set totals 15.57 MiB. Hover and challenge views use the same prepared
  resolution from the outset. Failed exports fall back to full-size art.
- **Prioritized downloads.** Login/lobby idle time warms game assets. Visible
  images interrupt background transfers. Music uses five-minute segments,
  buffering one upcoming part instead of fetching the entire long soundtrack.
- **Stable versioned URLs.** Generated media and code have immutable hashed
  paths. Original fallbacks use per-file hashes. Unchanged files can be reused
  from browser cache across screens and deployments; HTML still revalidates.

Full-size WebP twins remain available through nginx's original-URL negotiation.
Local `npm start` uses delivery assets if prepared, otherwise the originals.
See [ONLINE_ASSET_PREPARATION.md](ONLINE_ASSET_PREPARATION.md) for preparation,
profile bounds, fallback behavior and measured loading checks. The host's upload
bandwidth and tunnel round-trip time still determine actual remote speed.

## Why the Cloudflare route uses a named tunnel

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
