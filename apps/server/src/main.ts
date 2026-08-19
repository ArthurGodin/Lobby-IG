import { fileURLToPath } from "node:url";
import { createCampusServer } from "./campusServer.js";
import { createIdentityService } from "./identity.js";
import { createMediaAccessProviderFromEnv } from "./mediaAccess.js";

loadLocalEnvironment();

const port = Number.parseInt(process.env.CAMPUS_SERVER_PORT ?? "2567", 10);
const campusServer = createCampusServer({
  mediaAccessProvider: createMediaAccessProviderFromEnv(),
  identityService: createIdentityService(),
});

const runningServer = await campusServer.listen(port);
console.log(`Inforgeneses Campus server listening on ${runningServer.websocketUrl}`);

async function shutdown(): Promise<void> {
  await campusServer.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

function loadLocalEnvironment(): void {
  const envPath = fileURLToPath(new URL("../../../.env", import.meta.url));

  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
