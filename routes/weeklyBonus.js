const express = require('express');
const router = express.Router();
const WeeklyTarget = require('../models/WeeklyTarget');
const WeeklyBonusClaim = require('../models/WeeklyBonusClaim');
const GoldLog = require('../models/GoldLog');
const Employee = require('../models/Employee');
const UserGold = require('../models/UserGold');
const authMiddleware = require('../middleware/auth');
const { getBeijingDate } = require('../utils/date');

// 获取当前周（YYYY-WW 格式，北京时间，周一为一周开始）
function getCurrentWeek() {
  const now = getBeijingDate();
  const year = now.getFullYear();
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
  
  const diffTime = now - firstMonday;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weekNumber = Math.floor(diffDays / 7) + 1;
  return `${year}-${weekNumber.toString().padStart(2, '0')}`;
}

// 获取周开始和结束时间（北京时间，周一为一周开始）
function getWeekRange(week) {
  const [year, weekNumber] = week.split('-').map(Number);
  const firstDayOfYear = new Date(year, 0, 1);
  const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
  const daysToFirstMonday = (8 - dayOfWeek) % 7;
  const firstMonday = new Date(firstDayOfYear);
  firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);
  
  const weekStart = new Date(firstMonday);
  weekStart.setDate(weekStart.getDate() + (weekNumber - 1) * 7);
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(0, 0, 0, 0);
  
  // 转换为UTC时间
  return {
    start: new Date(weekStart.getTime() - 8 * 60 * 60 * 1000),
    end: new Date(weekEnd.getTime() - 8 * 60 * 60 * 1000)
  };
}

// 领取周奖励
router.post('/claim', authMiddleware, async (req, res) => {
  try {
    const { userId, username } = req.user;
    const employee = await Employee.findOne({ employeeId: username });
    
    if (!employee) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 从UserGold表中获取正确的userId
    const userGold = await UserGold.findOne({ employeeId: username });
    if (!userGold) {
      return res.status(404).json({ success: false, message: '用户金币记录不存在' });
    }
    
    const currentWeek = getCurrentWeek();
    
    // 检查是否已领取
    const existingClaim = await WeeklyBonusClaim.findOne({
      userId: userGold.userId,
      employeeId: username,
      week: currentWeek
    });
    
    if (existingClaim) {
      return res.status(400).json({ success: false, message: '本周奖励已领取' });
    }
    
    // 获取本周目标
    const weeklyTarget = await WeeklyTarget.findOne({ week: currentWeek });
    
    if (!weeklyTarget || weeklyTarget.targetCount === 0) {
      return res.status(400).json({ success: false, message: '本周无目标任务' });
    }
    
    // 计算本周收益条数（使用countDocuments避免全量拉取）
    const weekRange = getWeekRange(currentWeek);
    const currentCount = await GoldLog.countDocuments({
      userId: userGold.userId,
      createTime: {
        $gte: weekRange.start,
        $lt: weekRange.end
      }
    });
    
    if (currentCount < weeklyTarget.targetCount) {
      return res.status(400).json({ success: false, message: '未达到目标条数' });
    }
    
    // 发放奖励
    const bonusGold = weeklyTarget.bonusGold || 0;
    
    // 记录领取
    await new WeeklyBonusClaim({
      userId: userGold.userId,
      employeeId: username,
      week: currentWeek,
      bonusGold: bonusGold
    }).save();
    
    // 增加用户金币
    userGold.currentMonthGold = (userGold.currentMonthGold || 0) + bonusGold;
    await userGold.save();
    
    // 记录到GoldLog表
    await new GoldLog({
      userId: userGold.userId,
      employeeId: username,
      gold: bonusGold,
      type: 'weekly_bonus',
      createTime: new Date()
    }).save();
    
    res.json({
      success: true,
      message: '领取成功',
      data: {
        bonusCoins: bonusGold
      }
    });
  } catch (error) {
    console.error('领取周奖励错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取周目标进度
router.get('/progress', authMiddleware, async (req, res) => {
  try {
    const { username } = req.user;
    const employee = await Employee.findOne({ employeeId: username });
    
    if (!employee) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 从UserGold表中获取正确的userId
    const userGold = await UserGold.findOne({ employeeId: username });
    if (!userGold) {
      return res.status(404).json({ success: false, message: '用户金币记录不存在' });
    }
    
    const currentWeek = getCurrentWeek();
    
    // 获取本周目标
    const weeklyTarget = await WeeklyTarget.findOne({ week: currentWeek });
    
    if (!weeklyTarget) {
      return res.json({
        success: true,
        data: {
          week: currentWeek,
          targetCount: 0,
          currentCount: 0,
          progress: 0,
          bonusCoins: 0,
          isClaimed: false
        }
      });
    }
    
    // 计算本周收益条数（使用countDocuments避免全量拉取）
    const weekRange = getWeekRange(currentWeek);
    const currentCount = await GoldLog.countDocuments({
      userId: userGold.userId,
      createTime: {
        $gte: weekRange.start,
        $lt: weekRange.end
      }
    });
    const progress = weeklyTarget.targetCount > 0 ? Math.min(Math.round((currentCount / weeklyTarget.targetCount) * 100), 100) : 0;
    
    // 检查是否已领取
    const existingClaim = await WeeklyBonusClaim.findOne({
      userId: userGold.userId,
      employeeId: username,
      week: currentWeek
    });
    
    res.json({
      success: true,
      data: {
        week: currentWeek,
        targetCount: weeklyTarget.targetCount,
        currentCount: currentCount,
        progress: progress,
        bonusCoins: weeklyTarget.bonusGold || 0,
        isClaimed: !!existingClaim
      }
    });
  } catch (error) {
    console.error('获取周目标进度错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
