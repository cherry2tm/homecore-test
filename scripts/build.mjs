import { cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await rm(new URL("../dist", import.meta.url), { recursive: true, force: true });

const result = spawnSync("tsc", ["-p", "tsconfig.json"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8",
  shell: process.platform === "win32"
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

await mkdir(new URL("../dist/assets", import.meta.url), { recursive: true });
await cp(new URL("../public/index.html", import.meta.url), new URL("../dist/index.html", import.meta.url));
await cp(new URL("../public/styles.css", import.meta.url), new URL("../dist/assets/styles.css", import.meta.url));
await cp(
  new URL("../node_modules/lucide/dist/umd/lucide.min.js", import.meta.url),
  new URL("../dist/assets/lucide.min.js", import.meta.url)
);
console.log("Built dist/index.html and dist/assets (app, styles, lucide)");
