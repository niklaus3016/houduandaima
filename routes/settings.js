const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');
const authMiddleware = require('../middleware/auth');

// 获取提现开关状态
router.get('/withdraw-status', async (req, res) => {
  try {
    const config = await SystemConfig.findOne({ key: 'withdraw_enabled' });
    
    res.json({
      success: true,
      enabled: config ? config.value : true
    });
  } catch (error) {
    console.error('获取提现开关状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 设置提现开关状态
router.post('/withdraw-status', authMiddleware, async (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, message: '参数错误' });
    }
    
    await SystemConfig.findOneAndUpdate(
      { key: 'withdraw_enabled' },
      { value: enabled, updatedAt: new Date() },
      { upsert: true }
    );
    
    res.json({
      success: true,
      message: '设置成功',
      enabled
    });
  } catch (error) {
    console.error('设置提现开关状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取分成比例设置
router.get('/commission-rate', async (req, res) => {
  try {
    const config = await SystemConfig.findOne({ key: 'commissionRate' });
    
    res.json({
      success: true,
      rate: config ? config.value : 0.5 // 默认50%
    });
  } catch (error) {
    console.error('获取分成比例错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 设置分成比例
router.post('/commission-rate', authMiddleware, async (req, res) => {
  try {
    const { rate } = req.body;
    
    if (typeof rate !== 'number' || rate < 0 || rate > 1) {
      return res.status(400).json({ success: false, message: '分成比例必须在0-1之间' });
    }
    
    await SystemConfig.findOneAndUpdate(
      { key: 'commissionRate' },
      { value: rate, updatedAt: new Date() },
      { upsert: true }
    );
    
    res.json({
      success: true,
      message: '设置成功',
      rate
    });
  } catch (error) {
    console.error('设置分成比例错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
