# nodejs-tutorial-hello-world

A minimal HTTP server built on nothing but Node.js itself: the built-in `http` module, with no framework, no middleware and no routing library, and no dependency outside the Node.js standard library. It serves exactly one endpoint, `GET /hello`, and answers every other request with `404 Not Found`.

It is a tutorial reference implementation — the smallest complete demonstration of creating an endpoint and handling requests — and the whole service is the single file `server.js`. Reading that file alongside this guide is the intended way to use it.

## Prerequisites

- **Node.js v18.0.0 or newer.** Check the version you have:

  ```bash
  node --version
  ```

  Any output at or above `v18.0.0` (for example `v22.23.3`) works. `package.json` declares the same floor as `"engines": {"node": ">=18.0.0"}`.

- **Nothing else.** No package installation, no database, no external service, no configuration file and no build step.

- **`curl`** for the examples below. It ships with macOS and virtually every Linux distribution.

## Installation

There is no installation step. The project declares **zero dependencies** — `package.json` has no `dependencies` and no `devDependencies` — so nothing has to be downloaded, compiled or configured, and no `node_modules` directory ever appears. `npm install` is not required; running it is a harmless no-op.

Clone or download the three files of the project, then change into the directory that contains them. The example below uses the project name as the directory name:

```bash
cd nodejs-tutorial-hello-world
```

Every command in this guide is run from that directory, and `node server.js` expects to find `server.js` there.

## Running the server

From the project root, either command starts the same server:

```bash
node server.js
```

```bash
npm start
```

`npm start` runs the `start` script from `package.json`, which is exactly `node server.js`.

The server binds port `3000` unless `PORT` says otherwise (see [Configuration (`PORT`)](#configuration-port)) and prints its ready line:

```text
Server listening on port 3000
```

It then stays in the foreground and logs every request it receives. Leave it running and use a second terminal for the tests below.

With `npm start` you will also see npm's own two-line banner before the ready line; those lines come from npm, not from the server.

## Testing the endpoint

With the server running, request the endpoint from another terminal:

```bash
curl http://localhost:3000/hello
```

That prints just the body:

```text
Hello world
```

Add `-i` to include the status line and the response headers as well:

```bash
curl -i http://localhost:3000/hello
```

Any request that is not exactly `GET /hello` falls through to the catch-all 404:

```bash
curl -i http://localhost:3000/invalid
```

That includes an unsupported method on the defined path. The server answers `404 Not Found`, never `405 Method Not Allowed`:

```bash
curl -i -X POST -d 'a=1' http://localhost:3000/hello
```

Four matching rules are worth knowing, because they are what beginners trip over:

- **The method and the path must both match.** `POST /hello` is a `404`, like any other pair that is not `GET /hello`.
- **Matching is case-sensitive.** `GET /Hello` is a `404`; `/hello` is the only path served.
- **A trailing slash is not forgiven.** `GET /hello/` is a `404`.
- **A query string is ignored for routing.** `GET /hello?x=1` is a `200` with the body `Hello world`, because only the part before `?` is compared. The request log still records the target exactly as it arrived, so the log line for that request ends in `/hello?x=1`.

## Expected output

`curl -i http://localhost:3000/hello`:

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 11
Date: Tue, 20 Oct 2026 17:59:43 GMT
Connection: keep-alive
Keep-Alive: timeout=5

Hello world
```

`curl -i http://localhost:3000/invalid`:

```http
HTTP/1.1 404 Not Found
Content-Type: text/plain
Content-Length: 9
Date: Tue, 20 Oct 2026 17:59:44 GMT
Connection: keep-alive
Keep-Alive: timeout=5

Not Found
```

`Date`, `Connection` and `Keep-Alive` are added by Node.js itself; `Content-Type` and `Content-Length` are set by the server's own code. `Content-Length: 11` is the byte length of `Hello world` and `9` the byte length of `Not Found` — neither body ends with a newline.

While you send those requests, the terminal running the server prints one line per request, in arrival order:

```text
Server listening on port 3000
2026-10-20T17:59:43.914Z GET /hello
2026-10-20T17:59:44.102Z GET /invalid
2026-10-20T17:59:45.007Z POST /hello
```

The first line is the ready line; every line after it is a request, in the form `<ISO-8601 timestamp> <HTTP method> <request target>`, written **before** the request is routed — so a request is logged whether it ends in a `200` or a `404`. The timestamp is UTC and the target is recorded exactly as received.

Press CTRL+C and the terminal shows:

```text
Server shutting down
Server stopped
```

## Stopping the server

Press **CTRL+C** in the terminal running the server. That sends `SIGINT`, and the server shuts down in order:

1. prints `Server shutting down`;
2. stops accepting new connections and closes the ones that are open;
3. prints `Server stopped`;
4. exits with status `0` — confirm with `echo $?` in that shell afterwards.

Because the shutdown is orderly, the port is released and no connection is left half-open.

## Configuration (`PORT`)

The listening port comes from the `PORT` environment variable.

| Setting | Meaning |
| --- | --- |
| unset | default `3000` |
| empty (`PORT=`) | also `3000` — an empty value counts as "not set" |
| `1024` to `65535` | accepted; the server listens on that port |
| anything else | rejected before the server binds (see [Startup failures](#startup-failures)) |

Override the default by setting `PORT` for the command:

```bash
PORT=3001 node server.js
```

```text
Server listening on port 3001
```

The same works through the start script:

```bash
PORT=3001 npm start
```

Then test the new port with `curl http://localhost:3001/hello`.

The accepted range is a whole number from `1024` to `65535`. A value below `1024` is refused by the server's own validation before it binds, so a privileged port is never used; the same applies to a value above `65535` and to anything that is not a whole number.

## Startup failures

Both startup failures print a single plain sentence to standard error and exit with status `1` — no stack trace and no internal detail.

**An unusable `PORT`.** Any value that is not a whole number in `1024`-`65535` is rejected, for instance `PORT=abc`, `PORT=80`, `PORT=1023`, `PORT=0`, `PORT=3000.5`, `PORT=65536`, `PORT=+3000` or `PORT=1.0e3`:

```bash
PORT=abc node server.js
```

```text
Invalid PORT value "abc": PORT must be an integer between 1024 and 65535.
```

**A port something else already holds.** A second instance on the same port cannot bind, for example with port 3000 already taken:

```text
Failed to start: port 3000 is already in use. Stop the process using it, or choose another port, for example: PORT=3001 node server.js
```

What you can rely on is the behaviour: one actionable line on standard error, nothing leaked from inside the process, and exit status `1`.

## Behaviour reference

| Request | Status | `Content-Type` | `Content-Length` | Body |
| --- | --- | --- | --- | --- |
| `GET /hello` | `200 OK` | `text/plain` | `11` | `Hello world` |
| `GET /hello?x=1` | `200 OK` | `text/plain` | `11` | `Hello world` |
| `GET /Hello`, `GET /hello/`, `GET /invalid`, `POST /hello` | `404 Not Found` | `text/plain` | `9` | `Not Found` |

A `HEAD` request such as `curl -I http://localhost:3000/hello` gets that same `404` with `Content-Length: 9` and no body, because the runtime suppresses the body bytes for `HEAD`.

| Moment | Console line |
| --- | --- |
| startup | `Server listening on port <port>` |
| each request | `<ISO-8601 timestamp> <METHOD> <target as received>`, written before routing |
| shutdown | `Server shutting down`, then `Server stopped` |

`GET /hello` performs no I/O and returns a constant string, so a loopback round trip stays far inside the 10 ms budget. Time one with `curl` alone:

```bash
curl -s -o /dev/null -w '%{time_total}\n' http://localhost:3000/hello
```

Only the two responses in the table come from the server's own code. Requests that Node.js rejects before the request handler runs — a malformed request line, or headers past the runtime's size limit — never reach the application and are answered by the runtime instead.
