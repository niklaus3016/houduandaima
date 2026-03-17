const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const LoginRecord = require('../models/LoginRecord');
const Employee = require('../models/Employee');
const Team = require('../models/Team');
const Admin = require('../models/Admin');
const UserActivity = require('../models/UserActivity');
const authMiddleware = require('../middleware/auth');

// 简单内存缓存
const cache = new Map();
const CACHE_TTL = {
  today: 30 * 1000,      // 30秒（今日数据变化快）
  yesterday: 5 * 60 * 1000,  // 5分钟
  week: 5 * 60 * 1000,   // 5分钟
  month: 5 * 60 * 1000,  // 5分钟
  lastMonth: 10 * 60 * 1000, // 10分钟
  all: 10 * 60 * 1000    // 10分钟
};

function getCacheKey(range, team) {
  return `kpi_${range}_${team || 'all'}`;
}

function getFromCache(key) {
  const item = cache.get(key);
  if (item && Date.now() < item.expiry) {
    return item.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data, ttl) {
  cache.set(key, {
    data,
    expiry: Date.now() + ttl
  });
}

// 获取当前UTC时间
function getUTCDate() {
  return new Date();
}

// 获取北京时间（UTC+8）
function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 获取北京时间的当天开始（返回北京时间0点）
function getBeijingStartOfDay() {
  const beijingNow = getBeijingDate();
  const startOfDay = new Date(beijingNow);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

// 获取北京时间的当天日期字符串（YYYY-MM-DD）
function getBeijingDateString() {
  return getBeijingDate().toISOString().split('T')[0];
}

router.get('/kpi', authMiddleware, async (req, res) => {
  try {
    const range = req.query.range || req.query.timeRange || 'today';
    const { team } = req.query;
    
    // 检查缓存
    const cacheKey = getCacheKey(range, team);
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }
    
    const now = getUTCDate();
    const beijingNow = getBeijingDate();
    let startDate, endDate, prevStartDate, prevEndDate;
    
    // 团队筛选 - 使用管理员账号的teamName直接筛选
    let teamMemberUserIds = null;
    if (team) {
      // 从Admin模型中获取团队长的团队成员
      const admin = await Admin.findOne({ teamName: team });
      if (admin) {
        // 查找该团队长下的所有员工
        const employees = await Employee.find({ parentId: admin._id.toString() });
        const employeeIds = employees.map(e => e.employeeId);
        
        // 查找这些员工对应的用户
        const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
        teamMemberUserIds = userGolds.map(ug => ug.userId);
      }
    } else if (req.user.role !== 'superadmin') {
      // 非超管，根据角色进行筛选
      const currentAdmin = await Admin.findById(req.user.id);
      if (currentAdmin) {
        if (currentAdmin.teamGroupId) {
          // 组长：按teamGroupId筛选
          const employees = await Employee.find({ teamGroupId: currentAdmin.teamGroupId });
          const employeeIds = employees.map(e => e.employeeId);
          const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
          teamMemberUserIds = userGolds.map(ug => ug.userId);
        } else if (currentAdmin.teamName) {
          // 团队长：按teamName筛选
          const employees = await Employee.find({ parentId: currentAdmin._id.toString() });
          const employeeIds = employees.map(e => e.employeeId);
          const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
          teamMemberUserIds = userGolds.map(ug => ug.userId);
        }
      }
    }
    
    if (range === 'yesterday') {
      // 昨天（北京时间）
      const yesterdayBeijing = new Date(beijingNow);
      yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
      
      // 昨天开始 = 昨天北京时间0点对应的UTC时间
      const yesterdayStartBeijing = new Date(yesterdayBeijing);
      yesterdayStartBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(yesterdayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      // 昨天结束 = 今天北京时间0点对应的UTC时间
      const todayStartBeijing = new Date(beijingNow);
      todayStartBeijing.setUTCHours(0, 0, 0, 0);
      endDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      // 前天
      const dayBeforeBeijing = new Date(yesterdayBeijing);
      dayBeforeBeijing.setUTCDate(dayBeforeBeijing.getUTCDate() - 1);
      const dayBeforeStartBeijing = new Date(dayBeforeBeijing);
      dayBeforeStartBeijing.setUTCHours(0, 0, 0, 0);
      prevStartDate = new Date(dayBeforeStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      prevEndDate = startDate;
    } else if (range === 'week') {
      // 本周一（北京时间）
      const dayOfWeek = beijingNow.getUTCDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mondayBeijing = new Date(beijingNow);
      mondayBeijing.setUTCDate(mondayBeijing.getUTCDate() + mondayOffset);
      mondayBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(mondayBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = now;
      
      // 上周一
      const lastMondayBeijing = new Date(mondayBeijing);
      lastMondayBeijing.setUTCDate(lastMondayBeijing.getUTCDate() - 7);
      prevStartDate = new Date(lastMondayBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      // 上周日
      const lastSundayBeijing = new Date(mondayBeijing);
      lastSundayBeijing.setUTCDate(lastSundayBeijing.getUTCDate() - 1);
      lastSundayBeijing.setUTCHours(23, 59, 59, 999);
      prevEndDate = new Date(lastSundayBeijing.getTime() - 8 * 60 * 60 * 1000);
    } else if (range === 'month') {
      // 本月1日（北京时间）
      const firstDayOfMonthBeijing = new Date(beijingNow);
      firstDayOfMonthBeijing.setUTCDate(1);
      firstDayOfMonthBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(firstDayOfMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = now;
      
      // 上月1日
      const firstDayOfLastMonthBeijing = new Date(beijingNow);
      firstDayOfLastMonthBeijing.setUTCMonth(firstDayOfLastMonthBeijing.getUTCMonth() - 1);
      firstDayOfLastMonthBeijing.setUTCDate(1);
      firstDayOfLastMonthBeijing.setUTCHours(0, 0, 0, 0);
      prevStartDate = new Date(firstDayOfLastMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      // 上月最后一日
      const lastDayOfLastMonthBeijing = new Date(firstDayOfMonthBeijing);
      lastDayOfLastMonthBeijing.setUTCDate(0);
      lastDayOfLastMonthBeijing.setUTCHours(23, 59, 59, 999);
      prevEndDate = new Date(lastDayOfLastMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
    } else if (range === 'lastMonth') {
      // 上月1日（北京时间）
      const beijingNow = getBeijingDate();
      const currentMonth = beijingNow.getUTCMonth();
      const currentYear = beijingNow.getUTCFullYear();
      
      // 上月1日北京时间0点对应的UTC时间
      const lastMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0));
      startDate = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      // 本月1日北京时间0点对应的UTC时间（上月结束时间）
      const thisMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0));
      endDate = new Date(thisMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      // 上上月1日北京时间0点对应的UTC时间
      const prevMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth - 2, 1, 0, 0, 0));
      prevStartDate = new Date(prevMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      // 上月1日北京时间0点对应的UTC时间
      prevEndDate = startDate;
    } else if (range === 'all') {
      // 累计（从最早的数据开始）
      startDate = new Date(0);
      endDate = now;
      
      // 上月1日北京时间0点对应的UTC时间
      const beijingNow = getBeijingDate();
      const currentMonth = beijingNow.getUTCMonth();
      const currentYear = beijingNow.getUTCFullYear();
      const lastMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0));
      prevStartDate = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      // 本月1日北京时间0点对应的UTC时间
      const thisMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0));
      prevEndDate = new Date(thisMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    } else {
      // 今天（北京时间）
      const todayStartBeijing = new Date(beijingNow);
      todayStartBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = now;
      
      // 昨天
      const yesterdayBeijing = new Date(beijingNow);
      yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
      yesterdayBeijing.setUTCHours(0, 0, 0, 0);
      prevStartDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      const yesterdayEndBeijing = new Date(beijingNow);
      yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
      prevEndDate = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
    }
    
    // 使用聚合管道优化查询性能
    const matchStage = teamMemberUserIds 
      ? { userId: { $in: teamMemberUserIds }, createTime: { $gte: startDate, $lt: endDate } }
      : { createTime: { $gte: startDate, $lt: endDate } };
    
    const prevMatchStage = teamMemberUserIds 
      ? { userId: { $in: teamMemberUserIds }, createTime: { $gte: prevStartDate, $lt: prevEndDate } }
      : { createTime: { $gte: prevStartDate, $lt: prevEndDate } };
    
    // 并行执行聚合查询
    const [currentStats, prevStats] = await Promise.all([
      GoldLog.aggregate([
        { $match: matchStage },
        { 
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalGold: { $sum: '$gold' },
            totalEcpm: { $sum: '$ecpm' }
          }
        }
      ]),
      GoldLog.aggregate([
        { $match: prevMatchStage },
        { 
          $group: {
            _id: null,
            count: { $sum: 1 },
            totalGold: { $sum: '$gold' },
            totalEcpm: { $sum: '$ecpm' }
          }
        }
      ])
    ]);
    
    const current = currentStats[0] || { count: 0, totalGold: 0, totalEcpm: 0 };
    const prev = prevStats[0] || { count: 0, totalGold: 0, totalEcpm: 0 };
    
    let totalImpressions = current.count;
    let totalClicks = Math.floor(totalImpressions * 0.15);
    let totalGold = current.totalGold;
    let totalRevenue = current.totalEcpm / 1000;
    let totalEcpm = current.totalEcpm;
    
    let prevTotalGold = prev.totalGold;
    let prevTotalRevenue = prev.totalEcpm / 1000;
    let prevTotalEcpm = prev.totalEcpm;
    
    const revenueGrowth = prevTotalRevenue > 0 
      ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue * 100).toFixed(1) 
      : 0;
    const coinsGrowth = prevTotalGold > 0 
      ? ((totalGold - prevTotalGold) / prevTotalGold * 100).toFixed(1) 
      : 0;
    const impressionsGrowth = prev.count > 0 
      ? ((totalImpressions - prev.count) / prev.count * 100).toFixed(1) 
      : 0;
    const clicksGrowth = prev.count > 0 
      ? ((totalClicks - Math.floor(prev.count * 0.15)) / Math.floor(prev.count * 0.15) * 100).toFixed(1) 
      : 0;
    
    // 今日活跃用户（北京时间）
    const todayStartBeijing = new Date(beijingNow);
    todayStartBeijing.setUTCHours(0, 0, 0, 0);
    const todayStart = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    const todayLoginRecords = await LoginRecord.find({
      loginDate: { $gte: todayStart, $lt: todayEnd },
      ...(teamMemberUserIds ? { employeeId: { $in: teamMemberUserIds } } : {})
    });
    const activeUsers = new Set(todayLoginRecords.map(r => r.employeeId)).size;
    
    // 昨日活跃用户
    const yesterdayBeijing = new Date(beijingNow);
    yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
    yesterdayBeijing.setUTCHours(0, 0, 0, 0);
    const yesterdayStart = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
    const yesterdayEnd = todayStart;
    
    const yesterdayLoginRecords = await LoginRecord.find({
      loginDate: { $gte: yesterdayStart, $lt: yesterdayEnd },
      ...(teamMemberUserIds ? { employeeId: { $in: teamMemberUserIds } } : {})
    });
    const prevActiveUsers = new Set(yesterdayLoginRecords.map(r => r.employeeId)).size;
    
    const activeUsersGrowth = prevActiveUsers > 0 
      ? ((activeUsers - prevActiveUsers) / prevActiveUsers * 100).toFixed(1) 
      : 0;
    
    const avgEcpm = totalImpressions > 0 ? (totalEcpm / totalImpressions).toFixed(2) : 0;
    const prevAvgEcpm = prev.count > 0 ? (prevTotalEcpm / prev.count).toFixed(2) : 0;
    const ecpmGrowth = prevAvgEcpm > 0 
      ? ((avgEcpm - prevAvgEcpm) / prevAvgEcpm * 100).toFixed(1) 
      : 0;
    
    const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalGold * 0.01) / totalRevenue * 100).toFixed(1) : 0;
    const prevProfitMargin = prevTotalRevenue > 0 
      ? ((prevTotalRevenue - prevTotalGold * 0.01) / prevTotalRevenue * 100).toFixed(1) 
      : 0;
    const profitMarginGrowth = prevProfitMargin > 0 
      ? (profitMargin - prevProfitMargin).toFixed(1) 
      : 0;
    
    const resultData = {
      revenue: parseFloat(totalRevenue.toFixed(2)),
      revenueGrowth: parseFloat(revenueGrowth),
      coins: parseFloat(totalGold.toFixed(2)),
      coinsGrowth: parseFloat(coinsGrowth),
      impressions: totalImpressions,
      impressionsGrowth: parseFloat(impressionsGrowth),
      clicks: totalClicks,
      clicksGrowth: parseFloat(clicksGrowth),
      profitMargin: parseFloat(profitMargin),
      profitMarginGrowth: parseFloat(profitMarginGrowth),
      ecpm: parseFloat(avgEcpm),
      ecpmGrowth: parseFloat(ecpmGrowth),
      activeUsers: activeUsers,
      activeUsersGrowth: parseFloat(activeUsersGrowth)
    };
    
    // 设置缓存
    setCache(cacheKey, resultData, CACHE_TTL[range] || 60 * 1000);
    
    res.json({
      success: true,
      data: resultData
    });
  } catch (error) {
    console.error('获取KPI指标错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/users', authMiddleware, async (req, res) => {
  try {
    const range = req.query.range || req.query.timeRange || 'today';
    const { sortBy = 'earnings', limit = 10, team } = req.query;
    
    const beijingNow = getBeijingDate();
    let startDate, endDate;
    
    if (range === 'yesterday') {
      const yesterdayBeijing = new Date(beijingNow);
      yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
      yesterdayBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      const todayStartBeijing = new Date(beijingNow);
      todayStartBeijing.setUTCHours(0, 0, 0, 0);
      endDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    } else if (range === 'week') {
      const dayOfWeek = beijingNow.getUTCDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const mondayBeijing = new Date(beijingNow);
      mondayBeijing.setUTCDate(mondayBeijing.getUTCDate() + mondayOffset);
      mondayBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(mondayBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
    } else if (range === 'month') {
      const firstDayOfMonthBeijing = new Date(beijingNow);
      firstDayOfMonthBeijing.setUTCDate(1);
      firstDayOfMonthBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(firstDayOfMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
    } else {
      const todayStartBeijing = new Date(beijingNow);
      todayStartBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
    }
    
    // 获取所有员工信息
    const allEmployees = await Employee.find({});
    const employeeMap = {};
    allEmployees.forEach(emp => {
      employeeMap[emp.employeeId] = emp;
    });
    
    // 获取所有UserGold记录
    const userGolds = await UserGold.find({});
    const userGoldMap = {};
    userGolds.forEach(ug => {
      userGoldMap[ug.employeeId] = ug;
    });
    
    // 构建初始用户统计（包含所有员工）
    const userStats = {};
    allEmployees.forEach(emp => {
      const userGold = userGoldMap[emp.employeeId];
      if (userGold) {
        userStats[userGold.userId] = {
          userId: userGold.userId,
          employeeId: emp.employeeId,
          watched: 0,
          earnings: 0,
          totalEcpm: 0
        };
      }
    });
    
    // 从GoldLog中获取金币记录
    const goldLogs = await GoldLog.find({ 
      createTime: { $gte: startDate, $lt: endDate } 
    });
    
    // 更新有金币记录的用户统计
    goldLogs.forEach(log => {
      if (!userStats[log.userId]) {
        userStats[log.userId] = {
          userId: log.userId,
          employeeId: log.employeeId,
          watched: 0,
          earnings: 0,
          totalEcpm: 0
        };
      }
      
      userStats[log.userId].watched += 1;
      userStats[log.userId].earnings += log.gold;
      userStats[log.userId].totalEcpm += log.ecpm || 0;
    });
    
    const employeeIds = [...new Set(Object.values(userStats).map(s => s.employeeId))];
    
    const parentIds = [...new Set(allEmployees.map(e => e.parentId).filter(id => id))];
    const admins = await Admin.find({ _id: { $in: parentIds } });
    const adminMap = {};
    admins.forEach(admin => {
      adminMap[admin._id.toString()] = admin;
    });
    
    const teams = await Team.find({});
    const teamMap = {};
    teams.forEach(team => {
      team.members.forEach(member => {
        teamMap[member.userId] = team.name;
      });
    });
    
    // 团队筛选
    let filteredUserStats = userStats;
    if (team) {
      const targetTeam = teams.find(t => t.name === team);
      if (targetTeam) {
        const teamMemberUserIds = targetTeam.members.map(m => m.userId);
        filteredUserStats = {};
        Object.keys(userStats).forEach(userId => {
          if (teamMemberUserIds.includes(userId)) {
            filteredUserStats[userId] = userStats[userId];
          }
        });
      }
    } else if (req.user && req.user.role !== 'superadmin') {
      // 非超管，根据角色进行筛选
      const currentAdmin = await Admin.findById(req.user.id);
      if (currentAdmin) {
        if (currentAdmin.teamGroupId) {
          // 组长：按teamGroupId筛选
          const employees = await Employee.find({ teamGroupId: currentAdmin.teamGroupId });
          const employeeIds = employees.map(e => e.employeeId);
          filteredUserStats = {};
          Object.keys(userStats).forEach(userId => {
            if (employeeIds.includes(userStats[userId].employeeId)) {
              filteredUserStats[userId] = userStats[userId];
            }
          });
        } else if (currentAdmin.teamName) {
          // 团队长：按teamName筛选
          const employees = await Employee.find({ parentId: currentAdmin._id.toString() });
          const employeeIds = employees.map(e => e.employeeId);
          filteredUserStats = {};
          Object.keys(userStats).forEach(userId => {
            if (employeeIds.includes(userStats[userId].employeeId)) {
              filteredUserStats[userId] = userStats[userId];
            }
          });
        }
      }
    }
    
    const userIds = Object.keys(filteredUserStats);
    const activities = await UserActivity.find({
      userId: { $in: userIds },
      createTime: { $gte: startDate, $lt: endDate }
    });
    
    const ipCountMap = {};
    const deviceCountMap = {};
    activities.forEach(act => {
      if (!ipCountMap[act.userId]) ipCountMap[act.userId] = new Set();
      if (!deviceCountMap[act.userId]) deviceCountMap[act.userId] = new Set();
      if (act.ip) ipCountMap[act.userId].add(act.ip);
      if (act.deviceId) deviceCountMap[act.userId].add(act.deviceId);
    });
    
    const userStatsArray = Object.values(filteredUserStats).map(stat => {
      const employee = employeeMap[stat.employeeId] || {};
      const regDays = employee.createdAt 
        ? Math.floor((Date.now() - new Date(employee.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      let superior = '系统直属';
      if (teamMap[stat.userId]) {
        superior = teamMap[stat.userId];
      } else if (employee.parentId) {
        const parentAdmin = adminMap[employee.parentId];
        if (parentAdmin) {
          superior = parentAdmin.teamName || parentAdmin.realName || parentAdmin.username;
        }
      }
      
      const ipCount = ipCountMap[stat.userId] ? ipCountMap[stat.userId].size : 0;
      const deviceCount = deviceCountMap[stat.userId] ? deviceCountMap[stat.userId].size : 0;
      
      return {
        ...stat,
        name: employee.realName || stat.userId,
        ecpm: stat.watched > 0 ? parseFloat((stat.totalEcpm / stat.watched).toFixed(2)) : 0,
        regDays,
        superior,
        ipCount,
        deviceCount
      };
    });
    
    userStatsArray.sort((a, b) => {
      if (sortBy === 'watched') {
        return b.watched - a.watched;
      } else if (sortBy === 'earnings') {
        return b.earnings - a.earnings;
      } else if (sortBy === 'ecpm') {
        return b.ecpm - a.ecpm;
      }
      return 0;
    });
    
    const limitedStats = userStatsArray.slice(0, parseInt(limit));
    
    res.json({
      success: true,
      data: limitedStats
    });
  } catch (error) {
    console.error('获取用户实时表现错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
