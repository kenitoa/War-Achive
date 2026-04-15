const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email) && email.length <= 255;
}

function isValidPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 128;
}

function isValidUsername(name) {
  return typeof name === 'string' && name.length >= 2 && name.length <= 50;
}

function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLen).trim();
}

module.exports = { isValidEmail, isValidPassword, isValidUsername, sanitizeString };
