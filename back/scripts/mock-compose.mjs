const args = process.argv.slice(2);

if (args.join(" ") === "compose version") {
  console.log("Docker Compose version v2.99.0-virtual");
  process.exit(0);
}

console.error(`unsupported virtual compose command: ${args.join(" ")}`);
process.exit(1);
