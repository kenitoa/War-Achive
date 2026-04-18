const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email) && email.length <= 255;
}

function isValidPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 128) return false;
  // 최소 하나의 대문자, 소문자, 숫자, 특수문자 포함
  return /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
}

function isValidUsername(name) {
  return typeof name === 'string' && name.length >= 2 && name.length <= 50;
}

function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLen)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

module.exports = { isValidEmail, isValidPassword, isValidUsername, sanitizeString };
