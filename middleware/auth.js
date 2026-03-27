const { verifyToken } = require('../utils/auth');

// Auth middleware
const authMiddleware = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ success: false, message: '缺少认证令牌' });
    }
    
    // Extract token
    const token = authHeader.replace('Bearer ', '');
    
    // Verify token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ success: false, message: '无效的认证令牌' });
    }
    
    // Set user info in request
    req.user = decoded;
    console.log('认证成功，用户信息:', req.user);
    
    next();
  } catch (error) {
    console.error('认证错误:', error);
    res.status(401).json({ success: false, message: '认证失败' });
  }
};

module.exports = authMiddleware;