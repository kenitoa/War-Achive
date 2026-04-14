module.exports = (err, _req, res, _next) => {
  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  if (status === 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
};
