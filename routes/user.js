const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const UserActivity = require('../models/UserActivity');
const LoginRecord = require('../models/LoginRecord');
const GoldLog = require('../models/GoldLog');
const Employee = require('../models/Employee');
const Team = require('../models/Team');
const Admin = require('../models/Admin');
const WeeklyTarget = require('../models/WeeklyTarget');
const WeeklyBonusClaim = require('../models/WeeklyBonusClaim');
const authMiddleware = require('../middleware/auth');

// 获取当前周（YYYY-WW 格式）
function getCurrentWeek() {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${now.getFullYear()}-${weekNumber.toString().padStart(2, '0')}`;
}

// 获取周开始和结束时间（北京时间）
function getWeekRange(week) {
  const [year, weekNumber] = week.split('-').map(Number);
  const startOfYear = new Date(year, 0, 1);
  const days = (weekNumber - 1) * 7 - startOfYear.getDay() + 1;
  const weekStart = new Date(startOfYear);
  weekStart.setDate(weekStart.getDate() + days);
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
    
    // 获取本周目标任务
    const currentWeek = getCurrentWeek();
    const weeklyTarget = await WeeklyTarget.findOne({ week: currentWeek });
    
    // 检查用户本周是否已领取额外金币
    const hasClaimedBonus = await WeeklyBonusClaim.exists({
      userId: userId,
      employeeId: employeeId,
      week: currentWeek
    });
    
    // 计算本周收益条数
    let currentCount = 0;
    if (weeklyTarget && weeklyTarget.targetCount > 0) {
      const weekRange = getWeekRange(currentWeek);
      currentCount = await GoldLog.countDocuments({
        userId: userId,
        createTime: {
          $gte: weekRange.start,
          $lt: weekRange.end
        }
      });
    }
    
    // 构建返回数据
    const responseData = {
      ...userGold.toObject(),
      weeklyTarget: weeklyTarget ? weeklyTarget.targetCount : 0,
      currentCount: currentCount,
      bonusGold: weeklyTarget ? weeklyTarget.bonusGold : 0,
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

// 获取所有注册用户（包括未上线的新人）
router.get('/new-users', authMiddleware, async (req, res) => {
  try {
    const { days, team, teamGroupId, status } = req.query;
    
    // 计算时间范围
    const daysAgo = parseInt(days) || 15;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysAgo);
    startDate.setHours(0, 0, 0, 0);
    
    // 获取所有员工信息
    const employees = await Employee.find({});
    const employeeMap = {};
    employees.forEach(emp => {
      employeeMap[emp.employeeId] = emp;
    });
    
    // 获取所有用户
    let users = await UserGold.find({}).sort({ createdAt: -1 });
    
    // 构建员工ID到用户的映射，确保每个员工号只保留最新的一条记录
    const employeeUserMap = {};
    users.forEach(user => {
      const employeeId = user.employeeId;
      if (!employeeUserMap[employeeId] || 
          new Date(user.createdAt) > new Date(employeeUserMap[employeeId].createdAt)) {
        employeeUserMap[employeeId] = user;
      }
    });
    
    // 只保留Employee表中存在的用户
    const filteredUsers = [];
    for (const employee of employees) {
      if (employeeUserMap[employee.employeeId]) {
        filteredUsers.push(employeeUserMap[employee.employeeId]);
      } else {
        // 创建新的UserGold记录（确保所有员工都有UserGold记录）
        const userId = `user_${employee.employeeId}_${Date.now()}`;
        const newUser = new UserGold({
          userId,
          employeeId: employee.employeeId,
          currentMonthGold: 0,
          lastMonthGold: 0
        });
        await newUser.save();
        filteredUsers.push(newUser);
      }
    }
    
    // 使用过滤后的用户列表
    users = filteredUsers;
    
    // 获取所有管理员信息（团队长和组长）
    const admins = await Admin.find({});
    const adminMap = {};
    admins.forEach(admin => {
      adminMap[admin._id.toString()] = admin;
    });
    
    // 获取用户活动记录
    const userActivities = await UserActivity.aggregate([
      {
        $group: {
          _id: '$userId',
          firstActivity: { $min: '$createTime' },
          lastActivity: { $max: '$createTime' },
          activityCount: { $sum: 1 }
        }
      }
    ]);
    
    const activityMap = {};
    userActivities.forEach(activity => {
      activityMap[activity._id] = activity;
    });
    
    // 获取用户登录记录
    const loginRecords = await LoginRecord.aggregate([
      {
        $group: {
          _id: '$userId',
          firstLogin: { $min: '$loginDate' },
          lastLogin: { $max: '$loginDate' },
          loginDays: { $sum: 1 }
        }
      }
    ]);
    
    const loginMap = {};
    loginRecords.forEach(login => {
      loginMap[login._id] = login;
    });
    
    // 获取用户金币记录（按最后一条金币记录算活跃时间）
    const goldLogs = await GoldLog.aggregate([
      {
        $group: {
          _id: '$userId',
          lastGoldTime: { $max: '$createTime' },
          goldCount: { $sum: 1 }
        }
      }
    ]);
    
    const goldLogMap = {};
    goldLogs.forEach(log => {
      goldLogMap[log._id] = log;
    });
    
    // 构建用户列表
    let newUsers = [];
    const employeeIdSet = new Set(); // 用于去重
    
    for (const user of users) {
      const employee = employeeMap[user.employeeId];
      
      // 只处理Employee表中存在的用户
      if (!employee) {
        continue;
      }
      
      // 去重：每个员工号只保留一条记录
      if (employeeIdSet.has(user.employeeId)) {
        continue;
      }
      employeeIdSet.add(user.employeeId);
      
      const activity = activityMap[user.userId];
      const login = loginMap[user.userId];
      const goldLog = goldLogMap[user.userId];
      
      // 判断注册时间（优先使用Employee的createdAt）
      const registerTime = employee.createdAt || activity?.firstActivity || login?.firstLogin || user.createdAt || new Date();
      
      // 时间范围筛选
      if (registerTime < startDate) {
        continue;
      }
      
      // 判断是否上线（有活动记录、登录记录或金币记录）
      const isOnline = !!(activity || login || goldLog);
      
      // 状态筛选
      if (status === 'online' && !isOnline) {
        continue;
      }
      if (status === 'offline' && isOnline) {
        continue;
      }
      
      // 获取团队和组长信息
      let teamName = '';
      let teamLeaderName = '';
      let groupName = '';
      let groupLeaderName = '';
      
      groupName = employee.groupName || '';
      
      // 获取团队长信息
      if (employee.parentId) {
        const teamLeader = adminMap[employee.parentId];
        if (teamLeader) {
          teamLeaderName = teamLeader.realName || teamLeader.username;
          teamName = teamLeader.teamName || ''; // 从团队长信息中获取团队名称
        }
      }
      
      // 获取组长信息
      if (employee.teamGroupId) {
        const groupLeader = admins.find(a => 
          a.teamGroupId === employee.teamGroupId && 
          a.role === 'NORMAL_ADMIN'
        );
        if (groupLeader) {
          groupLeaderName = groupLeader.realName || groupLeader.username;
        }
      }
      
      // 团队筛选
      if (team && team !== teamName) {
        continue;
      }
      
      // 组筛选
      if (teamGroupId && employee.teamGroupId !== teamGroupId) {
        continue;
      }
      
      // 权限控制：团队长和组长只能看自己的用户
      if (req.user.role !== 'superadmin') {
        const currentAdmin = await Admin.findById(req.user.id);
        if (currentAdmin) {
          if (currentAdmin.teamGroupId) {
            // 组长：只能看自己组的用户
            if (employee.teamGroupId !== currentAdmin.teamGroupId) {
              continue;
            }
          } else if (currentAdmin.teamName) {
            // 团队长：只能看自己团队的用户
            if (teamName !== currentAdmin.teamName) {
              continue;
            }
          }
        }
      }
      
      // 计算最后活跃时间：优先使用金币记录时间，其次是活动记录，最后是登录记录
      const lastActiveTime = goldLog?.lastGoldTime || activity?.lastActivity || login?.lastLogin || null;
      
      newUsers.push({
        userId: user.userId,
        employeeId: user.employeeId,
        registerTime: registerTime,
        isOnline: isOnline,
        teamName: teamName,
        teamLeaderName: teamLeaderName,
        groupName: groupName,
        groupLeaderName: groupLeaderName,
        lastActiveTime: lastActiveTime,
        activityCount: (activity?.activityCount || 0) + (goldLog?.goldCount || 0),
        loginDays: login?.loginDays || 0,
        currentMonthGold: user.currentMonthGold || 0
      });
    }
    
    res.json({
      success: true,
      data: newUsers,
      total: newUsers.length
    });
  } catch (error) {
    console.error('获取新用户列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
