import { createCampusServer } from "./campusServer.js";

const port = Number.parseInt(process.env.CAMPUS_SERVER_PORT ?? "2567", 10);
const campusServer = createCampusServer();

const runningServer = await campusServer.listen(port);
console.log(`Inforgeneses Campus server listening on ${runningServer.websocketUrl}`);

async function shutdown(): Promise<void> {
  await campusServer.close();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
