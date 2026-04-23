const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// JWT secret key
const JWT_SECRET = 'your-secret-key';

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id.toString(), username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Hash password
const hashPassword = (password) => {
  return bcrypt.hashSync(password, 10);
};

// Compare password
const comparePassword = (password, hashedPassword) => {
  return bcrypt.compareSync(password, hashedPassword);
};

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword
};