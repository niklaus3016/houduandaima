const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const DailyTarget = require('../models/DailyTarget');
const DailyBonusClaim = require('../models/DailyBonusClaim');
const GoldLog = require('../models/GoldLog');
const { getBeijingDate, getBeijingStartOfDay, getBeijingDateString } = require('../utils/date');

// 领取额外金币
router.post('/claim', async (req, res) => {
  try {
    const { userId, employeeId } = req.body;
    
    if (!userId || !employeeId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 获取今日日期（北京时间）
    const beijingNow = getBeijingDate();
    const today = beijingNow.toISOString().split('T')[0];
    
    // 查询今日目标任务
    const dailyTarget = await DailyTarget.findOne({ date: today });
    
    if (!dailyTarget) {
      return res.status(400).json({ success: false, message: '今日未设置目标任务' });
    }
    
    if (dailyTarget.bonusGold <= 0) {
      return res.status(400).json({ success: false, message: '今日未设置额外金币奖励' });
    }
    
    // 查询用户
    const userGold = await UserGold.findOne({ userId });
    
    if (!userGold) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 检查用户今日是否已领取
    if (userGold.lastClaimedBonusDate === today) {
      return res.status(400).json({ success: false, message: '今日奖励已领取' });
    }
    
    // 计算用户今日金币收益（北京时间）
    const todayStart = getBeijingStartOfDay(beijingNow);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    const todayGoldLogs = await GoldLog.find({
      userId: userId,
      createTime: { $gte: todayStart, $lt: todayEnd }
    });
    
    const todayGold = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
    
    // 检查今日金币是否达到目标
    if (todayGold < dailyTarget.target) {
      return res.status(400).json({ 
        success: false, 
        message: '今日金币未达到目标',
        data: {
          todayGold,
          target: dailyTarget.target,
          needMore: dailyTarget.target - todayGold
        }
      });
    }
    
    // 发放额外金币
    await UserGold.updateOne(
      { userId },
      { 
        $inc: { currentMonthGold: dailyTarget.bonusGold },
        $set: { lastClaimedBonusDate: today }
      }
    );
    
    // 创建金币记录
    const goldLog = new GoldLog({
      userId,
      employeeId,
      gold: dailyTarget.bonusGold,
      ecpm: 0,
      createTime: new Date()
    });
    
    await goldLog.save();
    
    // 记录用户已领取状态
    const bonusClaim = new DailyBonusClaim({
      userId,
      employeeId,
      date: today,
      bonusGold: dailyTarget.bonusGold,
      claimedAt: new Date()
    });
    
    await bonusClaim.save();
    
    // 获取更新后的用户金币
    const updatedUser = await UserGold.findOne({ userId });
    
    res.json({
      success: true,
      message: '领取成功',
      data: {
        gold: dailyTarget.bonusGold,
        currentMonthGold: updatedUser.currentMonthGold
      }
    });
  } catch (error) {
    console.error('领取额外金币错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;