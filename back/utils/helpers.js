/**
 * 범용 헬퍼 유틸리티
 */

exports.sanitizeFilename = (name) => {
  return name.replace(/[^a-zA-Z0-9 _\-]/g, '').trim();
};

exports.asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
