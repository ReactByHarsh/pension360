import archiver from "archiver";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
const root = process.cwd(),
  outputDir = path.resolve(root, "..", "deliverables");
await mkdir(outputDir, { recursive: true });
const target = path.join(
  outputDir,
  process.argv.includes("--workflows")
    ? "Pension360_Node_Workflows_2026-10-06.zip"
    : process.argv.includes("--original-ui")
    ? "Pension360_Node_Express_PostgreSQL18_6_Original_UI.zip"
    : process.argv.includes("--sync-demo")
    ? "Pension360_Node_Express_PostgreSQL18_6_Sync_Demo.zip"
    : process.argv.includes("--role-workspaces")
      ? "Pension360_Node_Express_PostgreSQL18_6_Role_Workspaces.zip"
      : process.argv.includes("--roles-demo")
        ? "Pension360_Node_Express_PostgreSQL18_6_Roles_Demo.zip"
        : process.argv.includes("--demo")
          ? "Pension360_Node_Express_PostgreSQL18_6_Copilot_Demo.zip"
          : "Pension360_Node_Express_PostgreSQL18_6.zip",
);
const stream = createWriteStream(target),
  archive = archiver("zip", { zlib: { level: 9 } });
const done = new Promise((resolve, reject) => {
  stream.on("close", resolve);
  stream.on("error", reject);
  archive.on("error", reject);
});
archive.pipe(stream);
archive.glob(
  "**/*",
  {
    cwd: root,
    dot: true,
    ignore: [
      "node_modules/**",
      "**/node_modules/**",
      ".local/**",
      ".git/**",
      ".env*",
      "**/.env*",
      "**/*.zip",
      "**/dist/**",
      "test-results/**",
      "verification/**",
      "**/test-results/**",
      "uploads/**",
      "coverage/**",
      "deploy/trusted-ingress.conf",
      "IMPLEMENTATION_CONTRACT.md",
    ],
  },
  { prefix: "pension360-node" },
);
for (const file of [
  ".env.example",
  ".env.production.example",
  "apps/web/.env.example",
])
  archive.file(path.join(root, file), { name: `pension360-node/${file}` });
await archive.finalize();
await done;
const bytes = await readFile(target);
const sha = createHash("sha256").update(bytes).digest("hex");
await writeFile(`${target}.sha256`, `${sha}  ${path.basename(target)}\n`);
console.log(
  `Created ${path.basename(target)} (${bytes.length} bytes). SHA256: ${sha}`,
);
