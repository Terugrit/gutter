import { spawn, spawnSync } from "node:child_process";
import { loadHomeAssistantEnvironment } from "./home-assistant-options.mjs";

const homeAssistantEnvironment = await loadHomeAssistantEnvironment();
const environment = {
  ...process.env,
  ...homeAssistantEnvironment,
  GUTTER_DB_PATH: "/data/app.db",
};

if (Object.keys(homeAssistantEnvironment).length > 0) {
  console.log("Loaded configuration from Home Assistant options");
}

const migration = spawnSync("pnpm", ["db:migrate"], {
  env: environment,
  stdio: "inherit",
});

if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

const server = spawn(process.execPath, [".next/standalone/server.js"], {
  env: environment,
  stdio: "inherit",
});

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopping = true;
    server.kill(signal);
  });
}

server.on("error", (error) => {
  console.error("Unable to start Gutter", error);
  process.exit(1);
});
server.on("exit", (code, signal) => {
  process.exit(code ?? (stopping && signal ? 0 : 1));
});
