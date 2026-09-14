import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { createStaticServer } from "../server.mjs";

let sandbox;
let root;
let server;
let port;

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const clientRequest = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "GET",
        headers
      },
      (response) => {
        const chunks = [];

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8")
          });
        });
      }
    );

    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

before(async () => {
  sandbox = await mkdtemp(join(tmpdir(), "homecore-test-agent-server-"));
  root = join(sandbox, "dist");
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), "<main>HomeCore Console</main>");
  await writeFile(join(root, "assets", "app.js"), "console.log('ready');");
  await writeFile(join(sandbox, "outside-secret.txt"), "must-not-be-served");

  server = createStaticServer({ root });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  port = address.port;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await rm(sandbox, { recursive: true, force: true });
});

test("serves a normal static file", async () => {
  const response = await get("/assets/app.js");

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.equal(
    response.headers["permissions-policy"],
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()"
  );
  assert.match(response.headers["content-security-policy"], /default-src 'self'/);
  assert.match(response.headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.equal(response.body, "console.log('ready');");
});

test("serves versioned catalog APIs as JSON", async () => {
  const response = await get("/api/catalog");
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.catalogVersion, "hc-test-assets-v0.1");
});

test("falls back to index.html for an SPA route", async () => {
  const response = await get("/settings/device/42");

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(response.body, "<main>HomeCore Console</main>");
});

test("returns 400 for malformed percent encoding", async () => {
  const response = await get("/%E0%A4%A");

  assert.equal(response.statusCode, 400);
  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.match(response.headers["content-security-policy"], /object-src 'none'/);
  assert.equal(response.body, "Bad Request");
});

test("ignores an invalid Host header when parsing the request URL", async () => {
  const response = await get("/assets/app.js", { Host: "[" });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body, "console.log('ready');");
});

test("rejects a path that resolves outside the static root", async () => {
  const response = await get("/%2e%2e%2foutside-secret.txt");

  assert.equal(response.statusCode, 400);
  assert.notEqual(response.body, "must-not-be-served");
});

test("remains available after bad requests", async () => {
  const malformedResponse = await get("/%E0%A4%A");
  const traversalResponse = await get("/%2e%2e%2foutside-secret.txt");
  const healthyResponse = await get("/assets/app.js");

  assert.equal(malformedResponse.statusCode, 400);
  assert.equal(traversalResponse.statusCode, 400);
  assert.equal(healthyResponse.statusCode, 200);
  assert.equal(healthyResponse.body, "console.log('ready');");
});
