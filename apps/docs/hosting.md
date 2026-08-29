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

## Sharing the browser client

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
