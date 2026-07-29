import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const configPath = new URL("../dist/server/wrangler.json", import.meta.url);
const config = JSON.parse(readFileSync(configPath, "utf8"));
const databases = JSON.parse(
  execFileSync(process.execPath, [wrangler, "d1", "list", "--json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }),
);

for (const binding of config.d1_databases || []) {
  const database = databases.find(
    (candidate) => candidate.name === binding.database_name,
  );
  if (!database?.uuid) {
    throw new Error(`Cloudflare D1 database not found: ${binding.database_name}`);
  }
  binding.database_id = database.uuid;
}

writeFileSync(configPath, `${JSON.stringify(config)}\n`);
console.log("Prepared the compiled Worker for production deployment.");
