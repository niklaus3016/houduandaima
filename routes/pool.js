const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');
const RedPacket = require('../models/RedPacket');
const LotteryTicket = require('../models/LotteryTicket');
const LotteryHistory = require('../models/LotteryHistory');

// 获取红包池余额
router.get('/status', async (req, res) => {
  try {
    let redPacketPool = await SystemConfig.findOne({ key: 'redPacketPool' });
    if (!redPacketPool) {
      redPacketPool = new SystemConfig({ key: 'redPacketPool', value: 1000 });
      await redPacketPool.save();
    }
    const lotteryPool = await SystemConfig.findOne({ key: 'lotteryPool' }) || { value: 0 };
    
    res.json({
      success: true,
      message: '获取成功',
      data: {
        redPacketPool: redPacketPool.value,
        lotteryPool: lotteryPool.value
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败', error: error.message });
  }
});

// 发放红包
router.post('/red-packet/send', async (req, res) => {
  try {
    const { userId, employeeId } = req.body;
    
    // 获取当前红包池余额
    let redPacketPoolConfig = await SystemConfig.findOne({ key: 'redPacketPool' });
    if (!redPacketPoolConfig) {
      redPacketPoolConfig = new SystemConfig({ key: 'redPacketPool', value: 1000 });
      await redPacketPoolConfig.save();
    }
    
    const currentBalance = redPacketPoolConfig.value;
    
    // 检查余额是否大于0
    if (currentBalance <= 0) {
      return res.json({
        success: false,
        message: '红包池余额不足',
        data: {
          amount: 0
        }
      });
    }
    
    // 计算发放金额（红包池5%）
    const amount = Math.floor(currentBalance * 0.05);
    const newBalance = currentBalance - amount;
    
    // 更新红包池余额
    redPacketPoolConfig.value = newBalance;
    await redPacketPoolConfig.save();
    
    // 记录红包发放
    const redPacket = new RedPacket({
      userId,
      employeeId,
      amount,
      poolBalanceAfter: newBalance
    });
    await redPacket.save();
    
    res.json({
      success: true,
      message: '发放成功',
      data: {
        amount,
        redPacketPool: newBalance
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '发放失败', error: error.message });
  }
});

// 记录广告观看（用于奖券生成）
router.post('/ad/view-record', async (req, res) => {
  try {
    const { userId, employeeId } = req.body;
    
    // 获取用户广告观看次数
    let adViewCountConfig = await SystemConfig.findOne({ key: `adViewCount_${userId}` });
    if (!adViewCountConfig) {
      adViewCountConfig = new SystemConfig({ key: `adViewCount_${userId}`, value: 0 });
      await adViewCountConfig.save();
    }
    
    // 增加观看次数
    adViewCountConfig.value += 1;
    await adViewCountConfig.save();
    
    let ticketGenerated = false;
    let ticketNumber = null;
    let issueNumber = null;
    
    // 获取彩票设置
    const LotterySettings = require('../models/LotterySettings');
    let settings = await LotterySettings.findOne();
    if (!settings) {
      settings = new LotterySettings();
      await settings.save();
    }
    
    // 检查是否达到奖券生成阈值
    if (adViewCountConfig.value % settings.adCountThreshold === 0) {
      ticketGenerated = true;
      
      // 生成期号
      const LotteryHistory = require('../models/LotteryHistory');
      const latestHistory = await LotteryHistory.findOne(
        { issueNumber: { $regex: /^\d+$/ } }
      ).sort({ drawTime: -1 });
      
      if (latestHistory) {
        const latestIssueNumber = parseInt(latestHistory.issueNumber);
        issueNumber = (latestIssueNumber + 1).toString();
      } else {
        issueNumber = '1';
      }
      
      // 生成6位随机数字奖券号码
      ticketNumber = Math.floor(100000 + Math.random() * 900000).toString();
      
      // 计算有效期（下一次开奖时间）
      const validUntil = new Date();
      const [hours, minutes] = settings.drawTime.split(':').map(Number);
      validUntil.setHours(hours, minutes, 0, 0);
      
      // 如果当前时间已经过了今天的开奖时间，则设置为明天的开奖时间
      if (validUntil <= new Date()) {
        validUntil.setDate(validUntil.getDate() + 1);
      }
      
      // 创建奖券
      const ticket = new LotteryTicket({
        ticketNumber,
        userId,
        employeeId,
        status: '有效',
        issueNumber,
        validUntil
      });
      await ticket.save();
    }
    
    res.json({
      success: true,
      message: '记录成功',
      data: {
        ticketGenerated,
        ticketNumber,
        issueNumber
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '记录失败', error: error.message });
  }
});

// 获取用户奖券
router.get('/lottery/tickets', async (req, res) => {
  try {
    const { employeeId } = req.query;
    
    if (!employeeId) {
      return res.status(400).json({ success: false, message: '缺少employeeId参数' });
    }
    
    const tickets = await LotteryTicket.find({ employeeId }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      message: '获取成功',
      data: tickets
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败', error: error.message });
  }
});

// 获取往期开奖记录
router.get('/lottery/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const history = await LotteryHistory.find().sort({ date: -1 }).limit(limit);
    
    res.json({
      success: true,
      message: '获取成功',
      data: history
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取失败', error: error.message });
  }
});

module.exports = router;