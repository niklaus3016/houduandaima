const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const GoldDeduction = require('../models/GoldDeduction');
const SystemConfig = require('../models/SystemConfig');
const authMiddleware = require('../middleware/auth');

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 上报ECPM发金币
router.post('/reward', async (req, res) => {
  try {
    const { userId, employeeId, ecpm, slotId, deviceId } = req.body;
    
    if (!userId || !employeeId || !ecpm || !deviceId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 获取分成比例（默认50%）
    const config = await SystemConfig.findOne({ key: 'commissionRate' });
    const commissionRate = config ? config.value : 0.5;
    
    // 计算金币（ECPM * 分成比例）
    const gold = ecpm * commissionRate;
    
    // 更新用户金币
    let userGold = await UserGold.findOne({ userId });
    
    if (!userGold) {
      // 如果用户不存在，创建新记录
      userGold = new UserGold({
        userId,
        employeeId,
        currentMonthGold: gold,
        lastMonthGold: 0
      });
    } else {
      // 更新当月金币
      userGold.currentMonthGold += gold;
    }
    
    await userGold.save();
    
    // 记录金币日志（使用当前UTC时间，但确保在查询时正确处理）
    const goldLog = new GoldLog({
      userId,
      employeeId,
      deviceId,
      ecpm,
      gold,
      slotId: slotId || '',
      createTime: new Date()
    });
    
    await goldLog.save();
    
    res.json({ success: true, message: '金币发放成功', data: { gold, currentMonthGold: userGold.currentMonthGold } });
  } catch (error) {
    console.error('发金币错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取金币记录
router.get('/log', async (req, res) => {
  try {
    const { userId, deviceId, limit = 200 } = req.query;
    
    if (!userId || !deviceId) {
      return res.status(400).json({ success: false, message: '缺少userId或deviceId参数' });
    }
    
    // 确保limit是有效的数字，最大限制为10000
    const limitNum = Math.min(parseInt(limit) || 200, 10000);
    
    // 获取金币记录，支持自定义 limit 参数
    const goldLogs = await GoldLog.find({ userId, deviceId })
      .sort({ createTime: -1 })
      .limit(limitNum);
    
    res.json({ success: true, data: goldLogs, limit: limitNum });
  } catch (error) {
    console.error('获取金币记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 执行金币核减操作
router.post('/deduct', authMiddleware, async (req, res) => {
  try {
    const { deductionRate } = req.body;
    const operator = req.admin?.username || 'admin';
    
    if (deductionRate === undefined || deductionRate < 0 || deductionRate > 1) {
      return res.status(400).json({ success: false, message: '核减率无效，请输入0-1之间的小数' });
    }
    
    // 获取所有有上月金币的用户
    const users = await UserGold.find({ lastMonthGold: { $gt: 0 } });
    const affectedUsers = users.length;
    
    // 批量更新用户的lastMonthGold
    const bulkOps = users.map(user => ({
      updateOne: {
        filter: { _id: user._id },
        update: { $set: { lastMonthGold: Math.floor(user.lastMonthGold * (1 - deductionRate)) } }
      }
    }));
    
    if (bulkOps.length > 0) {
      await UserGold.bulkWrite(bulkOps);
    }
    
    // 记录核减操作
    const deductionRecord = new GoldDeduction({
      deductionRate,
      affectedUsers,
      operator,
      status: 'success',
      remark: `核减率${deductionRate * 100}%`
    });
    await deductionRecord.save();
    
    res.json({
      success: true,
      message: '核减成功',
      data: {
        affectedUsers,
        deductionRate
      }
    });
  } catch (error) {
    console.error('金币核减错误:', error);
    
    // 记录失败的操作
    const deductionRecord = new GoldDeduction({
      deductionRate: req.body.deductionRate || 0,
      affectedUsers: 0,
      operator: req.admin?.username || 'admin',
      status: 'failed',
      remark: error.message
    });
    await deductionRecord.save();
    
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取今日金币统计（全局）- 使用北京时间
router.get('/today-stats', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: '缺少userId参数' });
    }
    
    // 获取北京时间今日开始
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayBeijing = new Date(beijingNow);
    todayBeijing.setHours(0, 0, 0, 0);
    const todayStart = new Date(todayBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 查询今日所有设备的金币记录（北京时间）
    const logs = await GoldLog.find({
      userId,
      createTime: { $gte: todayStart }
    });
    
    // 统计金币总数和记录数
    const todayCoins = logs.reduce((sum, log) => sum + (log.gold || 0), 0);
    const todayRecordCount = logs.length;
    
    res.json({
      success: true,
      data: {
        todayCoins,
        todayRecordCount
      }
    });
  } catch (error) {
    console.error('获取今日金币统计错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取核减历史记录
router.get('/deduct/history', async (req, res) => {
  try {
    const records = await GoldDeduction.find()
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('获取核减历史错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
