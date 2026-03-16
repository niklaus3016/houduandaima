const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');

// 健康检查接口
router.get('/', authMiddleware, async (req, res) => {
  try {
    // 检查数据库连接状态
    const dbState = mongoose.connection.readyState;
    
    if (dbState === 1) {
      res.json({
        success: true,
        status: 'healthy'
      });
    } else {
      res.json({
        success: true,
        status: 'unhealthy'
      });
    }
  } catch (error) {
    console.error('健康检查错误:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy'
    });
  }
});

module.exports = router;