const express = require('express');
const mongoose = require('mongoose');
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
    const { team, group } = req.query;
    
    // 检查缓存
    const cacheKey = getCacheKey(range, team || group);
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }
    
    const now = getUTCDate();
    const beijingNow = getBeijingDate();
    let startDate, endDate, prevStartDate, prevEndDate;
    
    // 团队筛选 - 使用管理员账号的teamName或group筛选
    let teamMemberUserIds = null;
    let employeeIds = null; // 用于LoginRecord查询的员工ID列表
    let commissionRate = 0.06; // 默认6%提成率
    
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
        
        // 使用团队长的提成率
        commissionRate = admin.commission || 0.1;
      }
    } else if (group) {
      // 组长：根据groupId查询该组的员工
      const groupDoc = await TeamGroup.findById(group);
      if (groupDoc) {
        const employees = await Employee.find({
          $or: [
            { groupName: groupDoc.groupName },
            { teamGroupId: group },
            { teamGroupId: groupDoc._id.toString() }
          ]
        });
        employeeIds = employees.map(e => e.employeeId);
        const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
        teamMemberUserIds = userGolds.map(ug => ug.userId);
        
        // 使用组长的提成率（统一 5%）
        commissionRate = 0.05;
      }
    } else if (req.user.role !== 'superadmin' && req.user.role !== 'SUPER_ADMIN') {
      // 非超管，根据当前登录用户角色进行筛选
      const currentAdmin = await Admin.findById(req.user.id);
      if (currentAdmin) {
        if (currentAdmin.teamGroupId && 
            (currentAdmin.role === 'GROUP_LEADER' || currentAdmin.role === 'group_leader')) {
          // 组长：按groupName筛选（先获取组信息）
          const grp = await TeamGroup.findById(currentAdmin.teamGroupId);
          let employees;
          if (grp && grp.groupName) {
            employees = await Employee.find({
              $or: [
                { groupName: grp.groupName },
                { teamGroupId: currentAdmin.teamGroupId },
                { teamGroupId: grp._id.toString() }
              ]
            });
          } else {
            employees = await Employee.find({ teamGroupId: currentAdmin.teamGroupId });
          }
          employeeIds = employees.map(e => e.employeeId);
          const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
          teamMemberUserIds = userGolds.map(ug => ug.userId);
          
          // 使用组长的提成率（统一 5%）
          commissionRate = 0.05;
        } else if (currentAdmin.teamName && 
                  (currentAdmin.role === 'NORMAL_ADMIN' || currentAdmin.role === 'normal_admin')) {
          // 团队长：包含直推员工 + 下属所有组的员工
          // 1. 直推员工（parentId 匹配）
          const directEmployees = await Employee.find({ parentId: currentAdmin._id.toString() });
          
          // 2. 下属组的员工（通过 teamLeaderId 找到所有组，再找组内员工）
          const adminGroups = await TeamGroup.find({ teamLeaderId: currentAdmin._id }).lean();
          const groupNames = adminGroups.map(g => g.groupName).filter(Boolean);
          const groupIds = adminGroups.map(g => String(g._id));
          
          let groupEmployees = [];
          if (groupNames.length > 0 || groupIds.length > 0) {
            groupEmployees = await Employee.find({
              $or: [
                { groupName: { $in: groupNames } },
                { teamGroupId: { $in: groupIds } }
              ]
            });
          }
          
          // 合并去重
          const allEmployeesMap = new Map();
          directEmployees.forEach(e => allEmployeesMap.set(String(e.employeeId), e));
          groupEmployees.forEach(e => allEmployeesMap.set(String(e.employeeId), e));
          const employees = Array.from(allEmployeesMap.values());
          
          employeeIds = employees.map(e => e.employeeId);
          const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
          teamMemberUserIds = userGolds.map(ug => ug.userId);
          
          // 使用团队长的提成率
          commissionRate = currentAdmin.commission || 0.1;
          
          // 标记：团队长角色，后续计算拆分数据
          req._isTeamLeaderRole = true;
          req._teamLeaderAdminId = currentAdmin._id;
          req._teamLeaderDirectEmpIds = directEmployees.map(e => e.employeeId);
          req._teamLeaderGroupEmpIds = groupEmployees.map(e => e.employeeId);
          req._teamLeaderCommission = commissionRate;
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
    // 本组总业绩 = 总金币 / 1000（金币口径）
    let totalRevenue = current.totalGold / 1000;
    let totalEcpm = current.totalEcpm;
    
    let prevTotalGold = prev.totalGold;
    // 对比期总业绩 = 对比期总金币 / 1000（金币口径）
    let prevTotalRevenue = prev.totalGold / 1000;
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
    
    // 活跃用户数计算 - 使用金币记录（有金币记录才算活跃）
    const currentActiveLogs = await GoldLog.distinct('userId', {
      createTime: { $gte: startDate, $lt: endDate },
      ...(teamMemberUserIds ? { userId: { $in: teamMemberUserIds } } : {})
    });
    const activeUsers = currentActiveLogs.length;
    
    // 对比时间范围的活跃用户数
    const prevActiveLogs = await GoldLog.distinct('userId', {
      createTime: { $gte: prevStartDate, $lt: prevEndDate },
      ...(teamMemberUserIds ? { userId: { $in: teamMemberUserIds } } : {})
    });
    const prevActiveUsers = prevActiveLogs.length;
    
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
    
    // 计算总业绩和总提成（基于金币口径）
    const totalPerformance = totalGold / 1000; // 用户收益
    const totalCommissionAmount = totalPerformance * commissionRate; // 组长提成
    const prevPerformance = prevTotalGold / 1000;
    const prevCommissionAmount = prevPerformance * commissionRate;
    
    // 总业绩环比（基于金币口径）
    const totalPerformanceGrowth = prevPerformance > 0 
      ? ((totalPerformance - prevPerformance) / prevPerformance * 100).toFixed(1)
      : 0;
    // 总提成环比
    const commissionGrowth = prevCommissionAmount > 0 
      ? ((totalCommissionAmount - prevCommissionAmount) / prevCommissionAmount * 100).toFixed(1)
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
      activeUsersGrowth: parseFloat(activeUsersGrowth),
      // 新增字段：基于金币口径计算
      totalPerformance: parseFloat(totalPerformance.toFixed(2)), // 本组总业绩（用户收益合计）
      totalPerformanceGrowth: parseFloat(totalPerformanceGrowth), // 总业绩环比
      totalCommission: parseFloat(totalCommissionAmount.toFixed(2)), // 本组总提成
      commissionRate: commissionRate, // 提成率
      totalCommissionGrowth: parseFloat(commissionGrowth), // 总提成环比
      registeredUsers: employeeIds ? employeeIds.length : 0, // 在册用户数
      activeUserCount: activeUsers, // 活跃用户数
      activeRate: employeeIds && employeeIds.length > 0 
        ? parseFloat((activeUsers / employeeIds.length * 100).toFixed(1)) 
        : 0 // 活跃率
    };
    
    // === 团队长角色：补充直推/间推拆分数据 ===
    if (req._isTeamLeaderRole) {
      const mongoose = require('mongoose');
      const EmployeeModel = mongoose.model('Employee');
      const UserGoldModel = mongoose.model('UserGold');
      const GoldLogModel = mongoose.model('GoldLog');
      
      const tlCommission = req._teamLeaderCommission;
      const glOwnRate = 0.05;
      const directEmpIds = req._teamLeaderDirectEmpIds || [];
      const groupEmpIds = req._teamLeaderGroupEmpIds || [];
      
      // 直推员工→用户
      const directUgs = await UserGoldModel.find({ employeeId: { $in: directEmpIds } }).select('userId').lean();
      const directUserIds = directUgs.map(u => u.userId);
      // 间推员工→用户
      const indirectUgs = await UserGoldModel.find({ employeeId: { $in: groupEmpIds } }).select('userId').lean();
      const indirectUserIds = indirectUgs.map(u => u.userId);
      
      // === 直推/间推 统计函数 ===
      async function calcSplit(userIds, empIds, isDirect) {
        const curLogs = await GoldLogModel.find({
          userId: { $in: userIds }, createTime: { $gte: startDate, $lt: endDate }
        }).select('gold commissionRate tlCommissionRate parentTlCommissionRate').lean();
        const prevLogs = await GoldLogModel.find({
          userId: { $in: userIds }, createTime: { $gte: prevStartDate, $lt: prevEndDate }
        }).select('gold commissionRate tlCommissionRate parentTlCommissionRate').lean();
        
        let curGold = 0, curImpressions = curLogs.length;
        let prevGold = 0, prevImpressions = prevLogs.length;
        let curCommGold = 0, prevCommGold = 0;
        
        // dRateExprRate（直推提成率）
        function dRateExprRate(l, fallback) {
          const hasTl = typeof l.tlCommissionRate === 'number' && l.tlCommissionRate > 0 && l.tlCommissionRate <= 1;
          const hasGl = typeof l.commissionRate === 'number' && l.commissionRate > 0 && l.commissionRate <= 1;
          return hasTl ? l.tlCommissionRate : (hasGl ? l.commissionRate : fallback);
        }
        // ptlRateExprForSub（间推级差提成率）
        function ptlRateExprForSub(l, subOwnRate, fallback) {
          const hasPtl = typeof l.parentTlCommissionRate === 'number' && l.parentTlCommissionRate > 0 && l.parentTlCommissionRate <= 1;
          const hasTl = typeof l.tlCommissionRate === 'number' && l.tlCommissionRate > 0 && l.tlCommissionRate <= 1;
          const hasGl = typeof l.commissionRate === 'number' && l.commissionRate > 0 && l.commissionRate <= 1;
          if (hasPtl) return l.parentTlCommissionRate;
          let inferred = 0;
          if (hasTl) inferred = Math.max(0, l.tlCommissionRate - subOwnRate);
          else if (hasGl) inferred = Math.max(0, l.commissionRate - subOwnRate);
          if (inferred === 0) inferred = Math.max(0, fallback);
          return inferred;
        }
        
        for (const l of curLogs) {
          const g = +l.gold || 0;
          curGold += g;
          if (isDirect) {
            curCommGold += g * dRateExprRate(l, tlCommission);
          } else {
            const subOwnRate = glOwnRate;
            curCommGold += g * ptlRateExprForSub(l, subOwnRate, Math.max(0, tlCommission - subOwnRate));
          }
        }
        for (const l of prevLogs) {
          const g = +l.gold || 0;
          prevGold += g;
          if (isDirect) {
            prevCommGold += g * dRateExprRate(l, tlCommission);
          } else {
            const subOwnRate = glOwnRate;
            prevCommGold += g * ptlRateExprForSub(l, subOwnRate, Math.max(0, tlCommission - subOwnRate));
          }
        }
        
        const revenue = +(curGold / 1000).toFixed(2);
        const prevRevenue = +(prevGold / 1000).toFixed(2);
        const revenueGrowth = prevRevenue > 0 ? +(((revenue - prevRevenue) / prevRevenue) * 100).toFixed(1) : 0;
        
        const commission = +(curCommGold / 1000).toFixed(2);
        const prevCommission = +(prevCommGold / 1000).toFixed(2);
        const commissionGrowth = prevCommission > 0 ? +(((commission - prevCommission) / prevCommission) * 100).toFixed(1) : 0;
        
        const impressionsGrowth = prevImpressions > 0 ? +(((curImpressions - prevImpressions) / prevImpressions) * 100).toFixed(1) : 0;
        
        // 活跃用户（按金币记录）
        const matchCur = { userId: { $in: userIds }, createTime: { $gte: startDate, $lt: endDate } };
        const matchPrev = { userId: { $in: userIds }, createTime: { $gte: prevStartDate, $lt: prevEndDate } };
        const curActive = await GoldLogModel.distinct('userId', matchCur);
        const prevActive = await GoldLogModel.distinct('userId', matchPrev);
        const activeUserCount = curActive.length;
        const activeUsersGrowth = prevActive.length > 0 ? +(((activeUserCount - prevActive.length) / prevActive.length) * 100).toFixed(1) : 0;
        // 在册用员工数口径（与 KPI 汇总 registeredUsers 保持一致）
        const registeredUsers = empIds.length;
        const activeRate = registeredUsers > 0 ? +((activeUserCount / registeredUsers * 100).toFixed(1)) : 0;
        
        return {
          revenue,
          revenueGrowth,
          commission,
          commissionGrowth,
          impressions: curImpressions,
          impressionsGrowth,
          registeredUsers,
          activeUserCount,
          activeRate,
          activeUsersGrowth
        };
      }
      
      const directSplit = await calcSplit(directUserIds, directEmpIds, true);
      const indirectSplit = await calcSplit(indirectUserIds, groupEmpIds, false);
      
      // 附加到返回数据
      resultData.directRevenue = directSplit.revenue;
      resultData.directRevenueGrowth = directSplit.revenueGrowth;
      resultData.directCommission = directSplit.commission;
      resultData.directCommissionGrowth = directSplit.commissionGrowth;
      resultData.directImpressions = directSplit.impressions;
      resultData.directImpressionsGrowth = directSplit.impressionsGrowth;
      resultData.directRegisteredUsers = directSplit.registeredUsers;
      resultData.directActiveUserCount = directSplit.activeUserCount;
      resultData.directActiveRate = directSplit.activeRate;
      resultData.directActiveUsersGrowth = directSplit.activeUsersGrowth;
      
      resultData.indirectRevenue = indirectSplit.revenue;
      resultData.indirectRevenueGrowth = indirectSplit.revenueGrowth;
      resultData.indirectCommission = indirectSplit.commission;
      resultData.indirectCommissionGrowth = indirectSplit.commissionGrowth;
      resultData.indirectImpressions = indirectSplit.impressions;
      resultData.indirectImpressionsGrowth = indirectSplit.impressionsGrowth;
      resultData.indirectRegisteredUsers = indirectSplit.registeredUsers;
      resultData.indirectActiveUserCount = indirectSplit.activeUserCount;
      resultData.indirectActiveRate = indirectSplit.activeRate;
      resultData.indirectActiveUsersGrowth = indirectSplit.activeUsersGrowth;
      
      // 汇总字段对齐拆分合计，确保口径一致
      const splitTotalRevenue = +(directSplit.revenue + indirectSplit.revenue).toFixed(2);
      const splitTotalCommission = +(directSplit.commission + indirectSplit.commission).toFixed(2);
      const splitTotalImpressions = directSplit.impressions + indirectSplit.impressions;
      const splitTotalRegistered = directSplit.registeredUsers + indirectSplit.registeredUsers;
      const splitTotalActive = directSplit.activeUserCount + indirectSplit.activeUserCount;
      const splitTotalCoins = +(splitTotalRevenue * 1000).toFixed(2);
      const splitTotalActiveRate = splitTotalRegistered > 0
        ? +((splitTotalActive / splitTotalRegistered * 100).toFixed(1))
        : 0;
      
      resultData.revenue = splitTotalRevenue;
      resultData.totalPerformance = splitTotalRevenue;
      resultData.coins = splitTotalCoins;
      resultData.impressions = splitTotalImpressions;
      resultData.totalCommission = splitTotalCommission;
      resultData.registeredUsers = splitTotalRegistered;
      resultData.activeUsers = splitTotalActive;
      resultData.activeUserCount = splitTotalActive;
      resultData.activeRate = splitTotalActiveRate;
    }
    
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
    
    // 检查缓存
    const cacheKey = `dashboard_users_${range}_${sortBy}_${limit || 'all'}_${team || 'all'}_${group || 'all'}_${req.user.id}`;
    const cachedData = get(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }
    
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
    
    // 使用聚合管道优化查询，避免加载所有记录到内存
    const MAX_RECORDS = 5000; // 限制最多处理5000条记录
    const goldLogsAggregation = await GoldLog.aggregate([
      { $match: { createTime: { $gte: startDate, $lt: endDate } } },
      { $group: {
        _id: { employeeId: '$employeeId', userId: '$userId' },
        watched: { $sum: 1 },
        earnings: { $sum: '$gold' },
        totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } }
      }},
      { $limit: MAX_RECORDS }
    ]);

    // 提取有金币记录的员工ID
    const employeeIdsWithGold = [...new Set(goldLogsAggregation.map(log => log._id.employeeId))];

    // 只查询有金币记录的员工
    const relevantEmployees = employeeIdsWithGold.length > 0
      ? await Employee.find({ employeeId: { $in: employeeIdsWithGold } })
      : [];
    const employeeMap = {};
    relevantEmployees.forEach(emp => {
      employeeMap[emp.employeeId] = emp;
    });

    // 获取所有UserGold记录
    const userGolds = await UserGold.find({
      employeeId: { $in: Object.keys(employeeMap) }
    });
    const userGoldMap = {};
    userGolds.forEach(ug => {
      userGoldMap[ug.employeeId] = ug;
    });

    // 构建用户统计数据
    const userStats = {};
    goldLogsAggregation.forEach(log => {
      const empId = log._id.employeeId;
      const userId = log._id.userId;
      userStats[userId] = {
        userId: userId,
        employeeId: empId,
        watched: log.watched,
        earnings: log.earnings,
        totalEcpm: log.totalEcpm
      };
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
        // 修复：优先显示真实姓名，其次显示战队名称
        const parentAdmin = adminMap[employee.parentId.toString()];
        if (parentAdmin) {
          superior = parentAdmin.realName || parentAdmin.teamName || parentAdmin.username;
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
    
    // 设置缓存，根据时间范围设置不同的TTL
    let cacheTTL;
    if (range === 'today') {
      cacheTTL = CACHE_TTL.today || 60 * 1000; // 1分钟
    } else if (range === 'yesterday') {
      cacheTTL = CACHE_TTL.yesterday || 60 * 60 * 1000; // 1小时
    } else if (range === 'week') {
      cacheTTL = CACHE_TTL.week || 60 * 60 * 1000; // 1小时
    } else if (range === 'month') {
      cacheTTL = CACHE_TTL.month || 60 * 60 * 1000; // 1小时
    } else {
      cacheTTL = CACHE_TTL.today || 60 * 1000; // 1分钟
    }
    console.log(`准备设置缓存: ${cacheKey}, 数据长度: ${limitedStats.length}, TTL: ${cacheTTL}`);
    set(cacheKey, limitedStats, cacheTTL);
    console.log(`缓存设置完成`);
    
    res.json({
      success: true,
      data: limitedStats
    });
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
        endDate = new Date(beijingDate.getTime() + 8 * 60 * 60 * 1000);
        
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
        rangeEndUTC = new Date(beijingDate.getTime() + 8 * 60 * 60 * 1000);
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
    const teamLeadCommission = Math.max(0, kpiData.revenue * 0.2 - totalGroupCommission);

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

// 团队长团队提成收益接口
router.get('/team-leader/commission', authMiddleware, async (req, res) => {
  try {
    const currentAdmin = await Admin.findById(req.user.id);
    if (!currentAdmin || !currentAdmin.teamName) {
      return res.status(403).json({ success: false, message: '无权限访问' });
    }

    // 检查缓存
    const cacheKey = `team_leader_commission_${currentAdmin._id.toString()}`;
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }

    // 使用 computeNewKpi 计算各时间范围的提成
    const scope = { kind: 'TL', adminId: String(currentAdmin._id) };
    const WithdrawRecord = mongoose.model('WithdrawRecord');
    const n2 = (v) => +(+v || 0).toFixed(2);
    
    // 并行计算所有时间范围
    const rangeKeys = ['today', 'yesterday', 'week', 'month', 'lastMonth', 'all'];
    const kpis = await Promise.all(rangeKeys.map(r => computeNewKpi(scope, r)));
    
    // 计算可用余额：上月收益 - 本月已提现
    const beijingNow = getBeijingDate();
    const monthStartBeijing = new Date(beijingNow);
    monthStartBeijing.setUTCDate(1);
    monthStartBeijing.setUTCHours(0, 0, 0, 0);
    const monthStart = new Date(monthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    const monthEnd = new Date();
    
    let currentMonthWithdrawn = 0;
    try {
      const wdAgg = await WithdrawRecord.aggregate([
        { $match: { 
          userId: currentAdmin.username, 
          type: 'admin', 
          status: { $in: [0, 1] },
          createTime: { $gte: monthStart, $lt: monthEnd }
        } },
        { $group: { _id: null, sumAmount: { $sum: '$amount' } } }
      ]).exec();
      currentMonthWithdrawn = +(wdAgg?.[0]?.sumAmount || 0);
    } catch (e) {
      console.warn('[team-leader/commission] 算本月已提现金额时警告:', e.message);
      currentMonthWithdrawn = 0;
    }
    
    const lastMonthCommission = n2(kpis[4]?.teamCommission); // lastMonth
    const availableBalance = n2(Math.max(0, lastMonthCommission - currentMonthWithdrawn));

    const resultData = {
      today: n2(kpis[0]?.teamCommission),
      yesterday: n2(kpis[1]?.teamCommission),
      week: n2(kpis[2]?.teamCommission),
      month: n2(kpis[3]?.teamCommission),
      lastMonth: lastMonthCommission,
      total: n2(kpis[5]?.teamCommission), // all = total
      availableBalance
    };

    // 设置缓存（15分钟）
    setCache(cacheKey, resultData, 15 * 60 * 1000);

    res.json({
      success: true,
      data: resultData
    });
  } catch (error) {
    console.error('获取团队长团队提成收益数据错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 辅助函数：时间范围 ====================
function _getKpiTimeRange(range) {
  const now = getUTCDate();
  let start, end, prevStart, prevEnd;
  
  // 注意：数据直接用UTC时间存储，所以直接用UTC时间范围查询
  // 但因为业务逻辑按"北京时间日"计算，所以需要转换北京时间的概念到UTC
  
  // 获取北京时间的当前日期
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  if (range === 'yesterday') {
    // 昨日：北京时间昨天00:00:00 ~ 北京时间今天00:00:00
    const yesterdayBeijing = new Date(beijingNow);
    yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
    yesterdayBeijing.setUTCHours(0, 0, 0, 0);
    // 转换回UTC存储时间
    start = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    const todayBeijing = new Date(beijingNow);
    todayBeijing.setUTCHours(0, 0, 0, 0);
    end = new Date(todayBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 前日：北京时间前天00:00:00 ~ 北京时间昨天00:00:00
    const dayBeforeBeijing = new Date(yesterdayBeijing);
    dayBeforeBeijing.setUTCDate(dayBeforeBeijing.getUTCDate() - 1);
    dayBeforeBeijing.setUTCHours(0, 0, 0, 0);
    prevStart = new Date(dayBeforeBeijing.getTime() - 8 * 60 * 60 * 1000);
    prevEnd = start;
  } else if (range === 'week') {
    // 本周：北京时间周一00:00:00 ~ 现在
    const dayOfWeek = beijingNow.getUTCDay() || 7;
    const mondayOffset = dayOfWeek === 7 ? -6 : 1 - dayOfWeek;
    const mondayBeijing = new Date(beijingNow);
    mondayBeijing.setUTCDate(mondayBeijing.getUTCDate() + mondayOffset);
    mondayBeijing.setUTCHours(0, 0, 0, 0);
    start = new Date(mondayBeijing.getTime() - 8 * 60 * 60 * 1000);
    end = now;
    
    // 上周
    const lastMondayBeijing = new Date(mondayBeijing);
    lastMondayBeijing.setUTCDate(lastMondayBeijing.getUTCDate() - 7);
    prevStart = new Date(lastMondayBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    const lastSundayBeijing = new Date(mondayBeijing);
    lastSundayBeijing.setUTCDate(lastSundayBeijing.getUTCDate() - 1);
    lastSundayBeijing.setUTCHours(23, 59, 59, 999);
    prevEnd = new Date(lastSundayBeijing.getTime() - 8 * 60 * 60 * 1000);
  } else if (range === 'month') {
    // 本月：北京时间1日00:00:00 ~ 现在
    const firstDayBeijing = new Date(beijingNow);
    firstDayBeijing.setUTCDate(1);
    firstDayBeijing.setUTCHours(0, 0, 0, 0);
    start = new Date(firstDayBeijing.getTime() - 8 * 60 * 60 * 1000);
    end = now;
    
    // 上月同期
    const firstDayLastMonthBeijing = new Date(beijingNow);
    firstDayLastMonthBeijing.setUTCMonth(firstDayLastMonthBeijing.getUTCMonth() - 1);
    firstDayLastMonthBeijing.setUTCDate(1);
    firstDayLastMonthBeijing.setUTCHours(0, 0, 0, 0);
    prevStart = new Date(firstDayLastMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    const lastDayLastMonthBeijing = new Date(firstDayBeijing);
    lastDayLastMonthBeijing.setUTCDate(0);
    lastDayLastMonthBeijing.setUTCHours(23, 59, 59, 999);
    prevEnd = new Date(lastDayLastMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
  } else if (range === 'lastMonth') {
    // 上月：北京时间上月1日00:00:00 ~ 本月1日00:00:00
    const currentMonth = beijingNow.getUTCMonth();
    const currentYear = beijingNow.getUTCFullYear();
    
    // 上月第一天（北京时间）
    const lastMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0));
    start = new Date(lastMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 本月第一天（北京时间）
    const thisMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0));
    end = new Date(thisMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 上上月同期
    const prevMonthStartBeijing = new Date(Date.UTC(currentYear, currentMonth - 2, 1, 0, 0, 0));
    prevStart = new Date(prevMonthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
    prevEnd = start;
  } else if (range === 'all') {
    start = new Date(0);
    end = now;
    prevStart = new Date(0);
    prevEnd = new Date(0);
  } else {
    // today：北京时间今天00:00:00 ~ 现在
    const todayBeijing = new Date(beijingNow);
    todayBeijing.setUTCHours(0, 0, 0, 0);
    start = new Date(todayBeijing.getTime() - 8 * 60 * 60 * 1000);
    end = now;
    
    // 昨日同期
    const yesterdayBeijing = new Date(beijingNow);
    yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
    yesterdayBeijing.setUTCHours(0, 0, 0, 0);
    prevStart = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    const yesterdayEndBeijing = new Date(beijingNow);
    yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
    prevEnd = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
  }
  
  return { start, end, prevStart, prevEnd };
}

// ==================== 辅助函数：提成率计算 ====================
// 直推提成率：优先使用 tlCommissionRate > commissionRate > fallback
function dRateExprRate(gl, fallback) {
  const hasTl = typeof gl.tlCommissionRate === 'number' && gl.tlCommissionRate > 0 && gl.tlCommissionRate <= 1;
  const hasGl = typeof gl.commissionRate === 'number' && gl.commissionRate > 0 && gl.commissionRate <= 1;
  return hasTl ? gl.tlCommissionRate : (hasGl ? gl.commissionRate : fallback);
}

// 组长视角专用：始终使用 TeamGroup/Admin 的当前提成率
// 不使用 GoldLog 中存储的 commissionRate（因为可能是历史错误数据）
function glRateExprRate(gl, fallback) {
  return fallback;
}

// 间推（级差）提成率：优先 parentTlCommissionRate > tlCommissionRate - subOwnRate > commissionRate - subOwnRate > fallback
function ptlRateExprForSub(gl, subOwnRate, fallback) {
  const hasPtl = typeof gl.parentTlCommissionRate === 'number' && gl.parentTlCommissionRate > 0 && gl.parentTlCommissionRate <= 1;
  const hasTl = typeof gl.tlCommissionRate === 'number' && gl.tlCommissionRate > 0 && gl.tlCommissionRate <= 1;
  const hasGl = typeof gl.commissionRate === 'number' && gl.commissionRate > 0 && gl.commissionRate <= 1;
  if (hasPtl) return gl.parentTlCommissionRate;
  let inferred = 0;
  if (hasTl) inferred = Math.max(0, gl.tlCommissionRate - subOwnRate);
  else if (hasGl) inferred = Math.max(0, gl.commissionRate - subOwnRate);
  if (inferred === 0) inferred = Math.max(0, fallback);
  return inferred;
}

// 聚合 GoldLog 数据并计算提成
async function aggWithRate(ids, s, e, rateFn) {
  const GoldLog = mongoose.model('GoldLog');
  const logs = await GoldLog.find({ employeeId: { $in: ids }, createTime: { $gte: s, $lt: e } })
    .select('employeeId gold commissionRate tlCommissionRate parentTlCommissionRate').lean();
  let count = 0, totalGold = 0, commGold = 0;
  for (const l of logs) {
    count++;
    const g = +l.gold || 0;
    totalGold += g;
    commGold += g * rateFn(l);
  }
  return { count, totalGold, commGold };
}

// ==================== 辅助函数：团队长/组长KPI计算 ====================
async function computeNewKpi(scope, range) {
  const { start, end, prevStart, prevEnd } = _getKpiTimeRange(range);
  const Admin = mongoose.model('Admin');
  const Employee = mongoose.model('Employee');
  const TeamGroup = mongoose.model('TeamGroup');
  const LoginRecord = mongoose.model('LoginRecord');
  const safeToFixed2 = (v) => +(+v || 0).toFixed(2);
  const round1 = (v) => +(+v || 0).toFixed(1);
  const revToYuan = (gold) => (+gold || 0) / 1000;
  
  // 获取 TL 的 fallback 提成率
  let tlFallbackRate = 0;
  if (scope.kind === 'TL') {
    const tlAdmin = await Admin.findById(scope.adminId).lean();
    if (!tlAdmin) return getEmptyKpi();
    tlFallbackRate = +(tlAdmin.commission || 0);
  } else if (scope.kind === 'GL') {
    // 组长视角：统一使用 5% 提成率
    tlFallbackRate = 0.05;
    scope._glCommissionRate = 0.05;
  }
  
  // 根据 scope 确定员工范围
  let directEmpIds = [];
  let groupEmpIds = [];
  let subTlInfo = []; // [{adminId, ids, rate}]
  
  if (scope.kind === 'TL') {
    // 直推员工（D员工）- 排除下属组成员
    const directEmps = await Employee.find({ parentId: scope.adminId }).select('employeeId groupName teamGroupId').lean();
    const adminGroups = await TeamGroup.find({ teamLeaderId: scope.adminId }).lean();
    const groupIds = adminGroups.map(g => String(g._id));
    const groupNames = adminGroups.map(g => g.groupName).filter(Boolean);
    
    directEmpIds = directEmps.filter(e => {
      const gid = e.teamGroupId ? String(e.teamGroupId) : '';
      const gn = e.groupName || '';
      return !groupIds.includes(gid) && !groupNames.includes(gn);
    }).map(e => e.employeeId);
    
    // 下属组长的G员工
    if (groupIds.length > 0 || groupNames.length > 0) {
      const groupEmps = await Employee.find({
        $or: [
          { teamGroupId: { $in: groupIds } },
          { groupName: { $in: groupNames } }
        ]
      }).select('employeeId').lean();
      groupEmpIds = groupEmps.map(e => e.employeeId);
    }
    
    // 下属TL及其D员工
    const subTls = await Admin.find({
      parentTlId: scope.adminId,
      role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
    }).select('_id commission').lean();
    
    for (const subTl of subTls) {
      const subTlId = String(subTl._id);
      const subTlRate = +(subTl.commission || 0);
      const subTlDirectEmps = await Employee.find({ parentId: subTlId }).select('employeeId').lean();
      const subTlDirectIds = subTlDirectEmps.map(e => e.employeeId);
      if (subTlDirectIds.length > 0) {
        subTlInfo.push({ adminId: subTlId, ids: subTlDirectIds, rate: subTlRate });
      }
    }
  } else if (scope.kind === 'GL') {
    // 组长视角
    const glEmps = await Employee.find({
      $or: [
        { teamGroupId: scope.teamGroupId },
        { parentId: scope.adminId }
      ]
    }).select('employeeId').lean();
    directEmpIds = glEmps.map(e => e.employeeId);
  }
  
  // 合并所有员工ID
  const allEmpIds = [...new Set([...directEmpIds, ...groupEmpIds, ...subTlInfo.flatMap(s => s.ids)])];
  
  if (allEmpIds.length === 0) return getEmptyKpi();
  
  // 计算直推提成
  let dCurCount = 0, dCurGold = 0, dCurComm = 0;
  let dPrevCount = 0, dPrevGold = 0, dPrevComm = 0;
  
  if (directEmpIds.length > 0) {
    // 组长视角使用 glRateExprRate，团队长视角使用 dRateExprRate
    const rateFn = scope.kind === 'GL' 
      ? (l) => glRateExprRate(l, tlFallbackRate) 
      : (l) => dRateExprRate(l, tlFallbackRate);
      
    const dCur = await aggWithRate(directEmpIds, start, end, rateFn);
    dCurCount = dCur.count;
    dCurGold = dCur.totalGold;
    dCurComm = dCur.commGold;
    
    const dPrev = await aggWithRate(directEmpIds, prevStart, prevEnd, rateFn);
    dPrevCount = dPrev.count;
    dPrevGold = dPrev.totalGold;
    dPrevComm = dPrev.commGold;
  }
  
  // 计算间推提成（组长员工 + 下属TL员工）
  let iCurCount = 0, iCurGold = 0, iCurComm = 0;
  
  // 组长员工：级差 = 上级率(tlFallbackRate) - 组长率(0.05)
  const glOwnRate = 0.05;
  if (groupEmpIds.length > 0) {
    const gCur = await aggWithRate(groupEmpIds, start, end, l => ptlRateExprForSub(l, glOwnRate, Math.max(0, tlFallbackRate - glOwnRate)));
    iCurCount += gCur.count;
    iCurGold += gCur.totalGold;
    iCurComm += gCur.commGold;
  }
  
  // 下属TL员工：级差 = 上级率(tlFallbackRate) - 下属TL率
  for (const sub of subTlInfo) {
    const subOwnRate = sub.rate || 0;
    const subCur = await aggWithRate(sub.ids, start, end, l => ptlRateExprForSub(l, subOwnRate, Math.max(0, tlFallbackRate - subOwnRate)));
    iCurCount += subCur.count;
    iCurGold += subCur.totalGold;
    iCurComm += subCur.commGold;
  }
  
  // 业绩和提成转换为元
  const dRevenue = safeToFixed2(revToYuan(dCurGold));
  const dCommission = safeToFixed2(revToYuan(dCurComm));
  const iRevenue = safeToFixed2(revToYuan(iCurGold));
  const iCommission = safeToFixed2(revToYuan(iCurComm));
  const teamRevenue = safeToFixed2(dRevenue + iRevenue);
  const teamCommission = safeToFixed2(dCommission + iCommission);
  
  // 上期数据（简化计算）
  const dPrevRevenue = safeToFixed2(revToYuan(dPrevGold));
  const dPrevCommission = safeToFixed2(revToYuan(dPrevComm));
  const iPrevRevenue = safeToFixed2(revToYuan(0)); // 简化：间推上期不计算
  const teamRevenuePrev = safeToFixed2(dPrevRevenue + iPrevRevenue);
  
  // 活跃用户数 - 使用金币记录（有金币记录才算活跃）
  const GoldLog = mongoose.model('GoldLog');
  const activeUsers = await GoldLog.distinct('userId', {
    createTime: { $gte: start, $lt: end },
    employeeId: { $in: allEmpIds }
  });
  
  const prevActiveUsers = await GoldLog.distinct('userId', {
    createTime: { $gte: prevStart, $lt: prevEnd },
    employeeId: { $in: allEmpIds }
  });
  
  const activeUserCount = activeUsers.length;
  const prevActiveUserCount = prevActiveUsers.length;
  
  // 在册人数
  const dirTotalN = directEmpIds.length;
  const indirTotalN = groupEmpIds.length + subTlInfo.reduce((sum, s) => sum + s.ids.length, 0);
  
  // 环比
  const teamRevenueGrowth = teamRevenuePrev > 0 
    ? round1((teamRevenue - teamRevenuePrev) / teamRevenuePrev * 100) 
    : 0;
  const teamCommissionGrowth = teamCommission > 0 
    ? round1((teamCommission - dPrevCommission) / Math.max(0.01, dPrevCommission) * 100) 
    : 0;
  
  return {
    directRevenue: dRevenue,
    indirectRevenue: iRevenue,
    teamRevenue,
    directCommission: dCommission,
    indirectCommission: iCommission,
    teamCommission,
    directImpressions: dCurCount,
    indirectImpressions: iCurCount,
    directUserCount: dirTotalN,
    indirectUserCount: indirTotalN,
    directActiveUsers: activeUserCount,
    indirectActiveUsers: 0,
    directActiveRate: dirTotalN > 0 ? round1(activeUserCount / dirTotalN * 100) : 0,
    indirectActiveRate: 0,
    teamRevenueGrowth,
    teamCommissionGrowth,
    directRevenueGrowth: 0,
    _scope: scope.kind === 'TL' ? 'TL' : 'GL',
    _range: range,
    _window: { startISO: start.toISOString(), endISO: end.toISOString() },
    _debug: { dCount: dirTotalN, iCount: indirTotalN }
  };
}

function getEmptyKpi() {
  return {
    directRevenue: 0, indirectRevenue: 0, teamRevenue: 0,
    directCommission: 0, indirectCommission: 0, teamCommission: 0,
    directImpressions: 0, indirectImpressions: 0,
    directUserCount: 0, indirectUserCount: 0,
    directActiveUsers: 0, indirectActiveUsers: 0,
    directActiveRate: 0, indirectActiveRate: 0,
    teamRevenueGrowth: 0, teamCommissionGrowth: 0, directRevenueGrowth: 0,
    _scope: 'TL', _range: '', _window: { startISO: '', endISO: '' },
    _debug: { dCount: 0, iCount: 0 }
  };
}

// ==================== 辅助函数：超管/高管KPI计算 ====================
async function computeSuperKpi(range, teamIds) {
  const { start, end, prevStart, prevEnd } = _getKpiTimeRange(range);
  const Admin = mongoose.model('Admin');
  const Employee = mongoose.model('Employee');
  const TeamGroup = mongoose.model('TeamGroup');
  const GoldLog = mongoose.model('GoldLog');
  const LoginRecord = mongoose.model('LoginRecord');
  const safeToFixed2 = (v) => +(+v || 0).toFixed(2);
  const round1 = (v) => +(+v || 0).toFixed(1);
  
  // 确定员工范围
  let scopeEmpIds = null;
  if (teamIds && teamIds.length > 0) {
    const managedIdStrings = teamIds.map(id => String(id));
    
    // 找下属TL
    const subTls = await Admin.find({
      parentTlId: { $in: managedIdStrings },
      role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
    }).select('_id').lean();
    const subTlIds = subTls.map(t => String(t._id));
    
    // 找下属组
    const allGroups = await TeamGroup.find({ teamLeaderId: { $in: [...managedIdStrings, ...subTlIds] } }).select('_id').lean();
    const groupIds = allGroups.map(g => String(g._id));
    
    // 收集员工
    const allEmps = await Employee.find({
      $or: [
        { parentId: { $in: managedIdStrings } },
        { parentId: { $in: subTlIds } },
        { teamGroupId: { $in: groupIds } }
      ]
    }).select('employeeId').lean();
    
    scopeEmpIds = [...new Set(allEmps.map(e => e.employeeId))];
  }
  
  // 聚合数据
  const pipe = [];
  const matchStage = { createTime: { $gte: start, $lt: end } };
  if (scopeEmpIds && scopeEmpIds.length > 0) {
    matchStage.employeeId = { $in: scopeEmpIds };
  }
  pipe.push({ $match: matchStage });
  pipe.push({
    $group: {
      _id: null,
      count: { $sum: 1 },
      totalGold: { $sum: { $ifNull: ['$gold', 0] } },
      totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } },
      filteredGold: { $sum: { $cond: [{ $lte: ['$gold', 10000] }, { $ifNull: ['$gold', 0] }, 0] } }
    }
  });
  
  const rows = await GoldLog.aggregate(pipe).allowDiskUse(true).exec();
  const r = rows[0] || { count: 0, totalGold: 0, totalEcpm: 0, filteredGold: 0 };
  
  const businessRevenue = safeToFixed2((+r.totalEcpm || 0) / 1000);
  const userShareCommission = safeToFixed2((+r.totalGold || 0) / 1000);
  const impressions = r.count || 0;
  const ecpmAvg = impressions > 0 ? safeToFixed2((+r.totalEcpm || 0) / impressions) : 0;
  
  // 环比数据
  const prevPipe = [];
  const prevMatchStage = { createTime: { $gte: prevStart, $lt: prevEnd } };
  if (scopeEmpIds && scopeEmpIds.length > 0) {
    prevMatchStage.employeeId = { $in: scopeEmpIds };
  }
  prevPipe.push({ $match: prevMatchStage });
  prevPipe.push({
    $group: {
      _id: null,
      totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } },
      totalGold: { $sum: { $ifNull: ['$gold', 0] } },
      count: { $sum: 1 }
    }
  });
  
  const prevRows = await GoldLog.aggregate(prevPipe).allowDiskUse(true).exec();
  const pr = prevRows[0] || { totalEcpm: 0, totalGold: 0, count: 0 };
  
  const prevBusinessRevenue = safeToFixed2((+pr.totalEcpm || 0) / 1000);
  const prevUserShareCommission = safeToFixed2((+pr.totalGold || 0) / 1000);
  
  // 活跃用户数
  const loginMatch = { loginDate: { $gte: start, $lt: end } };
  if (scopeEmpIds && scopeEmpIds.length > 0) {
    loginMatch.employeeId = { $in: scopeEmpIds };
  }
  const activeUsers = await LoginRecord.find(loginMatch).distinct('userId');
  const activeUserCount = activeUsers.length;
  
  const prevLoginMatch = { loginDate: { $gte: prevStart, $lt: prevEnd } };
  if (scopeEmpIds && scopeEmpIds.length > 0) {
    prevLoginMatch.employeeId = { $in: scopeEmpIds };
  }
  const prevActiveUsers = await LoginRecord.find(prevLoginMatch).distinct('userId');
  const prevActiveUserCount = prevActiveUsers.length;
  
  // 增长率
  const businessRevenueGrowth = prevBusinessRevenue > 0 
    ? round1((businessRevenue - prevBusinessRevenue) / prevBusinessRevenue * 100) 
    : 0;
  const userShareGrowth = prevUserShareCommission > 0 
    ? round1((userShareCommission - prevUserShareCommission) / prevUserShareCommission * 100) 
    : 0;
  const impressionsGrowth = pr.count > 0 
    ? round1((impressions - pr.count) / pr.count * 100) 
    : 0;
  const ecpmAvgGrowth = pr.count > 0 
    ? round1((ecpmAvg - ((+pr.totalEcpm || 0) / pr.count)) / ((+pr.totalEcpm || 0) / pr.count) * 100) 
    : 0;
  
  // 简化计算管理分成
  const managementCommission = safeToFixed2(businessRevenue * 0.3);
  const managementCommissionGrowth = prevBusinessRevenue > 0 
    ? round1((managementCommission - safeToFixed2(prevBusinessRevenue * 0.3)) / safeToFixed2(prevBusinessRevenue * 0.3) * 100) 
    : 0;
  
  // 简化计算分红
  const filteredUserShare = safeToFixed2((+r.filteredGold || 0) / 1000);
  const dividendTotalRaw = filteredUserShare * 0.25 - managementCommission;
  const dividendTotal = safeToFixed2(Math.max(0, dividendTotalRaw));
  const dividendTotalGrowth = prevBusinessRevenue > 0 
    ? round1((dividendTotal - safeToFixed2(Math.max(0, safeToFixed2(prevUserShareCommission * 0.25) - safeToFixed2(prevBusinessRevenue * 0.3)))) / Math.max(0, safeToFixed2(prevUserShareCommission * 0.25) - safeToFixed2(prevBusinessRevenue * 0.3)) * 100) 
    : 0;
  
  // 平台毛利
  const platformProfit = safeToFixed2(businessRevenue - userShareCommission - managementCommission);
  const platformProfitRate = businessRevenue > 0 ? round1(platformProfit / businessRevenue * 100) : 0;
  
  return {
    businessRevenue,
    userShareCommission,
    managementCommission,
    dividendTotal,
    newUserCount: 0,
    platformProfit,
    platformProfitRate,
    impressions,
    ecpmAvg,
    registeredUserCount: scopeEmpIds ? scopeEmpIds.length : 0,
    activeUserCount,
    activeUserRate: scopeEmpIds && scopeEmpIds.length > 0 ? round1(activeUserCount / scopeEmpIds.length * 100) : 0,
    businessRevenueGrowth,
    userShareGrowth,
    managementCommissionGrowth,
    dividendTotalGrowth,
    platformProfitGrowth: businessRevenueGrowth,
    platformProfitRateGrowth: round1(platformProfitRate * 0.1),
    impressionsGrowth,
    ecpmAvgGrowth
  };
}

// ==================== 超管数据看板接口 ====================
router.get('/super/kpi', authMiddleware, async (req, res) => {
  try {
    const range = req.query.range || 'today';
    
    // 检查缓存
    const adminId = req.user.id;
    const cacheKey = `super_kpi_${range}_${adminId}`;
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }
    
    const currentAdmin = await Admin.findById(adminId).lean();
    if (!currentAdmin) {
      return res.status(403).json({ success: false, message: '管理员信息不存在' });
    }
    
    // 判断角色
    const isSuperAdmin = currentAdmin.role === 'superadmin' || currentAdmin.role === 'SUPER_ADMIN';
    const isAdminManager = currentAdmin.role === 'ADMIN_MANAGER' || currentAdmin.role === 'admin_manager';
    
    if (!isSuperAdmin && !isAdminManager) {
      return res.status(403).json({ success: false, message: '无权限访问' });
    }
    
    // 获取管理的团队ID
    let teamIds = null;
    if (isAdminManager && currentAdmin.managedTeamIds) {
      teamIds = currentAdmin.managedTeamIds.map(id => String(id));
    }
    
    // 计算KPI
    const kpi = await computeSuperKpi(range, teamIds);
    
    // 设置缓存
    setCache(cacheKey, kpi, range === 'today' ? 60 * 1000 : 60 * 60 * 1000);
    
    res.json({ success: true, data: kpi });
  } catch (error) {
    console.error('超管数据看板错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 高管分红汇总接口 ====================
router.get('/super/dividend-summary', authMiddleware, async (req, res) => {
  try {
    const adminId = req.user.id;
    const cacheKey = `dividend_summary_${adminId}`;
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      return res.json({ success: true, data: cachedData, cached: true });
    }
    
    const Admin = mongoose.model('Admin');
    const WithdrawRecord = mongoose.model('WithdrawRecord');
    
    const currentAdmin = await Admin.findById(adminId).lean();
    if (!currentAdmin) {
      return res.status(403).json({ success: false, message: '管理员信息不存在' });
    }
    
    const isSuperAdmin = currentAdmin.role === 'superadmin' || currentAdmin.role === 'SUPER_ADMIN';
    const isAdminManager = currentAdmin.role === 'ADMIN_MANAGER' || currentAdmin.role === 'admin_manager';
    
    if (!isSuperAdmin && !isAdminManager) {
      return res.status(403).json({ success: false, message: '无权限访问' });
    }
    
    const safeToFixed2 = (v) => +(+v || 0).toFixed(2);
    const teamIds = currentAdmin.managedTeamIds ? currentAdmin.managedTeamIds.map(id => String(id)) : null;
    
    // 计算三个时间范围
    const [today, month, lastMonth] = await Promise.all([
      computeSuperKpi('today', teamIds),
      computeSuperKpi('month', teamIds),
      computeSuperKpi('lastMonth', teamIds)
    ]);
    
    // 计算可提现余额
    let availableBalance = 0;
    try {
      const adminUsername = currentAdmin.username;
      if (adminUsername) {
        const now = new Date();
        const beijingNow = getBeijingDate();
        const monthStartBeijing = new Date(beijingNow);
        monthStartBeijing.setUTCDate(1);
        monthStartBeijing.setUTCHours(0, 0, 0, 0);
        const monthStart = new Date(monthStartBeijing.getTime() - 8 * 60 * 60 * 1000);
        const monthEnd = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        
        const wdAgg = await WithdrawRecord.aggregate([
          { $match: { userId: adminUsername, type: 'admin', status: { $in: [0, 1] }, createTime: { $gte: monthStart, $lt: monthEnd } } },
          { $group: { _id: null, sumAmount: { $sum: '$amount' } } }
        ]).exec();
        const pendingAmount = +(wdAgg?.[0]?.sumAmount || 0);
        availableBalance = Math.max(0, lastMonth.dividendTotal - pendingAmount);
      }
    } catch (e) {
      availableBalance = lastMonth.dividendTotal;
    }
    
    const result = {
      today: { dividendTotal: today.dividendTotal, businessRevenue: today.businessRevenue, userShareCommission: today.userShareCommission, managementCommission: today.managementCommission },
      month: { dividendTotal: month.dividendTotal, businessRevenue: month.businessRevenue, userShareCommission: month.userShareCommission, managementCommission: month.managementCommission },
      lastMonth: { dividendTotal: lastMonth.dividendTotal, businessRevenue: lastMonth.businessRevenue, userShareCommission: lastMonth.userShareCommission, managementCommission: lastMonth.managementCommission },
      availableBalance: safeToFixed2(availableBalance)
    };
    
    setCache(cacheKey, result, 60 * 60 * 1000);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('高管分红汇总错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 导出辅助函数 ====================
router.computeSuperKpi = computeSuperKpi;
router.computeNewKpi = computeNewKpi;
router._getKpiTimeRange = _getKpiTimeRange;
router._TEST_getTlCommissionStats = async function(adminId) {
  const Admin = mongoose.model('Admin');
  const adminDoc = await Admin.findById(adminId).select('_id username realName role teamName commission teamGroupId parentTlId').lean();
  if (!adminDoc) throw new Error('用户不存在');
  adminDoc.constructor = Admin;
  
  const scope = { kind: 'TL', adminId: String(adminId) };
  const kpi = await computeNewKpi(scope, 'lastMonth');
  return {
    today: kpi.teamCommission,
    month: kpi.teamCommission,
    lastMonth: kpi.teamCommission,
    total: kpi.teamCommission,
    availableBalance: 0
  };
};

module.exports = router;
