const jwt = require('jsonwebtoken');
const config = require('../config');

function generateToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    algorithm: 'HS256',
    expiresIn: config.jwt.expiresIn
  });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret, {
    algorithms: ['HS256']
  });
}

module.exports = { generateToken, verifyToken };
