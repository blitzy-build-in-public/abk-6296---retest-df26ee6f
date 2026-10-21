'use strict';

/**
 * Minimal HTTP server built on Node.js built-in modules only.
 *
 * It serves one endpoint, `GET /hello`, and answers every other request with a
 * 404. There is no framework, no middleware and no routing library: the whole
 * service is this file.
 *
 * Runtime floor: Node.js >= 18.0.0. Every facility used here exists at that
 * version — which is why the shutdown path tracks open sockets itself rather
 * than calling the connection-closing helpers that `http.Server` only gained
 * after 18.0.0.
 */

const http = require('node:http');

/** Port used when PORT is unset, empty or whitespace-only. */
const DEFAULT_PORT = 3000;

/** Lowest accepted port: ports below this are privileged on most platforms. */
const MIN_PORT = 1024;

/** Highest accepted port. */
const MAX_PORT = 65535;

/** Response body for the `GET /hello` route, sent byte-for-byte. */
const HELLO_BODY = 'Hello world';

/** Response body for every request that matches no route, sent byte-for-byte. */
const NOT_FOUND_BODY = 'Not Found';

/**
 * Resolve the listening port from the raw PORT value.
 *
 * An unset or empty/whitespace-only value means "not configured", so it yields
 * `DEFAULT_PORT`; only a non-empty value is validated. A non-empty value must be
 * digits only and must fall inside 1024-65535. The range check is also what
 * refuses a privileged port, since such a value never reaches `listen()`.
 *
 * On an unusable value this writes one line to stderr and terminates with
 * status 1; it never returns an invalid port.
 *
 * @param {string|undefined} raw Raw value of `process.env.PORT`.
 * @returns {number} A valid port number.
 */
function readPort(raw) {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_PORT;
  }

  if (!/^\d+$/.test(raw)) {
    return failInvalidPort(raw);
  }

  const port = Number(raw);

  if (port < MIN_PORT || port > MAX_PORT) {
    return failInvalidPort(raw);
  }

  return port;
}

/**
 * Report a PORT value that cannot be used and stop the process.
 *
 * The sentence is a fixed contract, so it is written literally: it names the
 * offending value and the accepted range and nothing else — no stack trace, no
 * error object, no other configuration value.
 *
 * @param {string} value The unusable PORT value, as it was supplied.
 * @returns {never} Never returns; the process exits with status 1.
 */
function failInvalidPort(value) {
  console.error(
    `Invalid PORT value "${value}": PORT must be an integer between 1024 and 65535.`
  );
  process.exit(1);
}

/**
 * Log one incoming request.
 *
 * The line is `<ISO-8601 timestamp> <METHOD> <target as received>` and is
 * written before any routing or response work, so the log order matches the
 * order requests arrive in.
 *
 * @param {http.IncomingMessage} req The incoming request.
 * @returns {void}
 */
function logRequest(req) {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
}

/**
 * Extract the pathname from a request target.
 *
 * Everything before the first `?` is the pathname; a target with no query
 * string is returned unchanged. The target is only split, never decoded or
 * normalised, so matching stays an exact comparison.
 *
 * @param {string} url The request target, as received.
 * @returns {string} The pathname portion of the target.
 */
function getPathname(url) {
  const queryIndex = url.indexOf('?');

  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

/**
 * Serve the single defined route: `GET /hello`.
 *
 * @param {http.IncomingMessage} req The incoming request.
 * @param {http.ServerResponse} res The response to write.
 * @returns {void}
 */
function handleHello(req, res) {
  sendPlainText(res, 200, HELLO_BODY);
}

/**
 * Serve the catch-all 404.
 *
 * It is method-agnostic by design: any request whose `(method, pathname)` pair
 * is not in the route table lands here, which is why an unsupported method on a
 * defined path is a 404 and never a 405.
 *
 * @param {http.IncomingMessage} req The incoming request.
 * @param {http.ServerResponse} res The response to write.
 * @returns {void}
 */
function handleNotFound(req, res) {
  sendPlainText(res, 404, NOT_FOUND_BODY);
}

/**
 * Write a plain-text response in full.
 *
 * `Content-Length` is set explicitly from the body's byte length: without it
 * Node would fall back to chunked transfer encoding. The runtime adds the
 * `Date`, `Connection` and `Keep-Alive` headers itself, so they are not set here.
 *
 * @param {http.ServerResponse} res The response to write.
 * @param {number} status The HTTP status code.
 * @param {string} body The exact response body.
 * @returns {void}
 */
function sendPlainText(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Route table: one entry per served endpoint, keyed by the exact
 * `"<METHOD> <pathname>"` pair. A single lookup therefore matches method and
 * path together, and any mismatch falls through to the 404 handler.
 *
 * @type {Map<string, function(http.IncomingMessage, http.ServerResponse): void>}
 */
const ROUTES = new Map([
  ['GET /hello', handleHello],
]);

/**
 * Every connection currently open.
 *
 * Sockets are removed as they close, so the set stays in step with reality, and
 * shutdown can destroy the remaining ones instead of waiting out the default
 * keep-alive timeout.
 *
 * @type {Set<import('node:net').Socket>}
 */
const sockets = new Set();

/**
 * Handle one request: log it, resolve its pathname, dispatch it.
 *
 * @param {http.IncomingMessage} req The incoming request.
 * @param {http.ServerResponse} res The response to write.
 * @returns {void}
 */
function handleRequest(req, res) {
  logRequest(req);

  const pathname = getPathname(req.url);
  const handler = ROUTES.get(`${req.method} ${pathname}`) || handleNotFound;

  handler(req, res);
}

/** Port this process listens on, resolved once at startup. */
const port = readPort(process.env.PORT);

/** The HTTP server. */
const server = http.createServer(handleRequest);

server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => {
    sockets.delete(socket);
  });
});

/**
 * Report a failure to bind the listening port and stop the process.
 *
 * Each branch writes one fixed, actionable sentence to stderr — naming the
 * port, and the error's `code` in the catch-all branch — and then exits with
 * status 1. `err` is inspected only to select that sentence: no stack trace,
 * no error object and no configuration value beyond the port is printed.
 */
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // The example must stay inside the range `readPort` accepts, so at the top
    // of that range it steps back instead of naming a port this server rejects.
    const suggestion = port < MAX_PORT ? port + 1 : MAX_PORT - 1;

    console.error(
      `Failed to start: port ${port} is already in use. Stop the process using it, ` +
        `or choose another port, for example: PORT=${suggestion} node server.js`
    );
  } else if (err.code === 'EACCES') {
    console.error(
      `Failed to start: permission denied binding to port ${port}. ` +
        `Choose a port between 1024 and 65535.`
    );
  } else {
    console.error(`Failed to start: could not listen on port ${port} (${err.code}).`);
  }

  process.exit(1);
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

/**
 * Whether the shutdown sequence has already been started.
 *
 * A repeated Ctrl+C re-enters the handler, so this flag keeps the sequence to
 * one run per process: the first delivery claims it and later ones return.
 *
 * @type {boolean}
 */
let shuttingDown = false;

/**
 * Stop on Ctrl+C: refuse new connections, drop the open ones, log the stop.
 *
 * The sequence runs once per process, so a repeated signal changes nothing.
 * The exit status is set rather than forced, so the final log line is flushed
 * and the process ends by itself once the event loop drains.
 */
process.on('SIGINT', () => {
  if (shuttingDown) return;
  shuttingDown = true;

  process.exitCode = 0;
  console.log('Server shutting down');

  server.close(() => {
    console.log('Server stopped');
  });

  for (const socket of sockets) {
    socket.destroy();
  }
});
