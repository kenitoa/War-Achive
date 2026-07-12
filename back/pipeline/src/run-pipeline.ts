import { collectSourceCycle } from "./collection.js";

const result = await collectSourceCycle();
console.log(result.collected
  ? `pipeline complete: swept ${result.topicIds.length} topics, ${result.attemptedSources} sources, ${result.totalRecords} total records`
  : "pipeline complete: no configured topics");
