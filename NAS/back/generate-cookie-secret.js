const crypto = require("node:crypto");

function generateCookieSecret(byteLength = 64) {
  if (!Number.isInteger(byteLength) || byteLength < 32) {
    throw new Error("byteLength must be an integer greater than or equal to 32");
  }
  return crypto.randomBytes(byteLength).toString("base64url");
}

if (require.main === module) {
  const byteLength = Number(process.argv[2] || 64);
  console.log(generateCookieSecret(byteLength));
}

module.exports = { generateCookieSecret };
