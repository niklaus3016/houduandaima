const express = require('express');
const router = express.Router();
const GoldLog = require('../models/GoldLog');
const UserGold = require('../models/UserGold');
const Employee = require('../models/Employee');
const authMiddleware = require('../middleware/auth');

// 获取北京时间
function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

// 格式化日期为 YYYY年MM月
function formatYearMonth(date) {
  const beijingDate = getBeijingDate(date);
  const year = beijingDate.getUTCFullYear();
  const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
  return `${year}年${month}月`;
}

// 格式化日期为 MM-DD
function formatMonthDay(date) {
  const beijingDate = getBeijingDate(date);
  const month = String(beijingDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijingDate.getUTCDate()).padStart(2, '0');
  return `${month}-${day}`;
}

// 获取用户收益详情
router.get('/:userId/earnings', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // 查找用户
    const userGold = await UserGold.findOne({ userId });
    if (!userGold) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    const employeeId = userGold.employeeId;
    
    // 用聚合查询一次性统计，避免拉取所有记录
    const aggregateResults = await GoldLog.aggregate([
      {
        $match: { userId }
      },
      {
        $project: {
          createTime: 1,
          gold: 1,
          // 添加北京时间字段
          beijingDate: {
            $add: ['$createTime', 8 * 60 * 60 * 1000]
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$beijingDate' },
            month: { $month: '$beijingDate' },
            day: { $dayOfMonth: '$beijingDate' }
          },
          totalGold: { $sum: '$gold' },
          watched: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.day': 1
        }
      }
    ]);
    
    if (aggregateResults.length === 0) {
      return res.json({
        success: true,
        data: {
          userId: employeeId,
          totalEarnings: 0,
          currentMonth: {
            month: formatYearMonth(new Date()),
            totalEarnings: 0,
            days: []
          },
          historyMonths: []
        }
      });
    }
    
    // 整理聚合结果
    const monthlyData = {};
    let totalGold = 0;
    
    aggregateResults.forEach(result => {
      const { year, month, day } = result._id;
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      const dayKey = `${monthKey}-${String(day).padStart(2, '0')}`;
      
      totalGold += result.totalGold;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          year,
          month,
          days: {}
        };
      }
      
      monthlyData[monthKey].days[dayKey] = {
        date: dayKey,
        earnings: result.totalGold / 1000,
        watched: result.watched
      };
    });
    
    const totalEarnings = parseFloat((totalGold / 1000).toFixed(2));
    
    // 获取当前月份
    const now = new Date();
    const beijingNow = getBeijingDate(now);
    const currentYear = beijingNow.getUTCFullYear();
    const currentMonth = beijingNow.getUTCMonth() + 1;
    const currentMonthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    
    // 构建当前月份数据
    let currentMonthData = {
      month: formatYearMonth(now),
      totalEarnings: 0,
      days: []
    };
    
    if (monthlyData[currentMonthKey]) {
      const monthInfo = monthlyData[currentMonthKey];
      const days = Object.values(monthInfo.days).map(day => ({
        date: formatMonthDay(new Date(day.date)),
        earnings: parseFloat(day.earnings.toFixed(2)),
        watched: day.watched
      }));
      
      // 按日期倒序排列
      days.sort((a, b) => {
        const dateA = new Date(`2026-${a.date}`);
        const dateB = new Date(`2026-${b.date}`);
        return dateB - dateA;
      });
      
      // 计算累计收益
      let cumulative = 0;
      // 先计算之前月份的总收益
      Object.keys(monthlyData).forEach(key => {
        if (key < currentMonthKey) {
          Object.values(monthlyData[key].days).forEach(day => {
            cumulative += day.earnings;
          });
        }
      });
      
      // 再按日期正序计算累计
      const sortedDays = [...days].reverse();
      sortedDays.forEach(day => {
        cumulative += day.earnings;
        day.cumulative = parseFloat(cumulative.toFixed(2));
      });
      
      // 再倒序回来
      sortedDays.reverse();
      
      currentMonthData = {
        month: formatYearMonth(now),
        totalEarnings: parseFloat(days.reduce((sum, d) => sum + d.earnings, 0).toFixed(2)),
        days: sortedDays
      };
    }
    
    // 构建历史月份数据（过去6个月，不含当前月）
    const historyMonths = [];
    const sortedMonthKeys = Object.keys(monthlyData)
      .filter(key => key !== currentMonthKey)
      .sort()
      .reverse()
      .slice(0, 6);
    
    sortedMonthKeys.forEach(key => {
      const monthInfo = monthlyData[key];
      const monthTotal = Object.values(monthInfo.days)
        .reduce((sum, day) => sum + day.earnings, 0);
      
      historyMonths.push({
        month: `${monthInfo.year}年${String(monthInfo.month).padStart(2, '0')}月`,
        totalEarnings: parseFloat(monthTotal.toFixed(2))
      });
    });
    
    res.json({
      success: true,
      data: {
        userId: employeeId,
        totalEarnings,
        currentMonth: currentMonthData,
        historyMonths
      }
    });
  } catch (error) {
    console.error('获取用户收益详情错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
