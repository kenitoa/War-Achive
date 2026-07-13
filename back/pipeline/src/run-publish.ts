import { publishNextRecord } from "./publication.js";

const publication = await publishNextRecord();

console.log(JSON.stringify({
  mode: "publish-once",
  publication
}, null, 2));
