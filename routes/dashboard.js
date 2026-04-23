const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const LoginRecord = require('../models/LoginRecord');
const Employee = require('../models/Employee');
const Team = require('../models/Team');
const TeamGroup = require('../models/TeamGroup');
const Admin = require('../models/Admin');
const UserActivity = require('../models/UserActivity');
const authMiddleware = require('../middleware/auth');
const { cache, CACHE_TTL, get, set } = require('../utils/cache');

const DASHBOARD_CACHE_TTL = {
  today: CACHE_TTL.kpi || 60 * 1000,
  yesterday: 60 * 60 * 1000,
  week: 60 * 60 * 1000,
  month: 60 * 60 * 1000,
  lastMonth: 60 * 60 * 1000,
  all: 60 * 60 * 1000,
  groups: CACHE_TTL.groups || 60 * 60 * 1000
};

function getCacheKey(range, team) {
  return `kpi_${range}_${team || 'all'}`;
}

function getFromCache(key) {
  return get(key);
}

function setCache(key, data, ttl) {
  set(key, data, ttl || DASHBOARD_CACHE_TTL.today);
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
    let employeeIds = null; // 用于LoginRecord查询的员工ID列表
    
    if (team) {
      // 从Admin模型中获取团队长的团队成员
      const admin = await Admin.findOne({ teamName: team });
      if (admin) {
        // 查找该团队长下的所有员工
        const employees = await Employee.find({ parentId: admin._id.toString() });
        employeeIds = employees.map(e => e.employeeId);
        
        // 查找这些员工对应的用户
        const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
        teamMemberUserIds = userGolds.map(ug => ug.userId);
      }
    } else if (req.user.role !== 'superadmin') {
      // 非超管，根据角色进行筛选
      const currentAdmin = await Admin.findById(req.user.id);
      if (currentAdmin) {
        if (currentAdmin.teamGroupId) {
          // 组长：按groupName筛选（先获取组信息）
          const group = await TeamGroup.findById(currentAdmin.teamGroupId);
          let employees;
          if (group && group.groupName) {
            employees = await Employee.find({
              $or: [
                { groupName: group.groupName },
                { teamGroupId: currentAdmin.teamGroupId },
                { teamGroupId: group._id.toString() }
              ]
            });
          } else {
            employees = await Employee.find({ teamGroupId: currentAdmin.teamGroupId });
          }
          employeeIds = employees.map(e => e.employeeId);
          const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
          teamMemberUserIds = userGolds.map(ug => ug.userId);
        } else if (currentAdmin.teamName) {
          // 团队长：按teamName筛选
          const employees = await Employee.find({ parentId: currentAdmin._id.toString() });
          employeeIds = employees.map(e => e.employeeId);
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
    
    // 活跃用户数计算
    const currentLoginRecords = await LoginRecord.find({
      loginDate: { $gte: startDate, $lt: endDate },
      ...(teamMemberUserIds ? { userId: { $in: teamMemberUserIds } } : {})
    });
    const activeUsers = new Set(currentLoginRecords.map(r => r.userId)).size;
    
    // 对比时间范围的活跃用户数
    const prevLoginRecords = await LoginRecord.find({
      loginDate: { $gte: prevStartDate, $lt: prevEndDate },
      ...(teamMemberUserIds ? { userId: { $in: teamMemberUserIds } } : {})
    });
    const prevActiveUsers = new Set(prevLoginRecords.map(r => r.userId)).size;
    
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
    const { sortBy = 'earnings', limit, team, group } = req.query;
    
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
    
    // 先查 GoldLog 获取有记录的员工ID，避免查询所有员工
    const goldLogs = await GoldLog.find({
      createTime: { $gte: startDate, $lt: endDate }
    });

    // 提取有金币记录的员工ID
    const employeeIdsWithGold = [...new Set(goldLogs.map(log => log.employeeId))];

    // 只查询有金币记录的员工
    const relevantEmployees = employeeIdsWithGold.length > 0
      ? await Employee.find({ employeeId: { $in: employeeIdsWithGold } })
      : [];
    const employeeMap = {};
    relevantEmployees.forEach(emp => {
      employeeMap[emp.employeeId] = emp;
    });

    // 获取所有员工信息（用于显示没有金币记录但有账号的员工）
    const allEmployees = await Employee.find({});
    allEmployees.forEach(emp => {
      if (!employeeMap[emp.employeeId]) {
        employeeMap[emp.employeeId] = emp;
      }
    });

    // 获取所有UserGold记录
    const userGolds = await UserGold.find({
      employeeId: { $in: Object.keys(employeeMap) }
    });
    const userGoldMap = {};
    userGolds.forEach(ug => {
      userGoldMap[ug.employeeId] = ug;
    });

    // 构建初始用户统计（包含所有员工）
    const userStats = {};
    Object.values(employeeMap).forEach(emp => {
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

    const allEmployeeIds = Object.keys(employeeMap);

    // 缓存管理员和团队信息，避免重复查询
    const parentIds = [...new Set(relevantEmployees.map(e => e.parentId).filter(id => id))];
    const admins = parentIds.length > 0
      ? await Admin.find({ _id: { $in: parentIds } })
      : [];
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

    // 预缓存管理员信息和组信息，避免重复查询
    let currentAdmin = null;
    let currentAdminGroup = null;
    const adminGroupCache = {};

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
    } else if (group) {
      // 使用 group 参数筛选（组长的 teamGroupId）
      if (!adminGroupCache[group]) {
        adminGroupCache[group] = await TeamGroup.findById(group);
      }
      const targetGroup = adminGroupCache[group];
      if (targetGroup && targetGroup.groupName) {
        // 使用 groupName 筛选，同时兼容 ObjectId 和 String
        const employees = await Employee.find({
          $or: [
            { groupName: targetGroup.groupName },
            { teamGroupId: group },
            { teamGroupId: targetGroup._id.toString() }
          ]
        });
        const employeeIds = employees.map(e => e.employeeId);
        filteredUserStats = {};
        Object.keys(userStats).forEach(userId => {
          if (employeeIds.includes(userStats[userId].employeeId)) {
            filteredUserStats[userId] = userStats[userId];
          }
        });
      }
    } else if (req.user && req.user.role !== 'superadmin') {
      // 非超管，根据角色进行筛选
      if (!currentAdmin) {
        currentAdmin = await Admin.findById(req.user.id);
      }
      if (currentAdmin) {
        if (currentAdmin.teamGroupId) {
          // 组长：按groupName筛选（先获取组信息）
          if (!adminGroupCache[currentAdmin.teamGroupId]) {
            adminGroupCache[currentAdmin.teamGroupId] = await TeamGroup.findById(currentAdmin.teamGroupId);
          }
          const group = adminGroupCache[currentAdmin.teamGroupId];
          if (group && group.groupName) {
            // 使用 groupName 筛选，同时兼容 ObjectId 和 String
            const employees = await Employee.find({
              $or: [
                { groupName: group.groupName },
                { teamGroupId: currentAdmin.teamGroupId },
                { teamGroupId: group._id.toString() }
              ]
            });
            const employeeIds = employees.map(e => e.employeeId);
            filteredUserStats = {};
            Object.keys(userStats).forEach(userId => {
              if (employeeIds.includes(userStats[userId].employeeId)) {
                filteredUserStats[userId] = userStats[userId];
              }
            });
          }
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
        deviceCount,
        groupName: employee.groupName || null,
        teamGroupId: employee.teamGroupId || null
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
    
    const limitedStats = limit ? userStatsArray.slice(0, parseInt(limit)) : userStatsArray;
    
    const responseData = {
      success: true,
      data: limitedStats
    };
    
    res.json(responseData);
  } catch (error) {
    console.error('获取用户实时表现错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 5. GET /admin/dashboard/team-leader
// 团队长数据合并接口，一次性返回所有需要的数据
router.get('/team-leader', authMiddleware, async (req, res) => {
  try {
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay();
    const monthStart = new Date(beijingNow);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    // 获取时间范围参数
    const range = req.query.range || 'today';
    
    // 获取当前管理员信息
    const currentAdmin = await Admin.findById(req.user.id);
    if (!currentAdmin) {
      return res.status(403).json({ success: false, message: '管理员信息不存在' });
    }
    
    // 组长只能查看自己组的数据
    if (currentAdmin.role === 'GROUP_LEADER') {
      if (!currentAdmin.teamGroupId) {
        return res.status(403).json({ success: false, message: '非组长账号' });
      }
      
      // 1. 获取KPI数据（带缓存）- 组长缓存key用teamGroupId
      const kpiCacheKey = getCacheKey(range, currentAdmin.teamGroupId);
      let kpiData = getFromCache(kpiCacheKey);
      
      if (!kpiData) {
        // 组长获取自己组的所有员工（使用 groupName 筛选）
        const group = await TeamGroup.findById(currentAdmin.teamGroupId);
        let employees;
        if (group && group.groupName) {
          employees = await Employee.find({
            $or: [
              { groupName: group.groupName },
              { teamGroupId: currentAdmin.teamGroupId },
              { teamGroupId: group._id.toString() }
            ]
          });
        } else {
          employees = await Employee.find({ teamGroupId: currentAdmin.teamGroupId });
        }
        const employeeIds = employees.map(e => e.employeeId);
        const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
        const teamMemberUserIds = userGolds.map(ug => ug.userId);
      
        // 时间范围
        const now = getUTCDate();
        let startDate, endDate, prevStartDate, prevEndDate;
        
        if (range === 'today') {
          const todayStartBeijing = new Date(beijingNow);
          todayStartBeijing.setUTCHours(0, 0, 0, 0);
          startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
          endDate = now;
          
          // 昨天时间范围
          const yesterdayBeijing = new Date(beijingNow);
          yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
          yesterdayBeijing.setUTCHours(0, 0, 0, 0);
          prevStartDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const yesterdayEndBeijing = new Date(beijingNow);
          yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
          prevEndDate = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
        } else if (range === 'yesterday') {
          // 昨天时间范围
          const yesterdayBeijing = new Date(beijingNow);
          yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
          yesterdayBeijing.setUTCHours(0, 0, 0, 0);
          startDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const yesterdayEndBeijing = new Date(beijingNow);
          yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
          endDate = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          // 前天时间范围
          const dayBeforeYesterdayBeijing = new Date(beijingNow);
          dayBeforeYesterdayBeijing.setUTCDate(dayBeforeYesterdayBeijing.getUTCDate() - 2);
          dayBeforeYesterdayBeijing.setUTCHours(0, 0, 0, 0);
          prevStartDate = new Date(dayBeforeYesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const dayBeforeYesterdayEndBeijing = new Date(beijingNow);
          dayBeforeYesterdayEndBeijing.setUTCDate(dayBeforeYesterdayEndBeijing.getUTCDate() - 1);
          dayBeforeYesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
          prevEndDate = new Date(dayBeforeYesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
        } else if (range === 'week') {
          // 本周时间范围（从周一开始）
          const weekStartBeijing = new Date(beijingNow);
          const dayOfWeek = weekStartBeijing.getUTCDay() || 7; // 0 是周日，改为 7
          const daysToMonday = dayOfWeek - 1;
          weekStartBeijing.setUTCDate(weekStartBeijing.getUTCDate() - daysToMonday);
          weekStartBeijing.setUTCHours(0, 0, 0, 0);
          startDate = new Date(weekStartBeijing.getTime() - 8 * 60 * 60 * 1000);
          endDate = now;
          
          // 上周时间范围
          const lastWeekStartBeijing = new Date(weekStartBeijing);
          lastWeekStartBeijing.setUTCDate(lastWeekStartBeijing.getUTCDate() - 7);
          prevStartDate = new Date(lastWeekStartBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const lastWeekEndBeijing = new Date(weekStartBeijing);
          lastWeekEndBeijing.setUTCHours(0, 0, 0, 0);
          prevEndDate = new Date(lastWeekEndBeijing.getTime() - 8 * 60 * 60 * 1000);
        } else if (range === 'month') {
          // 本月时间范围
          const monthStartBeijing = new Date(beijingNow);
          monthStartBeijing.setDate(1);
          monthStartBeijing.setUTCHours(0, 0, 0, 0);
          startDate = new Date(monthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
          endDate = now;
          
          // 上月时间范围
          const lastMonthStartBeijing = new Date(beijingNow);
          lastMonthStartBeijing.setMonth(lastMonthStartBeijing.getMonth() - 1);
          lastMonthStartBeijing.setDate(1);
          lastMonthStartBeijing.setUTCHours(0, 0, 0, 0);
          prevStartDate = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const lastMonthEndBeijing = new Date(beijingNow);
          lastMonthEndBeijing.setDate(1);
          lastMonthEndBeijing.setUTCHours(0, 0, 0, 0);
          prevEndDate = new Date(lastMonthEndBeijing.getTime() - 8 * 60 * 60 * 1000);
        } else {
          // 默认今天
          const todayStartBeijing = new Date(beijingNow);
          todayStartBeijing.setUTCHours(0, 0, 0, 0);
          startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
          endDate = now;
          
          // 昨天时间范围
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
        
        // 活跃用户数计算 - 使用并行查询
        const [currentLoginRecords, prevLoginRecords] = await Promise.all([
          LoginRecord.find({
            loginDate: { $gte: startDate, $lt: endDate },
            ...(employeeIds ? { employeeId: { $in: employeeIds } } : {})
          }),
          LoginRecord.find({
            loginDate: { $gte: prevStartDate, $lt: prevEndDate },
            ...(employeeIds ? { employeeId: { $in: employeeIds } } : {})
          })
        ]);
        const activeUsers = new Set(currentLoginRecords.map(r => r.employeeId)).size;
        const prevActiveUsers = new Set(prevLoginRecords.map(r => r.employeeId)).size;
        
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
        
        kpiData = {
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
        
        // 设置缓存，根据时间范围设置不同的TTL
        let cacheTTL;
        if (range === 'today') {
          cacheTTL = CACHE_TTL.today;
        } else if (range === 'yesterday') {
          cacheTTL = CACHE_TTL.yesterday;
        } else if (range === 'week') {
          cacheTTL = CACHE_TTL.week;
        } else if (range === 'month') {
          cacheTTL = CACHE_TTL.month;
        } else {
          cacheTTL = CACHE_TTL.today;
        }
        setCache(kpiCacheKey, kpiData, cacheTTL);
        
        // 组长只返回KPI数据，不返回团队和组数据
        return res.json({
          success: true,
          data: {
            kpi: kpiData,
            teams: [],
            groups: [],
            topUsers: []
          }
        });
      }
      
      // 缓存命中时直接返回
      return res.json({
        success: true,
        data: {
          kpi: kpiData,
          teams: [],
          groups: [],
          topUsers: []
        }
      });
    }
    
    // 超管可以查看所有数据
    if (currentAdmin.role === 'superadmin') {
      // 1. 获取KPI数据（带缓存）- 超管缓存key用'all'
      const kpiCacheKey = getCacheKey(range, 'superadmin');
      let kpiData = getFromCache(kpiCacheKey);
      
      if (!kpiData) {
        // 超管获取所有数据
        const allEmployees = await Employee.find();
        const employeeIds = allEmployees.map(e => e.employeeId);
        const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
        const teamMemberUserIds = userGolds.map(ug => ug.userId);
      
        // 时间范围
        const now = getUTCDate();
        let startDate, endDate, prevStartDate, prevEndDate;
        
        if (range === 'today') {
          startDate = todayStart;
          endDate = beijingNow;
          
          const yesterdayBeijing = new Date(beijingNow);
          yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
          yesterdayBeijing.setUTCHours(0, 0, 0, 0);
          prevStartDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const yesterdayEndBeijing = new Date(beijingNow);
          yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
          prevEndDate = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
        } else if (range === 'yesterday') {
          const yesterdayBeijing = new Date(beijingNow);
          yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
          yesterdayBeijing.setUTCHours(0, 0, 0, 0);
          startDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const yesterdayEndBeijing = new Date(beijingNow);
          yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
          endDate = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const dayBeforeYesterdayBeijing = new Date(beijingNow);
          dayBeforeYesterdayBeijing.setUTCDate(dayBeforeYesterdayBeijing.getUTCDate() - 2);
          dayBeforeYesterdayBeijing.setUTCHours(0, 0, 0, 0);
          prevStartDate = new Date(dayBeforeYesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const dayBeforeYesterdayEndBeijing = new Date(beijingNow);
          dayBeforeYesterdayEndBeijing.setUTCDate(dayBeforeYesterdayEndBeijing.getUTCDate() - 1);
          dayBeforeYesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
          prevEndDate = new Date(dayBeforeYesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
        } else if (range === 'week') {
          const weekStartBeijing = new Date(beijingNow);
          const dayOfWeek = weekStartBeijing.getUTCDay() || 7;
          const daysToMonday = dayOfWeek - 1;
          weekStartBeijing.setUTCDate(weekStartBeijing.getUTCDate() - daysToMonday);
          weekStartBeijing.setUTCHours(0, 0, 0, 0);
          startDate = new Date(weekStartBeijing.getTime() - 8 * 60 * 60 * 1000);
          endDate = now;
          
          const lastWeekStartBeijing = new Date(weekStartBeijing);
          lastWeekStartBeijing.setUTCDate(lastWeekStartBeijing.getUTCDate() - 7);
          prevStartDate = new Date(lastWeekStartBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const lastWeekEndBeijing = new Date(weekStartBeijing);
          lastWeekEndBeijing.setUTCHours(0, 0, 0, 0);
          prevEndDate = new Date(lastWeekEndBeijing.getTime() - 8 * 60 * 60 * 1000);
        } else if (range === 'month') {
          const monthStartBeijing = new Date(beijingNow);
          monthStartBeijing.setDate(1);
          monthStartBeijing.setUTCHours(0, 0, 0, 0);
          startDate = new Date(monthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
          endDate = now;
          
          const lastMonthStartBeijing = new Date(beijingNow);
          lastMonthStartBeijing.setMonth(lastMonthStartBeijing.getMonth() - 1);
          lastMonthStartBeijing.setDate(1);
          lastMonthStartBeijing.setUTCHours(0, 0, 0, 0);
          prevStartDate = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const lastMonthEndBeijing = new Date(beijingNow);
          lastMonthEndBeijing.setDate(1);
          lastMonthEndBeijing.setUTCHours(0, 0, 0, 0);
          prevEndDate = new Date(lastMonthEndBeijing.getTime() - 8 * 60 * 60 * 1000);
        } else {
          startDate = todayStart;
          endDate = beijingNow;
          
          const yesterdayBeijing = new Date(beijingNow);
          yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
          yesterdayBeijing.setUTCHours(0, 0, 0, 0);
          prevStartDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
          
          const yesterdayEndBeijing = new Date(beijingNow);
          yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
          prevEndDate = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
        }
        
        // 使用聚合管道优化查询性能
        const matchStage = teamMemberUserIds.length > 0 
          ? { userId: { $in: teamMemberUserIds }, createTime: { $gte: startDate, $lt: endDate } }
          : { createTime: { $gte: startDate, $lt: endDate } };
        
        const prevMatchStage = teamMemberUserIds.length > 0 
          ? { userId: { $in: teamMemberUserIds }, createTime: { $gte: prevStartDate, $lt: prevEndDate } }
          : { createTime: { $gte: prevStartDate, $lt: prevEndDate } };
        
        // 并行执行聚合查询
        const [currentStats, prevStats] = await Promise.all([
          GoldLog.aggregate([
            { $match: matchStage },
            { $group: { _id: null, count: { $sum: 1 }, totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' } } }
          ]),
          GoldLog.aggregate([
            { $match: prevMatchStage },
            { $group: { _id: null, count: { $sum: 1 }, totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' } } }
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
        
        const revenueGrowth = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue * 100).toFixed(1) : 0;
        const coinsGrowth = prevTotalGold > 0 ? ((totalGold - prevTotalGold) / prevTotalGold * 100).toFixed(1) : 0;
        const impressionsGrowth = prev.count > 0 ? ((totalImpressions - prev.count) / prev.count * 100).toFixed(1) : 0;
        const clicksGrowth = prev.count > 0 ? ((totalClicks - Math.floor(prev.count * 0.15)) / Math.floor(prev.count * 0.15) * 100).toFixed(1) : 0;
        
        // 活跃用户数计算 - 使用并行查询
        const [currentLoginRecords, prevLoginRecords] = await Promise.all([
          LoginRecord.find({ loginDate: { $gte: startDate, $lt: endDate } }),
          LoginRecord.find({ loginDate: { $gte: prevStartDate, $lt: prevEndDate } })
        ]);
        const activeUsers = new Set(currentLoginRecords.map(r => r.employeeId)).size;
        const prevActiveUsers = new Set(prevLoginRecords.map(r => r.employeeId)).size;
        
        const activeUsersGrowth = prevActiveUsers > 0 ? ((activeUsers - prevActiveUsers) / prevActiveUsers * 100).toFixed(1) : 0;
        
        const avgEcpm = totalImpressions > 0 ? (totalEcpm / totalImpressions).toFixed(2) : 0;
        const prevAvgEcpm = prev.count > 0 ? (prevTotalEcpm / prev.count).toFixed(2) : 0;
        const ecpmGrowth = prevAvgEcpm > 0 ? ((avgEcpm - prevAvgEcpm) / prevAvgEcpm * 100).toFixed(1) : 0;
        
        const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalGold * 0.01) / totalRevenue * 100).toFixed(1) : 0;
        const prevProfitMargin = prevTotalRevenue > 0 ? ((prevTotalRevenue - prevTotalGold * 0.01) / prevTotalRevenue * 100).toFixed(1) : 0;
        const profitMarginGrowth = prevProfitMargin > 0 ? (profitMargin - prevProfitMargin).toFixed(1) : 0;
        
        kpiData = {
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
        
        // 设置缓存，根据时间范围设置不同的TTL
        let cacheTTL;
        if (range === 'today') {
          cacheTTL = CACHE_TTL.today;
        } else if (range === 'yesterday') {
          cacheTTL = CACHE_TTL.yesterday;
        } else if (range === 'week') {
          cacheTTL = CACHE_TTL.week;
        } else if (range === 'month') {
          cacheTTL = CACHE_TTL.month;
        } else {
          cacheTTL = CACHE_TTL.today;
        }
        setCache(kpiCacheKey, kpiData, cacheTTL);
      }
      
      // 超管返回完整的团队和组数据
      const teamsCacheKey = `teams_superadmin_${range}`;
      let teamsWithStats = getFromCache(teamsCacheKey);
      
      if (!teamsWithStats) {
        const teams = await Team.find();
        teamsWithStats = await Promise.all(teams.map(async (team) => {
          const teamEmployees = await Employee.find({ parentId: team._id.toString() });
          const employeeIds = teamEmployees.map(e => e.employeeId);
          
          // 获取组列表
          const groups = await TeamGroup.find({ teamName: team.teamName });
          
          // 并行查询数据
          const [loginRecords, goldLogs, monthGoldLogs] = await Promise.all([
            LoginRecord.find({ employeeId: { $in: employeeIds }, loginDate: { $gte: todayStart } }),
            GoldLog.find({ employeeId: { $in: employeeIds }, createTime: { $gte: todayStart } }),
            GoldLog.find({ employeeId: { $in: employeeIds }, createTime: { $gte: monthStart } })
          ]);
          
          const todayActive = new Set(loginRecords.map(r => r.employeeId)).size;
          const todayRevenue = goldLogs.reduce((sum, log) => sum + log.gold, 0);
          const monthlyRevenue = monthGoldLogs.reduce((sum, log) => sum + log.gold, 0);
          
          return {
            id: team._id.toString(),
            name: team.teamName,
            memberCount: teamEmployees.length,
            todayActive,
            todayRevenue: parseFloat(todayRevenue.toFixed(2)),
            monthlyRevenue: parseFloat(monthlyRevenue.toFixed(2)),
            groups: groups.map(g => ({
              id: g._id.toString(),
              name: g.groupName,
              memberCount: teamEmployees.filter(e => e.teamGroupId === g._id.toString()).length
            }))
          };
        }));
        
        setCache(teamsCacheKey, teamsWithStats, CACHE_TTL.teams || CACHE_TTL.groups);
      }
      
      // 获取用户列表
      const usersCacheKey = `users_superadmin_${range}`;
      let topUsers = getFromCache(usersCacheKey);
      
      if (!topUsers) {
        const allEmployees = await Employee.find();
        const employeeMap = {};
        allEmployees.forEach(emp => { employeeMap[emp.employeeId] = emp; });
        
        const userGolds = await UserGold.find({ employeeId: { $in: allEmployees.map(e => e.employeeId) } });
        const userGoldMap = {};
        const userIds = [];
        userGolds.forEach(ug => { userGoldMap[ug.employeeId] = ug; userIds.push(ug.userId); });
        
        let startDate = todayStart;
        if (range === 'yesterday') {
          startDate = new Date(beijingNow);
          startDate.setDate(startDate.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
        } else if (range === 'week') {
          startDate = new Date(beijingNow);
          const dayOfWeek = startDate.getUTCDay() || 7;
          startDate.setDate(startDate.getDate() - (dayOfWeek - 1));
          startDate.setHours(0, 0, 0, 0);
        } else if (range === 'month') {
          startDate = monthStart;
        }
        
        const userStatsAggregation = await GoldLog.aggregate([
          { $match: { createTime: { $gte: startDate }, userId: { $in: userIds } } },
          { $group: { _id: "$userId", employeeId: { $first: "$employeeId" }, watched: { $sum: 1 }, earnings: { $sum: "$gold" }, totalEcpm: { $sum: { $ifNull: ["$ecpm", 0] } } } }
        ]);
        
        const userStatsMap = {};
        userStatsAggregation.forEach(stat => { userStatsMap[stat._id] = stat; });
        
        userGolds.forEach(ug => {
          if (!userStatsMap[ug.userId]) {
            userStatsMap[ug.userId] = { _id: ug.userId, employeeId: ug.employeeId, watched: 0, earnings: 0, totalEcpm: 0 };
          }
        });
        
        topUsers = Object.values(userStatsMap).slice(0, 20).map(stat => ({
          userId: stat._id,
          employeeId: stat.employeeId,
          watched: stat.watched,
          earnings: parseFloat(stat.earnings.toFixed(2)),
          avgEcpm: stat.watched > 0 ? parseFloat((stat.totalEcpm / stat.watched).toFixed(2)) : 0
        }));
        
        setCache(usersCacheKey, topUsers, CACHE_TTL.users || CACHE_TTL.groups);
      }
      
      return res.json({
        success: true,
        data: {
          kpi: kpiData,
          teams: teamsWithStats,
          groups: [],
          topUsers
        }
      });
    }
    
    // 团队长和普通管理员（NORMAL_ADMIN）只能查看自己团队的数据
    if (!currentAdmin.teamName) {
      return res.status(403).json({ success: false, message: '非团队长账号' });
    }
    
    // 初始化变量
    let teamsWithStats = [];
    
    // 1. 获取KPI数据（带缓存）
    const kpiCacheKey = getCacheKey(range, currentAdmin.teamName);
    // 暂时禁用缓存以便调试
    let kpiData = null; // getFromCache(kpiCacheKey);
    
    if (!kpiData) {
      const adminId = currentAdmin._id.toString ? currentAdmin._id.toString() : currentAdmin._id;
      const employees = await Employee.find({ parentId: adminId });
      const employeeIds = employees.map(e => e.employeeId);
      const teamMemberUserIds = employeeIds;
      
      // 时间范围
      const now = getUTCDate();
      const beijingNow = getBeijingDate();
      let startDate, endDate, prevStartDate, prevEndDate;
      
      if (range === 'today') {
        // 今天（北京时间）
        // 注意：LoginRecord 中的 loginDate 存储的是北京时间 0 点的 UTC 时间
        // 例如：北京时间 2026-04-17 00:00:00 存储为 2026-04-16T16:00:00.000Z
        const beijingDate = getBeijingDate();
        const todayStartBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate(), 0, 0, 0, 0);
        startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
        endDate = new Date(todayStartBeijing.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
        
        // 昨天
        const yesterdayBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - 1, 0, 0, 0, 0);
        prevStartDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
        prevEndDate = startDate;
      } else if (range === 'yesterday') {
        // 昨天（北京时间）
        const beijingDate = getBeijingDate();
        const yesterdayBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - 1, 0, 0, 0, 0);
        startDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
        endDate = new Date(yesterdayBeijing.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
        
        // 前天
        const dayBeforeBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - 2, 0, 0, 0, 0);
        prevStartDate = new Date(dayBeforeBeijing.getTime() - 8 * 60 * 60 * 1000);
        prevEndDate = startDate;
      } else if (range === 'week') {
        // 本周时间范围（从周一开始）
        const beijingDate = getBeijingDate();
        const dayOfWeek = beijingDate.getUTCDay() || 7; // 使用UTC计算星期几，0是周日改为7
        const daysToMonday = dayOfWeek - 1;
        const mondayBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - daysToMonday, 0, 0, 0, 0);
        startDate = new Date(mondayBeijing.getTime() - 8 * 60 * 60 * 1000);
        endDate = new Date(mondayBeijing.getTime() + 7 * 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
        
        // 上周收益
        const lastMondayBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - daysToMonday - 7, 0, 0, 0, 0);
        prevStartDate = new Date(lastMondayBeijing.getTime() - 8 * 60 * 60 * 1000);
        prevEndDate = startDate;
      } else if (range === 'month') {
        // 本月时间范围
        const beijingDate = getBeijingDate();
        const firstDayOfMonthBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), 1, 0, 0, 0, 0);
        const lastDayOfMonthBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth() + 1, 0, 23, 59, 59, 999);
        startDate = new Date(firstDayOfMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
        endDate = new Date(lastDayOfMonthBeijing.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
        
        // 上月收益
        const firstDayOfLastMonthBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth() - 1, 1, 0, 0, 0, 0);
        const lastDayOfLastMonthBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), 0, 23, 59, 59, 999);
        prevStartDate = new Date(firstDayOfLastMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
        prevEndDate = startDate;
      } else {
        // 默认今天
        const beijingDate = getBeijingDate();
        const todayStartBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate(), 0, 0, 0, 0);
        startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
        endDate = new Date(todayStartBeijing.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
        
        // 昨天
        const yesterdayBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - 1, 0, 0, 0, 0);
        prevStartDate = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
        prevEndDate = startDate;
      }
      
      // 使用聚合管道优化查询性能
      const matchStage = teamMemberUserIds.length > 0
        ? { employeeId: { $in: teamMemberUserIds }, createTime: { $gte: startDate, $lt: endDate } }
        : { createTime: { $gte: startDate, $lt: endDate } };

      const prevMatchStage = teamMemberUserIds.length > 0
        ? { employeeId: { $in: teamMemberUserIds }, createTime: { $gte: prevStartDate, $lt: prevEndDate } }
        : { createTime: { $gte: prevStartDate, $lt: prevEndDate } };
      
      // 并行执行聚合查询
      const [currentStats, prevStats] = await Promise.all([
        GoldLog.aggregate([
          { $match: matchStage },
          { $group: { _id: null, count: { $sum: 1 }, totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' } } }
        ]),
        GoldLog.aggregate([
          { $match: prevMatchStage },
          { $group: { _id: null, count: { $sum: 1 }, totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' } } }
        ])
      ]);
      
      const current = currentStats[0] || { count: 0, totalGold: 0, totalEcpm: 0 };
      const prev = prevStats[0] || { count: 0, totalGold: 0, totalEcpm: 0 };
      
      let totalImpressions = current.count;
      let totalClicks = Math.floor(totalImpressions * 0.15);
      let totalGold = current.totalGold;
      let totalRevenue = current.totalGold / 1000;
      let totalEcpmValue = current.totalEcpm;
      
      let prevTotalGold = prev.totalGold;
      let prevTotalRevenue = prev.totalGold / 1000;
      let prevTotalEcpmValue = prev.totalEcpm;
      
      const revenueGrowth = prevTotalRevenue > 0 ? ((totalRevenue - prevTotalRevenue) / prevTotalRevenue * 100).toFixed(1) : 0;
      const coinsGrowth = prevTotalGold > 0 ? ((totalGold - prevTotalGold) / prevTotalGold * 100).toFixed(1) : 0;
      const impressionsGrowth = prev.count > 0 ? ((totalImpressions - prev.count) / prev.count * 100).toFixed(1) : 0;
      const clicksGrowth = prev.count > 0 ? ((totalClicks - Math.floor(prev.count * 0.15)) / Math.floor(prev.count * 0.15) * 100).toFixed(1) : 0;
      
      // 活跃用户数计算 - 使用并行查询
      const [currentLoginRecords, prevLoginRecords] = await Promise.all([
        LoginRecord.find({
          loginDate: { $gte: startDate, $lt: endDate },
          employeeId: { $in: teamMemberUserIds }
        }),
        LoginRecord.find({
          loginDate: { $gte: prevStartDate, $lt: prevEndDate },
          employeeId: { $in: teamMemberUserIds }
        })
      ]);
      
      const activeUsers = new Set(currentLoginRecords.map(r => r.employeeId)).size;
      const prevActiveUsers = new Set(prevLoginRecords.map(r => r.employeeId)).size;
      
      const activeUsersGrowth = prevActiveUsers > 0 ? ((activeUsers - prevActiveUsers) / prevActiveUsers * 100).toFixed(1) : 0;
      
      const avgEcpm = totalImpressions > 0 ? (totalEcpmValue / totalImpressions).toFixed(2) : 0;
      const prevAvgEcpm = prev.count > 0 ? (prevTotalEcpmValue / prev.count).toFixed(2) : 0;
      const ecpmGrowth = prevAvgEcpm > 0 ? ((avgEcpm - prevAvgEcpm) / prevAvgEcpm * 100).toFixed(1) : 0;

      const avgGoldPerAd = totalImpressions > 0 ? (totalGold / totalImpressions).toFixed(2) : 0;
      const prevAvgGoldPerAd = prev.count > 0 ? (prevTotalGold / prev.count).toFixed(2) : 0;
      const avgGoldPerAdGrowth = prevAvgGoldPerAd > 0 ? ((avgGoldPerAd - prevAvgGoldPerAd) / prevAvgGoldPerAd * 100).toFixed(1) : 0;
      
      const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalGold * 0.01) / totalRevenue * 100).toFixed(1) : 0;
      const prevProfitMargin = prevTotalRevenue > 0 ? ((prevTotalRevenue - prevTotalGold * 0.01) / prevTotalRevenue * 100).toFixed(1) : 0;
      const profitMarginGrowth = prevProfitMargin > 0 ? (profitMargin - prevProfitMargin).toFixed(1) : 0;
      
      kpiData = {
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
        activeUsersGrowth: parseFloat(activeUsersGrowth),
        avgGoldPerAd: parseFloat(avgGoldPerAd),
        avgGoldPerAdGrowth: parseFloat(avgGoldPerAdGrowth)
      };
      
      // 设置缓存，根据时间范围设置不同的TTL
      let cacheTTL;
      if (range === 'today') {
        cacheTTL = CACHE_TTL.today;
      } else if (range === 'yesterday') {
        cacheTTL = CACHE_TTL.yesterday;
      } else if (range === 'week') {
        cacheTTL = CACHE_TTL.week;
      } else if (range === 'month') {
        cacheTTL = CACHE_TTL.month;
      } else {
        cacheTTL = CACHE_TTL.today;
      }
      setCache(kpiCacheKey, kpiData, cacheTTL);
    }
    
    // 2. 获取组列表（带缓存）
    const groupsCacheKey = `groups_${currentAdmin.teamName}_${range}`;
    let groupsWithStats = getFromCache(groupsCacheKey);

    if (!groupsWithStats) {
      const beijingDate = getBeijingDate();
      let rangeStartUTC, rangeEndUTC, prevStartUTC, prevEndUTC;

      if (range === 'today') {
        const todayStartBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate(), 0, 0, 0, 0);
        rangeStartUTC = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
        rangeEndUTC = new Date(todayStartBeijing.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
        const yesterdayBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - 1, 0, 0, 0, 0);
        prevStartUTC = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
        prevEndUTC = rangeStartUTC;
      } else if (range === 'yesterday') {
        const yesterdayBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - 1, 0, 0, 0, 0);
        rangeStartUTC = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
        rangeEndUTC = new Date(yesterdayBeijing.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
        const dayBeforeBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - 2, 0, 0, 0, 0);
        prevStartUTC = new Date(dayBeforeBeijing.getTime() - 8 * 60 * 60 * 1000);
        prevEndUTC = rangeStartUTC;
      } else if (range === 'week') {
        const dayOfWeek = beijingDate.getUTCDay() || 7;
        const daysToMonday = dayOfWeek - 1;
        const mondayBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - daysToMonday, 0, 0, 0, 0);
        rangeStartUTC = new Date(mondayBeijing.getTime() - 8 * 60 * 60 * 1000);
        rangeEndUTC = new Date(beijingDate.getTime() + 8 * 60 * 60 * 1000);
        const lastMondayBeijing = new Date(mondayBeijing.getTime() - 7 * 24 * 60 * 60 * 1000);
        prevStartUTC = new Date(lastMondayBeijing.getTime() - 8 * 60 * 60 * 1000);
        prevEndUTC = rangeStartUTC;
      } else if (range === 'month') {
        const firstDayOfMonthBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), 1, 0, 0, 0, 0);
        rangeStartUTC = new Date(firstDayOfMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
        rangeEndUTC = new Date(beijingDate.getTime() + 8 * 60 * 60 * 1000);
        const firstDayOfLastMonthBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth() - 1, 1, 0, 0, 0, 0);
        prevStartUTC = new Date(firstDayOfLastMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
        prevEndUTC = rangeStartUTC;
      } else {
        const todayStartBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate(), 0, 0, 0, 0);
        rangeStartUTC = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
        rangeEndUTC = new Date(todayStartBeijing.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
        const yesterdayBeijing = new Date(beijingDate.getFullYear(), beijingDate.getMonth(), beijingDate.getDate() - 1, 0, 0, 0, 0);
        prevStartUTC = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
        prevEndUTC = rangeStartUTC;
      }

      const groups = await TeamGroup.find({ teamName: currentAdmin.teamName });

      const groupsWithStatsData = await Promise.all(groups.map(async (group) => {
        // 优化：使用多种条件查询员工，支持不同格式的 teamGroupId
        let groupEmployees;
        if (group && group.groupName) {
          groupEmployees = await Employee.find({
            $or: [
              { groupName: group.groupName },
              { teamGroupId: group._id.toString() },
              { teamGroupId: group._id }
            ]
          });
        } else {
          groupEmployees = await Employee.find({ teamGroupId: group._id.toString() });
        }
        const employeeIds = groupEmployees.map(emp => emp.employeeId);

        if (employeeIds.length === 0) {
          return {
            id: group._id.toString(),
            name: group.groupName,
            teamId: group.teamLeaderId,
            teamName: group.teamName,
            commission: group.commission || 0.05,
            memberCount: 0,
            todayActive: 0,
            todayRevenue: 0,
            todayGoldRevenue: 0,
            monthlyRevenue: 0,
            monthlyGoldRevenue: 0,
            todayAdCount: 0,
            avgEcpm: 0,
            yesterdayRevenue: 0,
            yesterdayGoldRevenue: 0
          };
        }

        const rangeStats = await GoldLog.aggregate([
          { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: rangeStartUTC, $lt: rangeEndUTC } } },
          { $group: { _id: null, count: { $sum: 1 }, totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' } } }
        ]);

        const prevStats = await GoldLog.aggregate([
          { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: prevStartUTC, $lt: prevEndUTC } } },
          { $group: { _id: null, count: { $sum: 1 }, totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' } } }
        ]);

        const currentStats = rangeStats[0] || { count: 0, totalGold: 0, totalEcpm: 0 };
        const prev = prevStats[0] || { count: 0, totalGold: 0, totalEcpm: 0 };

        const rangeGoldRevenue = currentStats.totalGold / 1000;
        const prevGoldRevenue = prev.totalGold / 1000;
        const rangeCommission = rangeGoldRevenue * (group.commission || 0.05);
        const prevCommission = prevGoldRevenue * (group.commission || 0.05);
        const avgEcpm = currentStats.count > 0 ? (currentStats.totalGold / currentStats.count) : 0;

        return {
          id: group._id.toString(),
          name: group.groupName,
          teamId: group.teamLeaderId,
          teamName: group.teamName,
          commission: group.commission || 0.05,
          memberCount: employeeIds.length,
          todayActive: 0,
          todayRevenue: parseFloat(rangeCommission.toFixed(2)),
          todayGoldRevenue: parseFloat(rangeGoldRevenue.toFixed(2)),
          monthlyRevenue: 0,
          monthlyGoldRevenue: 0,
          todayAdCount: currentStats.count,
          avgEcpm: parseFloat(avgEcpm.toFixed(2)),
          yesterdayRevenue: parseFloat(prevCommission.toFixed(2)),
          yesterdayGoldRevenue: parseFloat(prevGoldRevenue.toFixed(2))
        };
      }));

      groupsWithStats = groupsWithStatsData;

      setCache(groupsCacheKey, groupsWithStats, CACHE_TTL.groups);
    }

    const totalGroupCommission = groupsWithStats.reduce((sum, g) => sum + (g.todayRevenue || 0), 0);
    const teamLeadCommission = kpiData.revenue * 0.2 - totalGroupCommission;

    kpiData.teamLeadCommission = parseFloat(teamLeadCommission.toFixed(2));
    kpiData.groupLeadersCommission = parseFloat(totalGroupCommission.toFixed(2));
    kpiData.teamUserRevenue = parseFloat(kpiData.revenue.toFixed(2));

    // 3. 获取用户列表（带缓存）
    const usersCacheKey = `users_${currentAdmin.teamName}_${range}`;
    let topUsers = getFromCache(usersCacheKey);
    
    if (!topUsers) {
      topUsers = [];
      
      // 设置缓存
      setCache(usersCacheKey, topUsers, CACHE_TTL.today);
    }
    
    // 4. 获取员工账号列表（带缓存）
    const employeesCacheKey = `employees_${currentAdmin.teamName}`;
    let employeeAccounts = getFromCache(employeesCacheKey);
    
    if (!employeeAccounts) {
      const allEmployeesForAccounts = await Employee.find({ parentId: currentAdmin._id.toString() });
      employeeAccounts = allEmployeesForAccounts.map(emp => ({
        id: emp._id.toString(),
        employeeId: emp.employeeId,
        realName: emp.realName || '',
        groupName: emp.groupName || '',
        teamGroupId: emp.teamGroupId || '',
        createdAt: emp.createdAt
      }));
      
      // 设置缓存
      setCache(employeesCacheKey, employeeAccounts, CACHE_TTL.groups);
    }
    
    // 合并所有数据
    const result = {
      kpi: kpiData,
      teams: [],
      groups: groupsWithStats,
      users: topUsers,
      employees: employeeAccounts
    };
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取团队长数据错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 6. GET /admin/dashboard/team-leader/teams
// 团队列表接口
router.get('/team-leader/teams', authMiddleware, async (req, res) => {
  try {
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay();
    const monthStart = new Date(beijingNow);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);
    const todayEndUTC = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
    const monthStartUTC = new Date(monthStart.getTime() - 8 * 60 * 60 * 1000);

    const currentAdmin = await Admin.findById(req.user.id);
    if (!currentAdmin) {
      return res.status(403).json({ success: false, message: '管理员信息不存在' });
    }

    const adminId = currentAdmin._id.toString();

    const [employees, groups] = await Promise.all([
      Employee.find({ parentId: adminId }),
      TeamGroup.find({ teamLeaderId: adminId })
    ]);

    const employeeIds = employees.map(e => e.employeeId);
    const groupIds = groups.map(g => g._id.toString());

    const [todayGoldLogs, monthGoldLogs, totalGoldLogs, todayLoginRecords, monthLoginRecords] = await Promise.all([
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: todayStartUTC, $lt: todayEndUTC } } },
        { $group: { _id: null, totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' }, count: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: monthStartUTC, $lt: todayEndUTC } } },
        { $group: { _id: null, totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' }, count: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds } } },
        { $group: { _id: null, totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' }, count: { $sum: 1 } } }
      ]),
      LoginRecord.aggregate([
        { $match: { employeeId: { $in: employeeIds }, loginDate: { $gte: todayStartUTC, $lt: todayEndUTC } } },
        { $group: { _id: '$employeeId' } }
      ]),
      LoginRecord.aggregate([
        { $match: { employeeId: { $in: employeeIds }, loginDate: { $gte: monthStartUTC, $lt: todayEndUTC } } },
        { $group: { _id: '$employeeId' } }
      ])
    ]);

    const todayGold = todayGoldLogs[0] || { totalGold: 0, totalEcpm: 0, count: 0 };
    const monthGold = monthGoldLogs[0] || { totalGold: 0, totalEcpm: 0, count: 0 };
    const totalGold = totalGoldLogs[0] || { totalGold: 0, totalEcpm: 0, count: 0 };
    const todayActiveCount = todayLoginRecords.length;
    const monthActiveCount = monthLoginRecords.length;

    const todayRevenue = todayGold.totalGold / 1000;
    const monthRevenue = monthGold.totalGold / 1000;
    const totalRevenue = totalGold.totalGold / 1000;

    const todayEarnings = todayRevenue * 0.2;
    const monthEarnings = monthRevenue * 0.2;
    const totalEarnings = totalRevenue * 0.2;

    const todayEcpm = todayGold.count > 0 ? todayGold.totalEcpm / todayGold.count : 0;
    const todayActiveRate = employees.length > 0 ? ((todayActiveCount / employees.length) * 100).toFixed(0) + '%' : '0%';
    const monthActiveRate = employees.length > 0 ? ((monthActiveCount / employees.length) * 100).toFixed(0) + '%' : '0%';

    const yesterdayStartUTC = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayEndUTC = todayStartUTC;

    const [yesterdayGoldLogs] = await Promise.all([
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: yesterdayStartUTC, $lt: yesterdayEndUTC } } },
        { $group: { _id: null, totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
      ])
    ]);

    const yesterdayGold = yesterdayGoldLogs[0] || { totalGold: 0, count: 0 };
    const yesterdayRevenue = yesterdayGold.totalGold / 1000;
    const todayGrowth = yesterdayRevenue > 0 ? (((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100).toFixed(1) : 0;

    const lastMonthStart = new Date(monthStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);
    const lastMonthStartUTC = new Date(lastMonthStart.getTime() - 8 * 60 * 60 * 1000);

    const [lastMonthGoldLogs] = await Promise.all([
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: lastMonthStartUTC, $lt: monthStartUTC } } },
        { $group: { _id: null, totalGold: { $sum: '$gold' } } }
      ])
    ]);

    const lastMonthGold = lastMonthGoldLogs[0] || { totalGold: 0 };
    const lastMonthRevenue = lastMonthGold.totalGold / 1000;
    const monthGrowth = lastMonthRevenue > 0 ? (((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1) : 0;

    let level = '新锐';
    if (totalRevenue >= 100000) level = '荣耀';
    else if (totalRevenue >= 50000) level = '王牌';
    else if (totalRevenue >= 10000) level = '精英';

    const teamData = {
      id: adminId,
      leader: currentAdmin.realName || currentAdmin.username,
      memberCount: employees.length,
      todayAds: todayGold.count,
      monthlyAds: monthGold.count,
      totalAds: totalGold.count,
      todayRevenue: parseFloat(todayRevenue.toFixed(2)),
      todayEarnings: parseFloat(todayEarnings.toFixed(2)),
      earnings: parseFloat(totalEarnings.toFixed(2)),
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalEarnings: parseFloat(totalEarnings.toFixed(2)),
      todayGrowth: parseFloat(todayGrowth),
      monthGrowth: parseFloat(monthGrowth),
      ecpm: parseFloat(todayEcpm.toFixed(2)),
      todayActiveRate: todayActiveRate,
      monthlyActiveRate: monthActiveRate,
      level: level
    };

    res.json({
      success: true,
      message: '获取团队列表成功',
      data: [teamData]
    });
  } catch (error) {
    console.error('获取团队列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 7. GET /admin/dashboard/team-leader/teams/:leaderId/members
// 团队成员列表接口
router.get('/team-leader/teams/:leaderId/members', authMiddleware, async (req, res) => {
  try {
    const { leaderId } = req.params;
    const mode = req.query.mode || 'today';

    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay();
    const monthStart = new Date(beijingNow);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);
    const todayEndUTC = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 8 * 60 * 60 * 1000);
    const monthStartUTC = new Date(monthStart.getTime() - 8 * 60 * 60 * 1000);

    const currentAdmin = await Admin.findById(req.user.id);
    if (!currentAdmin) {
      return res.status(403).json({ success: false, message: '管理员信息不存在' });
    }

    // 超管可以访问所有团队数据，团队长只能访问自己的团队数据
    if (currentAdmin.role !== 'superadmin' && leaderId !== currentAdmin._id.toString()) {
      return res.status(403).json({ success: false, message: '无权访问该团队数据' });
    }

    const employees = await Employee.find({ parentId: leaderId });
    const employeeIds = employees.map(e => e.employeeId);

    const rangeStart = mode === 'month' ? monthStartUTC : todayStartUTC;
    const rangeEnd = todayEndUTC;

    const [todayGoldLogs, monthGoldLogs, todayLoginRecords] = await Promise.all([
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: todayStartUTC, $lt: todayEndUTC } } },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' }, count: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: monthStartUTC, $lt: todayEndUTC } } },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' }, totalEcpm: { $sum: '$ecpm' }, count: { $sum: 1 } } }
      ]),
      LoginRecord.find({
        employeeId: { $in: employeeIds },
        loginDate: { $gte: todayStartUTC, $lt: todayEndUTC }
      })
    ]);

    const todayGoldMap = new Map(todayGoldLogs.map(g => [g._id, g]));
    const monthGoldMap = new Map(monthGoldLogs.map(g => [g._id, g]));
    const todayActiveSet = new Set(todayLoginRecords.map(r => r.employeeId));

    const members = employees.map(emp => {
      const todayData = todayGoldMap.get(emp.employeeId) || { totalGold: 0, totalEcpm: 0, count: 0 };
      const monthData = monthGoldMap.get(emp.employeeId) || { totalGold: 0, totalEcpm: 0, count: 0 };

      const todayWatched = todayData.count;
      const monthlyWatched = monthData.count;
      const todayEarnings = todayData.totalGold / 1000; // 转换为元
      const monthlyEarnings = monthData.totalGold / 1000; // 转换为元
      const todayEcpm = todayWatched > 0 ? todayData.totalEcpm / todayWatched : 0;
      const monthlyEcpm = monthlyWatched > 0 ? monthData.totalEcpm / monthlyWatched : 0;
      const isActive = todayActiveSet.has(emp.employeeId);

      // 计算平均金币（Agc）
      const todayAgc = todayWatched > 0 ? (todayData.totalGold / todayWatched) : 0;
      const monthlyAgc = monthlyWatched > 0 ? (monthData.totalGold / monthlyWatched) : 0;

      return {
        id: emp.employeeId,
        name: emp.realName || emp.employeeId,
        avatar: '',
        todayWatched: todayWatched,
        monthlyWatched: monthlyWatched,
        todayEarnings: parseFloat(todayEarnings.toFixed(2)),
        monthlyEarnings: parseFloat(monthlyEarnings.toFixed(2)),
        todayAgc: parseFloat(todayAgc.toFixed(2)),
        monthlyAgc: parseFloat(monthlyAgc.toFixed(2)),
        status: isActive ? '在线' : '离线'
      };
    });

    res.json(members);
  } catch (error) {
    console.error('获取团队成员列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 团队长收益数据接口
router.get('/team-leader/revenue', authMiddleware, async (req, res) => {
  try {
    const currentAdmin = await Admin.findById(req.user.id);
    if (!currentAdmin || !currentAdmin.teamName) {
      return res.status(403).json({ success: false, message: '无权限访问' });
    }

    // 检查缓存
    const cacheKey = `team_leader_revenue_${currentAdmin._id.toString()}`;
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    // 获取团队长下的所有员工
    const employees = await Employee.find({ parentId: currentAdmin._id.toString() });
    const employeeIds = employees.map(e => e.employeeId);
    
    if (employeeIds.length === 0) {
      const emptyData = {
        today: 0,
        thisMonth: 0,
        lastMonth: 0,
        total: 0
      };
      setCache(cacheKey, emptyData, CACHE_TTL.today);
      return res.json({
        success: true,
        data: emptyData
      });
    }

    // 获取团队下的所有组别
    const groups = await TeamGroup.find({ teamLeaderId: currentAdmin._id.toString() });
    const groupById = {};
    groups.forEach(g => {
      groupById[g._id.toString()] = g;
    });

    // 时间范围计算
    const beijingNow = getBeijingDate();
    const now = getUTCDate();
    
    // 今日开始
    const todayStartBeijing = new Date(beijingNow);
    todayStartBeijing.setUTCHours(0, 0, 0, 0);
    const todayStart = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 本月开始
    const monthStartBeijing = new Date(beijingNow);
    monthStartBeijing.setUTCDate(1);
    monthStartBeijing.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(monthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 上月开始和结束
    const lastMonthStartBeijing = new Date(beijingNow);
    lastMonthStartBeijing.setUTCMonth(lastMonthStartBeijing.getUTCMonth() - 1);
    lastMonthStartBeijing.setUTCDate(1);
    lastMonthStartBeijing.setUTCHours(0, 0, 0, 0);
    const lastMonthStart = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    const lastMonthEndBeijing = new Date(monthStartBeijing);
    lastMonthEndBeijing.setUTCDate(0);
    lastMonthEndBeijing.setUTCHours(23, 59, 59, 999);
    const lastMonthEnd = new Date(lastMonthEndBeijing.getTime() - 8 * 60 * 60 * 1000);

    // 并行执行聚合查询，提高性能
    const [todayStats, monthStats, lastMonthStats, totalStats] = await Promise.all([
      // 今日数据
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: todayStart } } },
        { $group: { _id: null, totalGold: { $sum: '$gold' } } }
      ]),
      // 本月数据
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: monthStart } } },
        { $group: { _id: null, totalGold: { $sum: '$gold' } } }
      ]),
      // 上月数据
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
        { $group: { _id: null, totalGold: { $sum: '$gold' } } }
      ]),
      // 累计数据
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds } } },
        { $group: { _id: null, totalGold: { $sum: '$gold' } } }
      ])
    ]);

    // 按组别计算组长收益 - 优化版本
    const calculateGroupLeaderRevenueOptimized = async (start, end) => {
      // 构建查询条件
      const matchCondition = { employeeId: { $in: employeeIds }, createTime: { $gte: start } };
      if (end) {
        matchCondition.createTime.$lt = end;
      }
      
      // 一次性查询所有员工的金币记录
      const allGoldLogs = await GoldLog.aggregate([
        { $match: matchCondition },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' } } }
      ]);
      
      // 按员工ID构建映射
      const goldByEmployee = {};
      allGoldLogs.forEach(log => {
        goldByEmployee[log._id] = log.totalGold;
      });
      
      // 在JavaScript中按组计算
      let totalGroupLeaderRevenue = 0;
      for (const group of groups) {
        const groupEmployees = employees.filter(e => e.teamGroupId === group._id.toString());
        if (groupEmployees.length === 0) continue;
        
        let groupGold = 0;
        groupEmployees.forEach(emp => {
          groupGold += goldByEmployee[emp.employeeId] || 0;
        });
        
        totalGroupLeaderRevenue += (groupGold * (group.commission || 0)) / 1000;
      }
      
      return totalGroupLeaderRevenue;
    };

    // 并行计算组长收益
    const [todayGroupRevenue, monthGroupRevenue, lastMonthGroupRevenue, totalGroupRevenue] = await Promise.all([
      calculateGroupLeaderRevenueOptimized(todayStart),
      calculateGroupLeaderRevenueOptimized(monthStart),
      calculateGroupLeaderRevenueOptimized(lastMonthStart, lastMonthEnd),
      calculateGroupLeaderRevenueOptimized(new Date(0))
    ]);

    // 计算各时间范围的收益
    const calculateFinalRevenue = (totalGold, groupRevenue) => {
      const teamUserRevenue = (totalGold || 0) / 1000;
      const teamCommissionRevenue = (teamUserRevenue * 0.2) - groupRevenue;
      return Math.max(0, teamCommissionRevenue);
    };

    const todayRevenue = calculateFinalRevenue(todayStats[0]?.totalGold, todayGroupRevenue);
    const thisMonthRevenue = calculateFinalRevenue(monthStats[0]?.totalGold, monthGroupRevenue);
    const lastMonthRevenue = calculateFinalRevenue(lastMonthStats[0]?.totalGold, lastMonthGroupRevenue);
    const totalRevenue = calculateFinalRevenue(totalStats[0]?.totalGold, totalGroupRevenue);

    const resultData = {
      today: parseFloat(todayRevenue.toFixed(2)),
      thisMonth: parseFloat(thisMonthRevenue.toFixed(2)),
      lastMonth: parseFloat(lastMonthRevenue.toFixed(2)),
      total: parseFloat(totalRevenue.toFixed(2))
    };

    // 设置缓存
    setCache(cacheKey, resultData, CACHE_TTL.today);

    res.json({
      success: true,
      data: resultData
    });
  } catch (error) {
    console.error('获取团队长收益数据错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
