const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const LoginRecord = require('../models/LoginRecord');
const DailyTarget = require('../models/DailyTarget');
const DailyBonusClaim = require('../models/DailyBonusClaim');
const GoldLog = require('../models/GoldLog');
const Employee = require('../models/Employee');
const Team = require('../models/Team');
const authMiddleware = require('../middleware/auth');

// 获取北京时间
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 获取北京时间的当天开始（返回UTC时间）
function getBeijingStartOfDay() {
  const beijingNow = getBeijingDate();
  const startOfDay = new Date(beijingNow);
  startOfDay.setHours(0, 0, 0, 0);
  return new Date(startOfDay.getTime() - 8 * 60 * 60 * 1000);
}

// 获取北京时间的当天结束（返回北京时间23:59:59）
function getBeijingEndOfDay() {
  const beijingNow = getBeijingDate();
  const endOfDay = new Date(beijingNow);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

// 获取北京时间的当天日期字符串（YYYY-MM-DD）
function getBeijingDateString() {
  return getBeijingDate().toISOString().split('T')[0];
}

// 获取金币信息
router.get('/info', async (req, res) => {
  try {
    const { userId, employeeId } = req.query;
    
    if (!userId || !employeeId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    let userGold = await UserGold.findOne({ userId });
    
    if (!userGold) {
      // 如果用户不存在，创建新记录
      userGold = new UserGold({
        userId,
        employeeId,
        currentMonthGold: 0,
        lastMonthGold: 0
      });
      await userGold.save();
    }
    
    // 获取今日目标任务（北京时间）
    const beijingNow = getBeijingDate();
    const today = beijingNow.toISOString().split('T')[0];
    const dailyTarget = await DailyTarget.findOne({ date: today });
    
    // 检查用户今日是否已领取额外金币
    const hasClaimedBonus = userGold.lastClaimedBonusDate === today;
    
    // 构建返回数据
    const responseData = {
      ...userGold.toObject(),
      todayTarget: dailyTarget ? dailyTarget.target : 0,
      bonusGold: dailyTarget ? dailyTarget.bonusGold : 0,
      hasClaimedBonus: hasClaimedBonus
    };
    
    res.json({ success: true, data: responseData });
  } catch (error) {
    console.error('获取金币信息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 记录用户登录
router.post('/login-record', async (req, res) => {
  try {
    const { userId, employeeId } = req.body;
    
    if (!userId || !employeeId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 获取今天的日期（北京时间）
    const today = getBeijingStartOfDay();
    const todayStr = getBeijingDateString();
    
    // 计算明天的日期
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // 检查今天是否已有登录记录
    let existingRecord = await LoginRecord.findOne({
      userId: userId,
      loginDate: { $gte: today, $lt: tomorrow }
    });
    
    let isNewLogin = false;
    
    if (!existingRecord) {
      // 今天首次登录，创建记录
      await LoginRecord.create({
        userId: userId,
        employeeId: employeeId,
        loginDate: today,
        loginTime: new Date()
      });
      isNewLogin = true;
    }
    
    // 统计累计登录天数
    const totalLoginDays = await LoginRecord.countDocuments({
      userId: userId
    });
    
    // 计算连续登录天数
    const records = await LoginRecord.find({ userId: userId })
      .sort({ loginDate: -1 })
      .limit(30);
    
    let consecutiveDays = 0;
    if (records.length > 0) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // 检查今天或昨天是否有登录
      const hasTodayLogin = records.some(r => 
        r.loginDate.toISOString().split('T')[0] === todayStr
      );
      const hasYesterdayLogin = records.some(r => 
        r.loginDate.toISOString().split('T')[0] === yesterdayStr
      );
      
      if (hasTodayLogin || hasYesterdayLogin) {
        consecutiveDays = 1;
        let checkDate = hasTodayLogin ? new Date(today) : new Date(yesterday);
        
        for (let i = 1; i < records.length; i++) {
          checkDate.setDate(checkDate.getDate() - 1);
          const checkDateStr = checkDate.toISOString().split('T')[0];
          const hasLogin = records.some(r => 
            r.loginDate.toISOString().split('T')[0] === checkDateStr
          );
          if (hasLogin) {
            consecutiveDays++;
          } else {
            break;
          }
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        loginDays: totalLoginDays,
        todayLogin: true,
        isNewLogin: isNewLogin,
        consecutiveDays: consecutiveDays
      }
    });
  } catch (error) {
    console.error('记录登录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取用户登录统计
router.get('/login-stats', async (req, res) => {
  try {
    const { userId, employeeId } = req.query;
    
    if (!userId || !employeeId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 获取所有登录记录
    const records = await LoginRecord.find({
      userId: userId
    }).sort({ loginDate: 1 });
    
    // 提取唯一日期
    const uniqueDates = [...new Set(records.map(r => 
      r.loginDate.toISOString().split('T')[0]
    ))];
    
    // 计算连续登录天数
    let consecutiveDays = 0;
    if (uniqueDates.length > 0) {
      const todayStr = getBeijingDateString();
      const today = getBeijingStartOfDay();
      
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      // 检查今天或昨天是否有登录
      const hasTodayLogin = uniqueDates.includes(todayStr);
      const hasYesterdayLogin = uniqueDates.includes(yesterdayStr);
      
      if (hasTodayLogin || hasYesterdayLogin) {
        consecutiveDays = 1;
        let checkDate = hasTodayLogin ? new Date(today) : new Date(yesterday);
        
        for (let i = uniqueDates.length - 1; i >= 0; i--) {
          checkDate.setDate(checkDate.getDate() - 1);
          const checkDateStr = checkDate.toISOString().split('T')[0];
          if (uniqueDates.includes(checkDateStr)) {
            consecutiveDays++;
          } else {
            break;
          }
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        totalLoginDays: uniqueDates.length,
        firstLoginDate: uniqueDates[0] || null,
        lastLoginDate: uniqueDates[uniqueDates.length - 1] || null,
        consecutiveDays: consecutiveDays,
        loginDates: uniqueDates
      }
    });
  } catch (error) {
    console.error('获取登录统计错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取低绩效用户列表
router.get('/low-performance', authMiddleware, async (req, res) => {
  try {
    const { team } = req.query;
    
    // 计算昨天的日期（北京时间）
    const todayStart = getBeijingStartOfDay();
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStart = new Date(yesterday);
    
    // 获取所有用户
    let users = await UserGold.find({});
    let employeeIds = users.map(user => user.employeeId);
    
    // 团队筛选
    if (team) {
      const targetTeam = await Team.findOne({ name: team });
      if (targetTeam) {
        const teamMemberUserIds = targetTeam.members.map(m => m.userId);
        const teamEmployees = await Employee.find({ userId: { $in: teamMemberUserIds } });
        employeeIds = teamEmployees.map(e => e.employeeId);
        users = users.filter(user => employeeIds.includes(user.employeeId));
      }
    }
    
    // 获取昨天的金币日志
    const goldLogs = await GoldLog.find({
      createTime: { $gte: yesterdayStart, $lt: todayStart }
    });
    
    // 按用户分组统计
    const userStats = {};
    goldLogs.forEach(log => {
      const employeeId = log.employeeId;
      if (!userStats[employeeId]) {
        userStats[employeeId] = {
          watched: 0,
          earnings: 0,
          ecpmTotal: 0
        };
      }
      userStats[employeeId].watched += 1;
      userStats[employeeId].earnings += log.gold / 1000; // 转换为元
      userStats[employeeId].ecpmTotal += log.ecpm || 0;
    });
    
    // 生成低绩效用户列表
    const lowPerfUsers = [];
    users.forEach(user => {
      const stats = userStats[user.employeeId] || { watched: 0, earnings: 0, ecpmTotal: 0 };
      const ecpm = stats.watched > 0 ? stats.ecpmTotal / stats.watched : 0;
      
      // 简单的低绩效判断：观看次数 < 50 或 收益 < 5 元
      if (stats.watched < 50 || stats.earnings < 5) {
        let reason = '';
        if (stats.watched < 50 && stats.earnings < 5) {
          reason = '次数及收益双低';
        } else if (stats.watched < 50) {
          reason = '观看次数低';
        } else {
          reason = '收益低';
        }
        
        lowPerfUsers.push({
          id: user.employeeId,
          name: `用户${user.employeeId}`,
          avatar: `https://picsum.photos/seed/${user.employeeId}/100/100`,
          yesterdayWatched: stats.watched,
          yesterdayEarnings: parseFloat(stats.earnings.toFixed(1)),
          ipCount: 1, // 简化处理
          deviceCount: 1, // 简化处理
          ecpm: parseFloat(ecpm.toFixed(1)),
          reason: reason
        });
      }
    });
    
    res.json({
      success: true,
      data: lowPerfUsers
    });
  } catch (error) {
    console.error('获取低绩效用户错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
