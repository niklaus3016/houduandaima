const express = require('express');
const router = express.Router();
const DailyTarget = require('../models/DailyTarget');
const authMiddleware = require('../middleware/auth');

function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 获取某日目标任务
router.get('/get', async (req, res) => {
  try {
    const { date } = req.query;
    
    const beijingNow = getBeijingDate();
    const targetDate = date || beijingNow.toISOString().split('T')[0];
    
    const dailyTarget = await DailyTarget.findOne({ date: targetDate });
    
    res.json({
      success: true,
      data: {
        date: targetDate,
        targetCoins: dailyTarget ? dailyTarget.target : 0,
        bonusCoins: dailyTarget ? dailyTarget.bonusGold : 0
      }
    });
  } catch (error) {
    console.error('获取目标任务错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取整月目标数据
router.get('/month', async (req, res) => {
  try {
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ success: false, message: '缺少月份参数' });
    }
    
    const startDate = `${month}-01`;
    const endDate = `${month}-31`;
    
    const dailyTargets = await DailyTarget.find({
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: 1 });
    
    const data = dailyTargets.map(item => ({
      date: item.date,
      targetCoins: item.target,
      bonusCoins: item.bonusGold || 0
    }));
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('获取整月目标数据错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 设置单日目标（新接口）
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { date, targetCoins, bonusCoins } = req.body;
    
    if (!date) {
      return res.status(400).json({ success: false, message: '缺少日期参数' });
    }
    
    const dailyTarget = await DailyTarget.findOneAndUpdate(
      { date: date },
      {
        target: targetCoins || 0,
        bonusGold: bonusCoins || 0,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    res.json({
      success: true,
      message: '设置成功',
      data: {
        date: dailyTarget.date,
        targetCoins: dailyTarget.target,
        bonusCoins: dailyTarget.bonusGold
      }
    });
  } catch (error) {
    console.error('设置目标任务错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 设置某日目标任务（旧接口，保留兼容）
router.post('/set', authMiddleware, async (req, res) => {
  try {
    const { date, target, bonusGold } = req.body;
    
    if (!date || typeof target === 'undefined') {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    const dailyTarget = await DailyTarget.findOneAndUpdate(
      { date: date },
      {
        target: target,
        bonusGold: bonusGold || 0,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    res.json({
      success: true,
      message: '目标任务设置成功',
      data: dailyTarget
    });
  } catch (error) {
    console.error('设置目标任务错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
