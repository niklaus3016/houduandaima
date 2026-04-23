const express = require('express');
const router = express.Router();
const WeeklyTarget = require('../models/WeeklyTarget');
const authMiddleware = require('../middleware/auth');

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

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

// 获取某月的所有周（北京时间，周一为一周开始）
function getWeeksInMonth(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  let currentDate = new Date(firstDay);
  while (currentDate <= lastDay) {
    const beijingDate = new Date(currentDate.getTime() + 8 * 60 * 60 * 1000);
    const beijingYear = beijingDate.getFullYear();
    const firstDayOfYear = new Date(beijingYear, 0, 1);
    const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
    const daysToFirstMonday = (8 - dayOfWeek) % 7;
    const firstMonday = new Date(firstDayOfYear);
    firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);

    const diffTime = beijingDate - firstMonday;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(diffDays / 7) + 1;
    const week = `${beijingYear}-${weekNumber.toString().padStart(2, '0')}`;

    if (!weeks.includes(week)) {
      weeks.push(week);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return weeks;
}

// 获取本周目标任务
router.get('/get', async (req, res) => {
  try {
    const { week } = req.query;
    const targetWeek = week || getCurrentWeek();
    
    const weeklyTarget = await WeeklyTarget.findOne({ week: targetWeek });
    
    res.json({
      success: true,
      data: {
        week: targetWeek,
        targetCount: weeklyTarget ? weeklyTarget.targetCount : 0,
        bonusCoins: weeklyTarget ? weeklyTarget.bonusGold : 0
      }
    });
  } catch (error) {
    console.error('获取周目标任务错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取整月周目标数据
router.get('/month', async (req, res) => {
  try {
    const { month } = req.query;
    
    if (!month) {
      return res.status(400).json({ success: false, message: '缺少月份参数' });
    }
    
    const [year, monthNum] = month.split('-').map(Number);
    const weeks = getWeeksInMonth(year, monthNum);
    
    const weeklyTargets = await WeeklyTarget.find({ week: { $in: weeks } }).sort({ week: 1 });
    
    const targetMap = {};
    weeklyTargets.forEach(item => {
      targetMap[item.week] = {
        targetCount: item.targetCount,
        bonusCoins: item.bonusGold || 0
      };
    });
    
    const data = weeks.map(week => ({
      week: week,
      targetCount: targetMap[week] ? targetMap[week].targetCount : 0,
      bonusCoins: targetMap[week] ? targetMap[week].bonusCoins : 0
    }));
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('获取整月周目标数据错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 设置周目标任务
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { week, targetCount, bonusCoins } = req.body;

    if (!week) {
      return res.status(400).json({ success: false, message: '缺少周参数' });
    }

    const [year, weekNum] = week.split('-');
    const adjustedWeekNum = parseInt(weekNum) - 1;
    const adjustedWeek = `${year}-${adjustedWeekNum.toString().padStart(2, '0')}`;

    const weeklyTarget = await WeeklyTarget.findOneAndUpdate(
      { week: adjustedWeek },
      {
        targetCount: targetCount || 0,
        bonusGold: bonusCoins || 0,
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: '设置成功',
      data: {
        week: weeklyTarget.week,
        targetCount: weeklyTarget.targetCount,
        bonusCoins: weeklyTarget.bonusGold
      }
    });
  } catch (error) {
    console.error('设置周目标任务错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
