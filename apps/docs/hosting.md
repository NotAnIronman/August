# Hosting for friends over IPv6

The bundled worlds listen on the IPv6 wildcard address by default:

| World | Gamemode | TCP port |
| --- | --- | --- |
| World 1 | Vanilla | **43594** |
| World 2 | Leagues V | **43595** |

Start both worlds from the repository root:

```bash
pnpm run server
```

## Network access

Allow inbound TCP traffic to the selected game ports in Windows Firewall and the router
or IPv6 firewall. With IPv6 this is usually an inbound firewall rule, not IPv4-style NAT
port forwarding.

Test from outside the host network. A connection from the same Wi-Fi network does not
prove the public firewall path works.

## Client configuration

Never commit a public address. Put local browser values in
**apps/client/.env.local**:

```dotenv
REACT_APP_DEFAULT_WS_URL=ws://[2001:db8:1234::10]:43594
REACT_APP_DEFAULT_SERVER_ADDRESS=[2001:db8:1234::10]:43594
REACT_APP_DEFAULT_SERVER_NAME=World 1
REACT_APP_DEFAULT_SERVER_SECURE=false
REACT_APP_SERVERS_JSON=[{"id":1,"name":"World 1","activity":"Vanilla","address":"[2001:db8:1234::10]:43594","secure":false,"maxPlayers":1234},{"id":2,"name":"World 2","activity":"Leagues V","address":"[2001:db8:1234::10]:43595","secure":false,"maxPlayers":1234}]
```

Restart or rebuild the browser app after changing **REACT_APP_** values because Create
React App embeds them at build time.

## Secure public hosting

Player credentials travel over the game WebSocket. For internet hosting, terminate TLS
with a reverse proxy on the same computer and advertise the secure endpoint:

```dotenv
PUBLIC_WS_URL=wss://play.example.com
TRUST_PROXY=true
```

**PUBLIC_WS_URL** is authoritative for the address and security flag returned by
**/servers.json**. The split **PUBLIC_HOST**, **PUBLIC_PORT**, and **PUBLIC_SECURE** settings
remain available for direct hosting. **TRUST_PROXY** accepts forwarding headers only from
a loopback peer; do not enable it for a proxy running on another machine. Without it, all
players behind the proxy share one login-rate-limit address.

The operational **/hosting** dashboard rejects forwarded requests even when the reverse
proxy connects from loopback. Keep that route available only through
`http://localhost:43594/hosting`.

WebSocket payload size, compression, per-tick input queue size, outbound backpressure,
password-hash concurrency, and pre-authentication message limits have safe defaults.
Their advanced overrides are documented in the root **.env.example**; raise them only
after measuring a real need.

## Sharing the browser client

The game server serves **apps/client/build/** on the game port, alongside its WebSocket
endpoint. Build the client before sharing that address, and rebuild after client or
shared-engine changes:

```powershell
pnpm --filter @august/client build
```

Players then open `http://<host>:43594/` for a controlled HTTP test. A working development
client on port 3000 does not verify this production build. Restart the game server after
server-code updates; players should reload the page to receive the new hashed assets.

If the HUD loads but the world stays black, inspect the browser console for map-worker
or cache errors. The browser gzip codec imports its WASM asset as a URL; gzip, bzip2, and
hashing accelerators in map workers can fall back to JavaScript if initialization fails
or stalls. Hosted `.wasm` responses must use `application/wasm`. Failed map requests release
their loading slots and retry with a capped backoff instead of becoming permanently stuck.

For temporary development hosting, expose the client on an appropriate interface and
allow its TCP port (normally 3000) through the same firewall path:

```powershell
$env:HOST = "::"
pnpm run client
```

For a durable deployment, serve the production output from **apps/client/build/** through
a static host.

An HTTPS page cannot open an insecure **ws://** connection. Use HTTP only for a controlled
private test, or terminate TLS for the WebSocket service and configure **wss://**.

## Safety

A public IPv6 address identifies the host connection. Share it only with intended
players, keep the operating system and Node.js patched, restrict source addresses when
possible, use explicit privileged-user configuration, and never expose
**apps/server/var/**.
