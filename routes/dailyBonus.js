const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const DailyTarget = require('../models/DailyTarget');
const DailyBonusClaim = require('../models/DailyBonusClaim');
const GoldLog = require('../models/GoldLog');

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 获取北京时间的当天开始（返回UTC时间）
// 参数date已经是北京时间（通过getBeijingDate获取）
function getBeijingStartOfDay(beijingTime) {
  // 获取北京时间的年月日
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate();
  // 创建北京时间当天00:00:00对应的UTC时间
  // 先创建该日期的UTC时间00:00:00，然后减去8小时得到北京时间00:00:00对应的UTC时间
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

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