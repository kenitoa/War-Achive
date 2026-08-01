import { fileURLToPath } from "node:url";

process.env.WAR_ARCHIVE_DATA_ROOT ??= fileURLToPath(new URL("../../.local-data", import.meta.url));
process.env.WAR_ARCHIVE_FRONT_ARCHIVE_DIR ??= fileURLToPath(new URL("../../../front/web/content/archive", import.meta.url));
process.env.PROCESSING_DELAY_MS ??= "0";

const { collectSourceCycle } = await import("./collection.js");
const { publishNextRecord } = await import("./publication.js");

const collection = await collectSourceCycle();
const publication = await publishNextRecord();

console.log(JSON.stringify({
  mode: "local-sync",
  dataRoot: process.env.WAR_ARCHIVE_DATA_ROOT,
  frontArchiveDir: process.env.WAR_ARCHIVE_FRONT_ARCHIVE_DIR,
  collection,
  publication
}, null, 2));
