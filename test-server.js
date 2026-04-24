const express = require('express');
const app = express();
const GoldLog = require('./models/GoldLog');
const WeeklyTarget = require('./models/WeeklyTarget');

app.use(express.json());

// 模拟user.js中的函数
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

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

// 测试接口
app.get('/test-info', async (req, res) => {
  try {
    const { userId, employeeId } = req.query;
    
    console.log('=== 请求参数 ===');
    console.log('userId:', userId);
    console.log('employeeId:', employeeId);
    console.log('employeeId类型:', typeof employeeId);
    
    const currentWeek = getCurrentWeek();
    console.log('当前周:', currentWeek);
    
    const weeklyTarget = await WeeklyTarget.findOne({ week: currentWeek });
    console.log('weeklyTarget:', weeklyTarget);
    
    let currentCount = 0;
    if (weeklyTarget && weeklyTarget.targetCount > 0) {
      const weekRange = getWeekRange(currentWeek);
      console.log('本周开始:', weekRange.start.toISOString());
      console.log('本周结束:', weekRange.end.toISOString());
      
      currentCount = await GoldLog.countDocuments({
        employeeId: employeeId,
        createTime: {
          $gte: weekRange.start,
          $lt: weekRange.end
        }
      });
      console.log('计算的currentCount:', currentCount);
    }
    
    res.json({
      success: true,
      data: {
        userId: userId,
        employeeId: employeeId,
        weeklyTarget: weeklyTarget?.targetCount || 0,
        currentCount: currentCount,
        bonusGold: weeklyTarget?.bonusGold || 0
      }
    });
    
  } catch (error) {
    console.error('错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 连接数据库并启动服务器
const mongoose = require('mongoose');
mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(() => {
    console.log('MongoDB连接成功');
    app.listen(3004, () => {
      console.log('测试服务器启动在 http://localhost:3004');
    });
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
  });