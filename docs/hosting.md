# Hosting for friends over IPv6

The bundled worlds listen on the IPv6 wildcard address (`::`) by default:

| World | Gamemode | TCP port |
| --- | --- | --- |
| World 1 | Vanilla | `43594` |
| World 2 | Leagues V | `43595` |

Start both worlds from the repository root:

```bash
yarn server
```

## Network access

Allow inbound **TCP** traffic to ports `43594` and `43595` in Windows Firewall and at your router or IPv6 firewall. With IPv6, this is commonly an inbound firewall rule rather than IPv4-style NAT port forwarding.

Verify from a network outside your home connection. Do not rely only on a test from the same Wi-Fi network.

## Client configuration

Do not commit your public address. Create `client/.env.local` with your own public IPv6 address, including square brackets around the address:

```dotenv
REACT_APP_DEFAULT_WS_URL=ws://[2001:db8:1234::10]:43594
REACT_APP_DEFAULT_SERVER_ADDRESS=[2001:db8:1234::10]:43594
REACT_APP_DEFAULT_SERVER_NAME=World 1
REACT_APP_DEFAULT_SERVER_SECURE=false
REACT_APP_SERVERS_JSON=[{"id":1,"name":"World 1","activity":"Vanilla","address":"[2001:db8:1234::10]:43594","secure":false,"maxPlayers":1234},{"id":2,"name":"World 2","activity":"Leagues V","address":"[2001:db8:1234::10]:43595","secure":false,"maxPlayers":1234}]
```

Restart or rebuild the client after changing these values because Create React App embeds `REACT_APP_*` values at build time.

## Sharing the client

Friends also need access to the web client. For temporary development hosting, start the client on an externally reachable interface and allow its TCP port (usually `3000`) through the same firewall path. In PowerShell:

```powershell
$env:HOST = "::"
yarn client
```

For a durable setup, serve the production client build through a static web server instead.

If the client page is served with HTTPS, browsers block insecure `ws://` connections. Use HTTP for this private IPv6 setup, or later place the WebSocket services behind TLS and use `wss://`.

## Safety notes

Your public IPv6 address identifies your home connection. Share it only with the people you intend to invite, keep Windows and Node.js updated, and restrict the two game ports to known source addresses if your router supports IPv6 firewall rules.
