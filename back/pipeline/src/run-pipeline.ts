import { collectNextTopic } from "./collection.js";

const result = await collectNextTopic();
console.log(result.collected
  ? `pipeline complete: collected ${result.topicId}, ${result.totalRecords} total records`
  : "pipeline complete: no pending topics");
