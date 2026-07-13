import { rollbackLastPublication } from "./publication.js";

const entryId = process.argv[2];
const result = await rollbackLastPublication(entryId);
console.log(JSON.stringify({
  mode: "rollback",
  ...result
}, null, 2));
