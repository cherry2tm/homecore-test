import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRoot = fileURLToPath(new URL("./dist", import.meta.url));
const defaultPort = Number.parseInt(process.env.PORT ?? "4173", 10);
const defaultHost = process.env.HOST ?? "127.0.0.1";
const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"]
]);
const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

function isContained(root, candidate) {
  const relativePath = relative(root, candidate);

  return (
    relativePath === "" ||
    (relativePath !== ".." &&
      !relativePath.startsWith(`..${sep}`) &&
      !isAbsolute(relativePath))
  );
}

function sendError(response, statusCode, message) {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(message);
}

async function selectFile(root, candidate) {
  try {
    const candidateStat = await stat(candidate);

    if (candidateStat.isFile()) {
      return candidate;
    }
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
      throw error;
    }
  }

  const fallback = resolve(root, "index.html");
  const fallbackStat = await stat(fallback);

  if (!fallbackStat.isFile()) {
    throw new Error("dist/index.html is not a file");
  }

  return fallback;
}

async function handleRequest(request, response, root) {
  let decodedPath;

  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendError(response, 400, "Bad Request");
    return;
  }

  const relativeRequestPath =
    decodedPath === "/"
      ? "index.html"
      : decodedPath.replace(/^[/\\]+/, "");
  const candidate = resolve(root, relativeRequestPath);

  if (!isContained(root, candidate)) {
    sendError(response, 400, "Bad Request");
    return;
  }

  let filePath;

  try {
    filePath = await selectFile(root, candidate);
  } catch {
    sendError(response, 500, "Internal Server Error");
    return;
  }

  const stream = createReadStream(filePath);

  stream.once("error", () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }

    sendError(response, 500, "Internal Server Error");
  });
  stream.once("open", () => {
    const extension = extname(filePath);

    response.writeHead(200, {
      ...securityHeaders,
      "Content-Type": mime.get(extension) ?? "application/octet-stream",
      "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=60"
    });
    stream.pipe(response);
  });
}

export function createStaticServer({ root = defaultRoot } = {}) {
  const resolvedRoot = resolve(root);

  return createServer((request, response) => {
    void handleRequest(request, response, resolvedRoot).catch(() => {
      if (response.headersSent) {
        response.destroy();
        return;
      }

      sendError(response, 500, "Internal Server Error");
    });
  });
}

export function startServer({
  root = defaultRoot,
  port = defaultPort,
  host = defaultHost
} = {}) {
  const server = createStaticServer({ root });

  return server.listen(port, host, () => {
    const address = server.address();
    const listeningPort = typeof address === "object" && address ? address.port : port;
    console.log(`HomeCore Test Agent Console: http://${host}:${listeningPort}`);
  });
}

const isDirectEntry =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectEntry) {
  if (!existsSync(resolve(defaultRoot, "index.html"))) {
    console.error("dist/ is missing. Run npm run build first.");
    process.exit(1);
  }

  startServer();
}
