import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

const host = "127.0.0.1";
const proxyPort = Number.parseInt(process.env.DOCS_SERVICES_PORT ?? "3005", 10);
const docsPort = Number.parseInt(process.env.DOCS_PORT ?? "3002", 10);
const storybookPort = Number.parseInt(process.env.STORYBOOK_PORT ?? "6006", 10);
const pnpmCli = process.env.npm_execpath;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const children = [];
const localeStorybookPattern = /^\/(?:en|pl|de|fr|cs|sk|uk)\/storybook(?:\/|$)/;
const storybookRuntimeAssetPattern =
  /^\/(?:vite-inject-mocker-entry\.js(?:\?|$)|@(?:vite|id|fs)(?:\/|$)|node_modules(?:\/|$)|\.storybook(?:\/|$)|src(?:\/|$))/;
const localeStorybookRuntimeAssetPattern =
  /^\/(?:en|pl|de|fr|cs|sk|uk)(\/(?:vite-inject-mocker-entry\.js(?:\?|$)|@(?:vite|id|fs)(?:\/|$)|node_modules(?:\/|$)|\.storybook(?:\/|$)|src(?:\/|$)))/;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function startProcess(label, args) {
  const command = pnpmCli ? process.execPath : pnpm;
  const commandArgs = pnpmCli ? [pnpmCli, ...args] : args;
  const child = spawn(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.push(child);
  child.stdout.on("data", (chunk) =>
    process.stdout.write(`[${label}] ${chunk}`),
  );
  child.stderr.on("data", (chunk) =>
    process.stderr.write(`[${label}] ${chunk}`),
  );
  child.once("exit", (code, signal) => {
    if (signal || code === 0) {
      return;
    }

    process.stderr.write(`[${label}] exited with code ${code}\n`);
  });
}

function getTarget(requestUrl) {
  const localeRuntimeAssetMatch = requestUrl.match(
    localeStorybookRuntimeAssetPattern,
  );

  if (localeRuntimeAssetMatch) {
    return {
      port: storybookPort,
      path: requestUrl.replace(
        /^\/(?:en|pl|de|fr|cs|sk|uk)(?=\/(?:vite-inject-mocker-entry\.js(?:\?|$)|@(?:vite|id|fs)(?:\/|$)|node_modules(?:\/|$)|\.storybook(?:\/|$)|src(?:\/|$)))/,
        "",
      ),
    };
  }

  if (storybookRuntimeAssetPattern.test(requestUrl)) {
    return { port: storybookPort, path: requestUrl };
  }

  if (localeStorybookPattern.test(requestUrl)) {
    return {
      port: storybookPort,
      path:
        requestUrl.replace(/^\/(?:en|pl|de|fr|cs|sk|uk)\/storybook/, "") || "/",
    };
  }

  if (requestUrl === "/storybook") {
    return { port: storybookPort, path: "/" };
  }

  if (requestUrl.startsWith("/storybook/")) {
    return {
      port: storybookPort,
      path: requestUrl.slice("/storybook".length),
    };
  }

  return { port: docsPort, path: requestUrl };
}

function proxyHttpRequest(request, response) {
  const target = getTarget(request.url ?? "/");
  const proxyRequest = http.request(
    {
      headers: request.headers,
      hostname: host,
      method: request.method,
      path: target.path,
      port: target.port,
    },
    (proxyResponse) => {
      response.writeHead(
        proxyResponse.statusCode ?? 502,
        proxyResponse.headers,
      );
      proxyResponse.pipe(response, { end: true });
    },
  );

  proxyRequest.on("error", (error) => {
    response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Local docs service proxy failed: ${error.message}`);
  });

  request.pipe(proxyRequest, { end: true });
}

function proxyWebSocket(request, socket, head) {
  const target = getTarget(request.url ?? "/");
  const upstream = net.connect(target.port, host, () => {
    upstream.write(
      `${request.method} ${target.path} HTTP/${request.httpVersion}\r\n${Object.entries(
        request.headers,
      )
        .map(([key, value]) => `${key}: ${value}`)
        .join("\r\n")}\r\n\r\n`,
    );
    upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", () => socket.destroy());
}

function shutdown() {
  for (const child of children) {
    killProcessTree(child);
  }
}

function killProcessTree(child) {
  if (process.platform !== "win32") {
    child.kill();
    return;
  }

  spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
    stdio: "ignore",
  });
}

process.once("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.once("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

if (!(await isPortOpen(docsPort))) {
  startProcess("docs", ["--dir", "apps/docs", "dev"]);
}

if (!(await isPortOpen(storybookPort))) {
  startProcess("storybook", ["--dir", "apps/storybook", "dev"]);
}

const server = http.createServer(proxyHttpRequest);
server.on("upgrade", proxyWebSocket);
server.listen(proxyPort, host, () => {
  process.stdout.write(
    `Docs + Storybook proxy ready at http://${host}:${proxyPort}\n` +
      `Docs: http://${host}:${proxyPort}/en\n` +
      `Storybook: http://${host}:${proxyPort}/storybook\n`,
  );
});
