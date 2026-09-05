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

No account and no domain are needed, but the hostname is random and dies with
the tunnel — restarting hands out a different one, so the URL cannot be shared
ahead of time. The tunnel lives in an `ssh.exe` the script tracks by pid in
`%TEMP%`; closing the terminal does not close it.

```powershell
.\scripts\start-internet-playtest.ps1 -Stop
```

That stops the tunnel and the stack together. Use the Cloudflare route below
instead when a stable hostname is worth the one-time setup.

## Why the art is fast over a tunnel

Everything a remote player fetches goes out over the host computer's upload
link, and the painted PNG masters under `client/public` weigh 450 MB (a
card is ~4 MB, the border widgets alone 21 MB). Measured through
localhost.run: one 1.5 MB button took 2.4 s, and even a
revalidation that transfers nothing took 0.8 s of round trip. Two things in
the client image fix that without touching the masters:

- **WebP twins.** The image build runs `scripts/optimize-art.mjs`, which
  writes `<name>.png.webp` next to every PNG (450 MB → 36 MB, same pixels,
  no visible loss at q82). nginx hands the twin to any browser that accepts
  WebP and the PNG to anyone else, so the URLs in the client never change.
  The twins are git-ignored; `npm start` serves the PNGs and needs nothing.
- **Versioned URLs.** Every art URL carries `?v=<hash of the PNG masters>`
  (`client/src/assetUrl.ts`, set by the Dockerfile), and nginx caches a
  versioned URL for a year. A redrawn card changes the hash, so browsers
  fetch it fresh; an unversioned request still revalidates every time, which
  is what keeps art replaced in place from going stale.

A returning player therefore makes no art requests at all, and a first-time
player downloads about a twelfth of what they used to.

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
