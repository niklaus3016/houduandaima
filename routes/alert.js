const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const authMiddleware = require('../middleware/auth');

// 获取异常列表
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const { type, status } = req.query;
    
    // 构建查询条件
    let query = {};
    if (type) {
      query.type = type;
    }
    if (status) {
      query.status = status;
    }
    
    // 获取异常列表
    const alerts = await Alert.find(query).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('获取异常列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 处理异常
router.post('/handle', authMiddleware, async (req, res) => {
  try {
    const { id, status } = req.body;
    
    if (!id || !status) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 更新异常状态
    const alert = await Alert.findById(id);
    
    if (!alert) {
      return res.status(404).json({ success: false, message: '异常记录不存在' });
    }
    
    alert.status = status;
    alert.updatedAt = new Date();
    await alert.save();
    
    res.json({
      success: true,
      message: '异常处理成功',
      data: alert
    });
  } catch (error) {
    console.error('处理异常错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;