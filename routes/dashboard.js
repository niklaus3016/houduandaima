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

function getCacheKey(range, team, userId) {
  return `kpi_${userId || 'all'}_${range}_${team || 'all'}`;
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
    const cacheKey = getCacheKey(range, team || group, req.user?.id);
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
          // 团队长：≤2级规则
          // 1. 直推员工（parentId 匹配）
          const directEmployees = await Employee.find({ parentId: currentAdmin._id.toString() });
          
          // 2. 下属组的员工（通过 teamLeaderId 找到所有 active 组，再找组内员工。G1：status='disbanded' 解散组不再计入，避免晋升时老组残留 groupName 把员工串回老 TL）
          const adminGroups = await TeamGroup.find({ teamLeaderId: currentAdmin._id, status: { $ne: 'disbanded' } }).lean();
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
          
          // 3. 下属TL直属员工（≤2级：排除下属TL自己的组长组员工！）
          let subTlDirectEmployees = [];
          const subTls = await Admin.find({
            parentTlId: currentAdmin._id,
            role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
          }).select('_id').lean();
          for (const stl of subTls) {
            const stlId = String(stl._id);
            const stlAll = await Employee.find({ parentId: stlId }).select('employeeId groupName teamGroupId').lean();
            const stlGroups = await TeamGroup.find({ teamLeaderId: stl._id, status: { $ne: 'disbanded' } }).lean();
            const sgids = new Set(stlGroups.map(g => String(g._id)));
            const sgnms = new Set(stlGroups.map(g => g.groupName).filter(Boolean));
            stlAll.forEach(e => {
              const gid = e.teamGroupId ? String(e.teamGroupId) : '';
              const gn = e.groupName || '';
              if (!sgids.has(gid) && !sgnms.has(gn)) subTlDirectEmployees.push(e);
            });
          }
          
          // 合并去重（≤2级员工）
          const allEmployeesMap = new Map();
          directEmployees.forEach(e => allEmployeesMap.set(String(e.employeeId), e));
          groupEmployees.forEach(e => allEmployeesMap.set(String(e.employeeId), e));
          subTlDirectEmployees.forEach(e => allEmployeesMap.set(String(e.employeeId), e));
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
          req._teamLeaderSubTlDirectEmpIds = subTlDirectEmployees.map(e => e.employeeId);
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
            totalEcpm: { $sum: '$ecpm' },
            filteredGold: { $sum: { $cond: [{ $lte: ['$gold', 2000] }, '$gold', 0] } }
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
            totalEcpm: { $sum: '$ecpm' },
            filteredGold: { $sum: { $cond: [{ $lte: ['$gold', 2000] }, '$gold', 0] } }
          }
        }
      ])
    ]);
    
    const current = currentStats[0] || { count: 0, totalGold: 0, totalEcpm: 0, filteredGold: 0 };
    const prev = prevStats[0] || { count: 0, totalGold: 0, totalEcpm: 0, filteredGold: 0 };
    
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
    const totalPerformance = totalGold / 1000; // 用户收益（展示用，不过滤）
    const totalCommissionBase = (current.filteredGold || 0) / 1000; // 提成基数（过滤 gold>2000）
    const totalCommissionAmount = totalCommissionBase * commissionRate; // 组长提成
    const prevPerformance = prevTotalGold / 1000; // 展示用，不过滤
    const prevCommissionBase = (prev.filteredGold || 0) / 1000; // 提成基数（过滤）
    const prevCommissionAmount = prevCommissionBase * commissionRate;
    
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
    // 直接复用 computeNewKpi（与 /team-leader 同口径，含≤2级限制），避免两处逻辑不一致
    if (req._isTeamLeaderRole) {
      const tlScope = { kind: 'TL', adminId: String(req._teamLeaderAdminId) };
      const tlKpi = await computeNewKpi(tlScope, range);
      
      // 补充在册口径（TL自己的直推员工、组长组员工、子TL直属员工<=2级）
      const directEmpIds = req._teamLeaderDirectEmpIds || [];
      const groupEmpIds = req._teamLeaderGroupEmpIds || [];
      const mongoose = require('mongoose');
      const EmployeeModel = mongoose.model('Employee');
      const LoginRecord = mongoose.model('LoginRecord');
      const AdminModel = mongoose.model('Admin');
      const TeamGroup = mongoose.model('TeamGroup');
      
      const subTls = await AdminModel.find({
        parentTlId: req._teamLeaderAdminId,
        role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
      }).select('_id').lean();
      let subTlDirectEmpIds = [];
      for (const stl of subTls) {
        const stlId = String(stl._id);
        const stlAll = await EmployeeModel.find({ parentId: stlId }).select('employeeId groupName teamGroupId').lean();
        const stlGroups = await TeamGroup.find({ teamLeaderId: stl._id, status: { $ne: 'disbanded' } }).lean();
        const sgids = new Set(stlGroups.map(g => String(g._id)));
        const sgnms = new Set(stlGroups.map(g => g.groupName).filter(Boolean));
        stlAll.forEach(e => {
          const gid = e.teamGroupId ? String(e.teamGroupId) : '';
          const gn = e.groupName || '';
          if (!sgids.has(gid) && !sgnms.has(gn)) subTlDirectEmpIds.push(String(e.employeeId));
        });
      }
      const indirectEmpIds = [...new Set([...groupEmpIds, ...subTlDirectEmpIds])];
      
      // 活跃用户（按在册范围）
      const [dLRs, iLRs, dPLRs, iPLRs] = await Promise.all([
        LoginRecord.find({ loginDate: { $gte: startDate, $lt: endDate }, employeeId: { $in: directEmpIds } }).select('employeeId').lean(),
        LoginRecord.find({ loginDate: { $gte: startDate, $lt: endDate }, employeeId: { $in: indirectEmpIds } }).select('employeeId').lean(),
        LoginRecord.find({ loginDate: { $gte: prevStartDate, $lt: prevEndDate }, employeeId: { $in: directEmpIds } }).select('employeeId').lean(),
        LoginRecord.find({ loginDate: { $gte: prevStartDate, $lt: prevEndDate }, employeeId: { $in: indirectEmpIds } }).select('employeeId').lean()
      ]);
      const dActive = new Set(dLRs.map(r => r.employeeId)).size;
      const iActive = new Set(iLRs.map(r => r.employeeId)).size;
      const dPActive = new Set(dPLRs.map(r => r.employeeId)).size;
      const iPActive = new Set(iPLRs.map(r => r.employeeId)).size;
      
      const dRegistered = directEmpIds.length;
      const iRegistered = indirectEmpIds.length;
      
      function calcGrowth(cur, prev) { return prev > 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : 0; }
      
      const directSplit = {
        revenue: tlKpi.directRevenue,
        prevRevenue: tlKpi.directPrevRevenue,
        revenueGrowth: tlKpi.directRevenueGrowth,
        commission: tlKpi.directCommission,
        prevCommission: tlKpi.directPrevCommission,
        commissionGrowth: tlKpi.directCommissionGrowth,
        impressions: tlKpi.directImpressions,
        prevImpressions: tlKpi.directPrevImpressions,
        impressionsGrowth: calcGrowth(tlKpi.directImpressions, tlKpi.directPrevImpressions),
        registeredUsers: dRegistered,
        activeUserCount: dActive,
        prevActive: dPActive,
        activeRate: dRegistered > 0 ? +((dActive / dRegistered * 100).toFixed(1)) : 0,
        activeUsersGrowth: calcGrowth(dActive, dPActive),
      };
      
      const indirectSplit = {
        revenue: tlKpi.indirectRevenue,
        prevRevenue: tlKpi.indirectPrevRevenue,
        revenueGrowth: tlKpi.indirectRevenueGrowth,
        commission: tlKpi.indirectCommission,
        prevCommission: tlKpi.indirectPrevCommission,
        commissionGrowth: tlKpi.indirectCommissionGrowth,
        impressions: tlKpi.indirectImpressions,
        prevImpressions: tlKpi.indirectPrevImpressions,
        impressionsGrowth: calcGrowth(tlKpi.indirectImpressions, tlKpi.indirectPrevImpressions),
        registeredUsers: iRegistered,
        activeUserCount: iActive,
        prevActive: iPActive,
        activeRate: iRegistered > 0 ? +((iActive / iRegistered * 100).toFixed(1)) : 0,
        activeUsersGrowth: calcGrowth(iActive, iPActive),
      };
      
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
      
      // TL 角色：汇总环比用拆分后的 prev 数据重算
      const splitPrevRevenue = directSplit.prevRevenue + indirectSplit.prevRevenue;
      const splitPrevCommission = directSplit.prevCommission + indirectSplit.prevCommission;
      const splitPrevImpressions = directSplit.prevImpressions + indirectSplit.prevImpressions;
      const splitPrevActive = directSplit.prevActive + indirectSplit.prevActive;
      
      const splitTotalPerformanceGrowth = splitPrevRevenue > 0
        ? +(((splitTotalRevenue - splitPrevRevenue) / splitPrevRevenue) * 100).toFixed(1)
        : 0;
      const splitTotalCommissionGrowth = splitPrevCommission > 0
        ? +(((splitTotalCommission - splitPrevCommission) / splitPrevCommission) * 100).toFixed(1)
        : 0;
      const splitTotalImpressionsGrowth = splitPrevImpressions > 0
        ? +(((splitTotalImpressions - splitPrevImpressions) / splitPrevImpressions) * 100).toFixed(1)
        : 0;
      const splitTotalActiveUsersGrowth = splitPrevActive > 0
        ? +(((splitTotalActive - splitPrevActive) / splitPrevActive) * 100).toFixed(1)
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
      // 覆盖汇总结论的环比（对齐拆分口径）
      resultData.totalPerformanceGrowth = splitTotalPerformanceGrowth;
      resultData.totalCommissionGrowth = splitTotalCommissionGrowth;
      resultData.impressionsGrowth = splitTotalImpressionsGrowth;
      resultData.activeUsersGrowth = splitTotalActiveUsersGrowth;
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
      // 使用下月1号00:00作为结束时间，与KPI接口时间口径保持一致
      const firstDayNextMonthBeijing = new Date(beijingNow);
      firstDayNextMonthBeijing.setUTCDate(1);
      firstDayNextMonthBeijing.setUTCMonth(firstDayNextMonthBeijing.getUTCMonth() + 1);
      firstDayNextMonthBeijing.setUTCHours(0, 0, 0, 0);
      endDate = new Date(firstDayNextMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
    } else {
      const todayStartBeijing = new Date(beijingNow);
      todayStartBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
    }
    
    // ========== F2 优化：前置"在册员工范围"计算 ==========
    // 1. 先按 team/group/role 算 validEmployeeIds（与原 filteredUserStats 过滤规则完全一致，只是前移）
    // 2. 以此为基准生成 userStatsArray：保证"在册员工"全部显示（0 金币员工不再漏掉）
    // 3. GoldLog 聚合前置 employeeId:{$in:validEmployeeIds} + hint，杜绝全表拖日志
    let validEmployeeIds = [];
    let scopeAdminForFilter = null;
    const adminGroupCache = {};
    let currentAdmin = null;

    if (team) {
      if (req.user && req.user.id) {
        const me = await Admin.findById(req.user.id).lean();
        if (me && me.teamName === team) scopeAdminForFilter = me;
      }
      if (!scopeAdminForFilter) {
        scopeAdminForFilter = await Admin.findOne({ teamName: team, role: { $in: ['NORMAL_ADMIN', 'normal_admin'] } }).lean();
      }
      if (scopeAdminForFilter) {
        const empIdSet = new Set();
        const directEmps = await Employee.find({ parentId: scopeAdminForFilter._id.toString() }).lean();
        directEmps.forEach(e => empIdSet.add(String(e.employeeId)));
        if (scopeAdminForFilter.role && String(scopeAdminForFilter.role).toUpperCase() === 'NORMAL_ADMIN') {
          const tlGroups = await TeamGroup.find({ teamLeaderId: scopeAdminForFilter._id, status: { $ne: 'disbanded' } }).lean();
          const tlGroupNames = tlGroups.map(g => g.groupName).filter(Boolean);
          const tlGroupIds = tlGroups.map(g => g._id.toString());
          if (tlGroupNames.length || tlGroupIds.length) {
            const allowedGroupIds = new Set(tlGroupIds);
            const allowedGroupNames = new Set(tlGroupNames);
            const groupEmpsRaw = await Employee.find({
              $or: [
                { groupName: { $in: tlGroupNames } },
                { teamGroupId: { $in: tlGroupIds } }
              ]
            }).lean();
            const groupEmps = router._f1_validateGroupEmps(groupEmpsRaw, { allowedGroupIds, allowedGroupNames });
            groupEmps.forEach(e => empIdSet.add(String(e.employeeId)));
          }
        }
        validEmployeeIds = [...empIdSet];
      }
    } else if (group) {
      if (!adminGroupCache[group]) adminGroupCache[group] = await TeamGroup.findById(group);
      const targetGroup = adminGroupCache[group];
      if (targetGroup && targetGroup.groupName) {
        const allowedGroupIds = new Set([String(targetGroup._id), String(group)]);
        const allowedGroupNames = new Set([targetGroup.groupName]);
        const employeesRaw = await Employee.find({
          $or: [
            { groupName: targetGroup.groupName },
            { teamGroupId: group },
            { teamGroupId: targetGroup._id.toString() }
          ]
        }).lean();
        const employees = router._f1_validateGroupEmps(employeesRaw, { allowedGroupIds, allowedGroupNames });
        validEmployeeIds = employees.map(e => String(e.employeeId));
      }
    } else if (req.user && (req.user.role === 'superadmin' || req.user.role === 'ADMIN_MANAGER' || req.user.role === 'admin_manager')) {
      // 超管 / 高管：收集所有下属 TL（含子级 TL）名下的员工
      currentAdmin = await Admin.findById(req.user.id);
      if (currentAdmin) {
        const managedIdStrings = (currentAdmin.managedTeamIds || []).map(id => String(id));
        const empIdSet = new Set();
        
        if (req.user.role === 'superadmin') {
          // 超管：全量员工
          const allEmps = await Employee.find({}).select('employeeId').lean();
          allEmps.forEach(e => empIdSet.add(String(e.employeeId)));
        } else {
          // 高管：递归收集所有下属 TL
          const allTlIds = new Set(managedIdStrings);
          const childTls = await Admin.find({ parentTlId: { $in: managedIdStrings } }).select('_id').lean();
          childTls.forEach(t => allTlIds.add(String(t._id)));
          
          for (const tlId of allTlIds) {
            const directEmps = await Employee.find({ parentId: tlId }).select('employeeId').lean();
            directEmps.forEach(e => empIdSet.add(String(e.employeeId)));
            
            const tlGroups = await TeamGroup.find({ teamLeaderId: tlId, status: { $ne: 'disbanded' } }).lean();
            const tlGroupNames = tlGroups.map(g => g.groupName).filter(Boolean);
            const tlGroupIds = tlGroups.map(g => String(g._id));
            if (tlGroupNames.length || tlGroupIds.length) {
              const groupEmps = await Employee.find({
                $or: [
                  { groupName: { $in: tlGroupNames } },
                  { teamGroupId: { $in: tlGroupIds } }
                ]
              }).select('employeeId').lean();
              groupEmps.forEach(e => empIdSet.add(String(e.employeeId)));
            }
          }
        }
        validEmployeeIds = [...empIdSet];
      }
    } else if (req.user) {
      currentAdmin = await Admin.findById(req.user.id);
      if (currentAdmin) {
        // G1 统一路径：直接查自己名下非解散组做 G 员工归属，不再依赖 Admin.teamGroupId
        // (Admin.teamGroupId 可能指向已解散的历史组，导致命中 0 员工)
        const directEmps = await Employee.find({ parentId: currentAdmin._id.toString() }).lean();
        const tlGroups = await TeamGroup.find({ teamLeaderId: currentAdmin._id, status: { $ne: 'disbanded' } }).lean();
        const tlGroupNames = tlGroups.map(g => g.groupName).filter(Boolean);
        const tlGroupIds = tlGroups.map(g => g._id.toString());
        let groupEmps = [];
        if (tlGroupNames.length || tlGroupIds.length) {
          const allowedGroupIds = new Set(tlGroupIds);
          const allowedGroupNames = new Set(tlGroupNames);
          const groupEmpsRaw = await Employee.find({
            $or: [
              { groupName: { $in: tlGroupNames } },
              { teamGroupId: { $in: tlGroupIds } }
            ]
          }).lean();
          groupEmps = router._f1_validateGroupEmps(groupEmpsRaw, { allowedGroupIds, allowedGroupNames });
        }
        const empIdSet = new Set();
        directEmps.forEach(e => empIdSet.add(String(e.employeeId)));
        groupEmps.forEach(e => empIdSet.add(String(e.employeeId)));
        validEmployeeIds = [...empIdSet];
      }
    }

    // ========== 查 Employee 全集（在册=这里；0 金币员工通过 UserGold 映射生成 userId placeholder） ==========
    const relevantEmployees = validEmployeeIds.length > 0
      ? await Employee.find({ employeeId: { $in: validEmployeeIds } }).lean()
      : [];
    const employeeMap = {};
    relevantEmployees.forEach(emp => { employeeMap[emp.employeeId] = emp; });

    // ========== 查 UserGold：给每个在册员工匹配全部 userId（一个员工可能多个 userId，修前就是按 userId 粒度输出） ==========
    const userGolds = validEmployeeIds.length > 0
      ? await UserGold.find({ employeeId: { $in: validEmployeeIds } }).lean()
      : [];
    const userGoldMap = {};
    const validUserIdsFromUG = new Set();     // 通过 UserGold 映射的"在册 userId 全集"（一个员工多 userId 会占多条）
    const userIdToEmployeeId = {};            // userId -> employeeId
    userGolds.forEach(ug => {
      userGoldMap[ug.employeeId] = ug;
      if (validEmployeeIds.includes(String(ug.employeeId))) {
        validUserIdsFromUG.add(ug.userId);
        userIdToEmployeeId[ug.userId] = String(ug.employeeId);
      }
    });

    // ========== GoldLog 聚合：加 employeeId:{$in:validEmployeeIds} + hint，去掉无意义 $limit 5000 ==========
    const goldLogsAggregation = validEmployeeIds.length > 0
      ? await GoldLog.aggregate([
          { $match: { employeeId: { $in: validEmployeeIds }, createTime: { $gte: startDate, $lt: endDate } } },
          { $group: {
            _id: { employeeId: '$employeeId', userId: '$userId' },
            watched: { $sum: 1 },
            earnings: { $sum: '$gold' },
            totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } }
          }}
        ], { hint: { employeeId: 1, createTime: 1 } })
      : [];

    // 构建 userStats（原始 userId 粒度），对有金币记录的人保持原字节级不变
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

    // 缓存管理员和团队信息，避免重复查询
    const allEmployeeIds = Object.keys(employeeMap);
    const parentIds = [...new Set(relevantEmployees.map(e => e.parentId).filter(id => id))];
    const admins = parentIds.length > 0
      ? await Admin.find({ _id: { $in: parentIds } })
      : [];
    const adminMap = {};
    admins.forEach(admin => {
      adminMap[admin._id.toString()] = admin;
    });

    // T1（本优化项不做，单独放到后面 T1 任务一次性处理）：Team.find({}) 暂保留，避免一次改太多难回溯
    const teams = await Team.find({});
    const teamMap = {};
    teams.forEach(team => {
      team.members.forEach(member => {
        teamMap[member.userId] = team.name;
      });
    });

    // ========== 生成 userId 全集 = 在册员工中每个有 userId 的人（0 金币员工从 UserGold 取 userId，可能一位员工多 userId，与修前一致） ==========
    const finalUserIds = new Set();
    // 1) 先塞所有有金币记录的 userId（修前 byte-equal 基础，按 userId 粒度）
    Object.values(userStats).forEach(s => finalUserIds.add(s.userId));
    // 2) 再塞 UserGold 映射出的"在册 userId"，补 0 金币员工（一个员工多 userId 会加多条）
    validUserIdsFromUG.forEach(uid => finalUserIds.add(uid));

    // ========== UserActivity（ipCount / deviceCount）：按 userId 全集 ==========
    const userIdsArr = [...finalUserIds];
    const activities = userIdsArr.length > 0
      ? await UserActivity.find({
          userId: { $in: userIdsArr },
          createTime: { $gte: startDate, $lt: endDate }
        }).lean()
      : [];

    const ipCountMap = {};
    const deviceCountMap = {};
    activities.forEach(act => {
      if (!ipCountMap[act.userId]) ipCountMap[act.userId] = new Set();
      if (!deviceCountMap[act.userId]) deviceCountMap[act.userId] = new Set();
      if (act.ip) ipCountMap[act.userId].add(act.ip);
      if (act.deviceId) deviceCountMap[act.userId].add(act.deviceId);
    });

    // ========== 组装 userStatsArray（按 userId 粒度，与修前 byte-equal；在册全员都有 userId 就不会漏） ==========
    const allSeen = new Set();
    const rawRows = [];

    // Step1: 有金币的 userId 先登记（修前的行为，byte-equal）
    Object.values(userStats).forEach(stat => {
      allSeen.add(stat.userId);
      rawRows.push(stat);
    });

    // Step2: UserGold 中在册但 userStats 中没记录的 userId → 补 placeholder（0 金币员工/ 该员工另一 userId 本月无业绩）
    validUserIdsFromUG.forEach(uid => {
      if (!allSeen.has(uid)) {
        allSeen.add(uid);
        rawRows.push({
          userId: uid,
          employeeId: userIdToEmployeeId[uid],
          watched: 0,
          earnings: 0,
          totalEcpm: 0
        });
      }
    });

    const userStatsArray = rawRows.map(stat => {
      const employee = employeeMap[stat.employeeId] || {};
      const regDays = employee.createdAt
        ? Math.floor((Date.now() - new Date(employee.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      let superior = '系统直属';
      if (teamMap[stat.userId]) {
        superior = teamMap[stat.userId];
      } else if (employee.parentId) {
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
      const kpiCacheKey = getCacheKey(range, currentAdmin.teamGroupId, currentAdmin._id.toString());
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
      const kpiCacheKey = getCacheKey(range, 'superadmin', currentAdmin._id.toString());
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
    const kpiCacheKey = getCacheKey(range, currentAdmin.teamName, currentAdmin._id.toString());
    // 暂时禁用缓存以便调试
    let kpiData = null; // getFromCache(kpiCacheKey);
    
    if (!kpiData) {
      const adminId = currentAdmin._id.toString ? currentAdmin._id.toString() : currentAdmin._id;
      
      // TL业绩员工范围（≤2级，与提成computeNewKpi一致）：
      // 1. TL直推员工(parentId = TL)
      // 2. TL自己的组长组员工(TeamGroup.teamLeaderId=TL)
      // 3. 每个下属TL的直属员工(parentId=子TL 且 NOT IN 子TL组长组)
      const directEmployees = await Employee.find({ parentId: adminId });
      const adminGroups = await TeamGroup.find({ teamLeaderId: currentAdmin._id, status: { $ne: 'disbanded' } }).lean();
      const groupNames = adminGroups.map(g => g.groupName).filter(Boolean);
      const groupIds = adminGroups.map(g => String(g._id));
      let groupEmployees = [];
      if (groupNames.length > 0 || groupIds.length > 0) {
        const raw = await Employee.find({ $or: [{ groupName: { $in: groupNames } }, { teamGroupId: { $in: groupIds } }] }).select('employeeId teamGroupId groupName').lean();
        const gids = new Set(groupIds); const gnms = new Set(groupNames);
        groupEmployees = raw.filter(e => {
          const gid = e.teamGroupId ? String(e.teamGroupId) : '';
          const gn = e.groupName || '';
          return gids.has(gid) || gnms.has(gn);
        });
      }
      // 下属TL直属员工（排除下属TL自己的组长组员工 = 超2级）
      let subTlDirectEmployees = [];
      const subTls = await Admin.find({
        parentTlId: currentAdmin._id,
        role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
      }).select('_id').lean();
      for (const stl of subTls) {
        const stlId = String(stl._id);
        const stlAll = await Employee.find({ parentId: stlId }).select('employeeId groupName teamGroupId').lean();
        const stlGroups = await TeamGroup.find({ teamLeaderId: stl._id, status: { $ne: 'disbanded' } }).lean();
        const sgids = new Set(stlGroups.map(g => String(g._id)));
        const sgnms = new Set(stlGroups.map(g => g.groupName).filter(Boolean));
        stlAll.forEach(e => {
          const gid = e.teamGroupId ? String(e.teamGroupId) : '';
          const gn = e.groupName || '';
          if (!sgids.has(gid) && !sgnms.has(gn)) subTlDirectEmployees.push(e);
        });
      }
      // 合并去重（≤2级）
      const empMap = new Map();
      directEmployees.forEach(e => empMap.set(String(e.employeeId), e));
      groupEmployees.forEach(e => empMap.set(String(e.employeeId), e));
      subTlDirectEmployees.forEach(e => empMap.set(String(e.employeeId), e));
      const employees = Array.from(empMap.values());
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
          { $group: { 
            _id: null, 
            count: { $sum: 1 }, 
            totalGold: { $sum: '$gold' }, 
            totalEcpm: { $sum: '$ecpm' },
            filteredGold: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$gold', 0] }, 2000] }, { $ifNull: ['$gold', 0] }, 0] } }
          } }
        ]),
        GoldLog.aggregate([
          { $match: prevMatchStage },
          { $group: { 
            _id: null, 
            count: { $sum: 1 }, 
            totalGold: { $sum: '$gold' }, 
            totalEcpm: { $sum: '$ecpm' },
            filteredGold: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$gold', 0] }, 2000] }, { $ifNull: ['$gold', 0] }, 0] } }
          } }
        ])
      ]);
      
      const current = currentStats[0] || { count: 0, totalGold: 0, totalEcpm: 0, filteredGold: 0 };
      const prev = prevStats[0] || { count: 0, totalGold: 0, totalEcpm: 0, filteredGold: 0 };
      
      let totalImpressions = current.count;
      let totalClicks = Math.floor(totalImpressions * 0.15);
      let totalGold = current.totalGold;
      let totalRevenue = current.totalGold / 1000; // 展示用，不过滤
      let totalEcpmValue = current.totalEcpm;
      
      let prevTotalGold = prev.totalGold;
      let prevTotalRevenue = prev.totalGold / 1000; // 展示用，不过滤
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
          { $group: { 
            _id: null, 
            count: { $sum: 1 }, 
            totalGold: { $sum: '$gold' }, 
            totalEcpm: { $sum: '$ecpm' },
            filteredGold: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$gold', 0] }, 2000] }, { $ifNull: ['$gold', 0] }, 0] } }
          } }
        ]);

        const prevStats = await GoldLog.aggregate([
          { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: prevStartUTC, $lt: prevEndUTC } } },
          { $group: { 
            _id: null, 
            count: { $sum: 1 }, 
            totalGold: { $sum: '$gold' }, 
            totalEcpm: { $sum: '$ecpm' },
            filteredGold: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$gold', 0] }, 2000] }, { $ifNull: ['$gold', 0] }, 0] } }
          } }
        ]);

        const currentStats = rangeStats[0] || { count: 0, totalGold: 0, totalEcpm: 0, filteredGold: 0 };
        const prev = prevStats[0] || { count: 0, totalGold: 0, totalEcpm: 0, filteredGold: 0 };

        const rangeGoldRevenue = currentStats.totalGold / 1000; // 展示用，不过滤
        const prevGoldRevenue = prev.totalGold / 1000; // 展示用，不过滤
        const rangeCommissionBase = (currentStats.filteredGold || 0) / 1000; // 提成基数，过滤 gold>2000
        const prevCommissionBase = (prev.filteredGold || 0) / 1000; // 提成基数，过滤
        const rangeCommission = rangeCommissionBase * (group.commission || 0.05);
        const prevCommission = prevCommissionBase * (group.commission || 0.05);
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
    
    // 使用 computeNewKpi 计算正确的 TL 提成（通过级差方式）
    const tlScope = { kind: 'TL', adminId: String(currentAdmin._id) };
    const tlKpi = await computeNewKpi(tlScope, range);
    const teamLeadCommission = tlKpi.teamCommission || 0;

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
      TeamGroup.find({ teamLeaderId: adminId, status: { $ne: 'disbanded' } })
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

    // 获取≤2级员工范围（TL直推+TL组长组+子TL直推 NOT IN 子TL组长组）
    // 1. TL直推
    const directEmployees = await Employee.find({ parentId: currentAdmin._id.toString() });
    // 2. TL自己的组长组
    const groups = await TeamGroup.find({ teamLeaderId: currentAdmin._id.toString(), status: { $ne: 'disbanded' } }).lean();
    const groupNames = groups.map(g => g.groupName).filter(Boolean);
    const groupIds = groups.map(g => String(g._id));
    let groupEmployees = [];
    if (groupNames.length || groupIds.length) {
      const rawGrp = await Employee.find({ $or: [{ groupName: { $in: groupNames } }, { teamGroupId: { $in: groupIds } }] }).select('employeeId teamGroupId groupName').lean();
      const gidsS = new Set(groupIds); const gnmsS = new Set(groupNames);
      groupEmployees = rawGrp.filter(e => {
        const gid = e.teamGroupId ? String(e.teamGroupId) : '';
        const gn = e.groupName || '';
        return gidsS.has(gid) || gnmsS.has(gn);
      });
    }
    // 3. 下属TL直属（排除下属TL自己的组长组 = 超2级）
    let subTlDirectEmployees = [];
    const subTls = await Admin.find({
      parentTlId: currentAdmin._id,
      role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
    }).select('_id').lean();
    for (const stl of subTls) {
      const stlId = String(stl._id);
      const stlAll = await Employee.find({ parentId: stlId }).select('employeeId groupName teamGroupId').lean();
      const stlGroups = await TeamGroup.find({ teamLeaderId: stl._id, status: { $ne: 'disbanded' } }).lean();
      const sgids = new Set(stlGroups.map(g => String(g._id)));
      const sgnms = new Set(stlGroups.map(g => g.groupName).filter(Boolean));
      stlAll.forEach(e => {
        const gid = e.teamGroupId ? String(e.teamGroupId) : '';
        const gn = e.groupName || '';
        if (!sgids.has(gid) && !sgnms.has(gn)) subTlDirectEmployees.push(e);
      });
    }
    // 合并去重（≤2级）
    const em = new Map();
    directEmployees.forEach(e => em.set(String(e.employeeId), e));
    groupEmployees.forEach(e => em.set(String(e.employeeId), e));
    subTlDirectEmployees.forEach(e => em.set(String(e.employeeId), e));
    const employees = Array.from(em.values());
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

    const groupById = {};
    groups.forEach(g => { groupById[g._id.toString()] = g; });

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
        { $group: { 
          _id: null, 
          totalGold: { $sum: '$gold' },
          filteredGold: { $sum: { $cond: [{ $lte: ['$gold', 2000] }, '$gold', 0] } }
        } }
      ]),
      // 本月数据
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: monthStart } } },
        { $group: { 
          _id: null, 
          totalGold: { $sum: '$gold' },
          filteredGold: { $sum: { $cond: [{ $lte: ['$gold', 2000] }, '$gold', 0] } }
        } }
      ]),
      // 上月数据
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds }, createTime: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
        { $group: { 
          _id: null, 
          totalGold: { $sum: '$gold' },
          filteredGold: { $sum: { $cond: [{ $lte: ['$gold', 2000] }, '$gold', 0] } }
        } }
      ]),
      // 累计数据
      GoldLog.aggregate([
        { $match: { employeeId: { $in: employeeIds } } },
        { $group: { 
          _id: null, 
          totalGold: { $sum: '$gold' },
          filteredGold: { $sum: { $cond: [{ $lte: ['$gold', 2000] }, '$gold', 0] } }
        } }
      ])
    ]);

    // 按组别计算组长收益 - 优化版本
    const calculateGroupLeaderRevenueOptimized = async (start, end) => {
      // 构建查询条件
      const matchCondition = { employeeId: { $in: employeeIds }, createTime: { $gte: start } };
      if (end) {
        matchCondition.createTime.$lt = end;
      }
      
      // 一次性查询所有员工的金币记录（含 filteredGold）
      const allGoldLogs = await GoldLog.aggregate([
        { $match: matchCondition },
        { $group: { 
          _id: '$employeeId', 
          totalGold: { $sum: '$gold' },
          filteredGold: { $sum: { $cond: [{ $lte: ['$gold', 2000] }, '$gold', 0] } }
        } }
      ]);
      
      // 按员工ID构建映射（使用 filteredGold 计算提成）
      const goldByEmployee = {};
      allGoldLogs.forEach(log => {
        goldByEmployee[log._id] = log.filteredGold || 0; // 提成计算用过滤后的金币
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

    // 团队长提成直接复用 computeNewKpi（与≤2级规则一致，含级差提成，非硬编码20%）
    const tlScope = { kind: 'TL', adminId: String(currentAdmin._id) };
    const [todayKpi, monthKpi, lastMonthKpi, allKpi] = await Promise.all([
      computeNewKpi(tlScope, 'today'),
      computeNewKpi(tlScope, 'month'),
      computeNewKpi(tlScope, 'lastMonth'),
      computeNewKpi(tlScope, 'all'),
    ]);
    
    const n2 = v => +(+v || 0).toFixed(2);
    const resultData = {
      today: n2(todayKpi.teamCommission),
      thisMonth: n2(monthKpi.teamCommission),
      lastMonth: n2(lastMonthKpi.teamCommission),
      total: n2(allKpi.teamCommission)
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

// ==================== 管理者直属业绩卡列表（超管/高管）====================
router.get('/super/manager-direct-cards', authMiddleware, async (req, res) => {
  try {
    const { range = 'today', limit } = req.query;
    const limitNum = limit ? Math.min(parseInt(limit, 10) || 2000, 5000) : 2000;

    const currentAdmin = await Admin.findById(req.user.id).lean();
    if (!currentAdmin) return res.status(403).json({ success: false, message: '管理员不存在' });

    const role = String(currentAdmin.role || '').toUpperCase();
    const isSuper = role === 'SUPER_ADMIN' || currentAdmin.role === 'superadmin';
    const isMgr = role === 'ADMIN_MANAGER' || currentAdmin.role === 'admin_manager';

    if (!isSuper && !isMgr) {
      return res.status(403).json({ success: false, message: '无权限访问' });
    }

    // 收集管辖范围内的管理者（团队长 + 组长）
    const n2 = v => +(+v || 0).toFixed(2);
    const safeInt = v => +(+v || 0);

    let managers = [];

    if (isSuper) {
      // 超管：所有团队长 + 组长
      const allAdmins = await Admin.find({
        role: { $in: ['NORMAL_ADMIN', 'normal_admin', 'GROUP_LEADER', 'group_leader'] }
      }).select('_id username realName role teamName commission createdAt teamGroupId parentTlId employeeId level').lean();

      // 团队长
      const tlDocs = allAdmins.filter(a => String(a.role || '').toUpperCase() === 'NORMAL_ADMIN');
      // 组长
      const glDocs = allAdmins.filter(a => String(a.role || '').toUpperCase() !== 'NORMAL_ADMIN');

      // 收集每个 TL 下属的 GL 组长
      const glTLMap = new Map();
      glDocs.forEach(gl => {
        const tlId = gl.parentTlId ? String(gl.parentTlId) : null;
        if (!tlId) return;
        if (!glTLMap.has(tlId)) glTLMap.set(tlId, []);
        glTLMap.get(tlId).push(gl);
      });

      // 1) 团队长卡
      for (const tl of tlDocs) {
        const tlId = String(tl._id);
        const tlScope = { kind: 'TL', adminId: tlId };
        const tlToday = await computeNewKpi(tlScope, 'today');
        const tlMonth = await computeNewKpi(tlScope, 'month');
        const tlYesterday = await computeNewKpi(tlScope, 'yesterday');
        const memberCount = (tlToday._debug?.dCount || 0) + (tlToday._debug?.iCount || 0);

        managers.push({
          realName: tl.realName || '',
          username: tl.username || '',
          userId: tlId,
          _id: tlId,
          objectId: tlId,
          adminId: tlId,
          employeeId: tl.employeeId || '',
          role: 'NORMAL_ADMIN',
          teamName: tl.teamName || '',
          team: tl.teamName || '',
          level: tl.level || '',
          commissionRate: n2(tl.commission || 0),
          rate: n2(tl.commission || 0),
          commission: n2(tl.commission || 0),
          memberCount: safeInt(memberCount),
          todayActive: safeInt(tlToday.directActiveUsers || 0),
          todayRevenue: n2(tlToday.teamRevenue),
          monthlyRevenue: n2(tlMonth.teamRevenue),
          yesterdayRevenue: n2(tlYesterday.teamRevenue),
          todayAdCount: safeInt(tlToday.directImpressions || 0),
          impressions: safeInt(tlToday.directImpressions || 0),
          totalAds: safeInt(tlToday.directImpressions || 0),
          avgEcpm: n2(tlToday.teamRevenue > 0 && tlToday.directImpressions > 0
            ? (tlToday.teamRevenue / tlToday.directImpressions) * 1000 : 0),
          ecpm: n2(tlToday.teamRevenue > 0 && tlToday.directImpressions > 0
            ? (tlToday.teamRevenue / tlToday.directImpressions) * 1000 : 0),
          avgGold: n2(tlToday.teamRevenue),
          createdAt: tl.createdAt ? tl.createdAt.toISOString() : null,
          _scope: 'TL'
        });

        // 2) 下属组长卡
        const subGLs = glTLMap.get(tlId) || [];
        for (const gl of subGLs) {
          const glId = String(gl._id);
          const glScope = { kind: 'GL', adminId: glId, teamGroupId: gl.teamGroupId };
          const glToday = await computeNewKpi(glScope, 'today');
          const glMonth = await computeNewKpi(glScope, 'month');
          const glYesterday = await computeNewKpi(glScope, 'yesterday');
          const glMemberCount = (glToday._debug?.dCount || 0) + (glToday._debug?.iCount || 0);

          managers.push({
            realName: gl.realName || '',
            username: gl.username || '',
            userId: glId,
            _id: glId,
            objectId: glId,
            adminId: glId,
            employeeId: gl.employeeId || '',
            role: 'GROUP_LEADER',
            teamName: tl.teamName || '',
            team: tl.teamName || '',
            level: gl.level || '',
            commissionRate: 0.05,
            rate: 0.05,
            commission: 0.05,
            memberCount: safeInt(glMemberCount),
            todayActive: safeInt(glToday.directActiveUsers || 0),
            todayRevenue: n2(glToday.teamRevenue),
            monthlyRevenue: n2(glMonth.teamRevenue),
            yesterdayRevenue: n2(glYesterday.teamRevenue),
            todayAdCount: safeInt(glToday.directImpressions || 0),
            impressions: safeInt(glToday.directImpressions || 0),
            totalAds: safeInt(glToday.directImpressions || 0),
            avgEcpm: n2(glToday.teamRevenue > 0 && glToday.directImpressions > 0
              ? (glToday.teamRevenue / glToday.directImpressions) * 1000 : 0),
            ecpm: n2(glToday.teamRevenue > 0 && glToday.directImpressions > 0
              ? (glToday.teamRevenue / glToday.directImpressions) * 1000 : 0),
            avgGold: n2(glToday.teamRevenue),
            createdAt: gl.createdAt ? gl.createdAt.toISOString() : null,
            _scope: 'GL'
          });
        }
      }
    } else {
      // 高管：只返回 managedTeamIds 范围内的 TL 及其下属 GL
      const managedIds = (currentAdmin.managedTeamIds || []).map(id => String(id));
      if (managedIds.length === 0) {
        return res.json({ success: true, data: [], total: 0 });
      }

      const tlDocs = await Admin.find({
        _id: { $in: managedIds.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id) },
        role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
      }).select('_id username realName role teamName commission createdAt teamGroupId parentTlId employeeId level').lean();

      const glDocs = await Admin.find({
        parentTlId: { $in: managedIds },
        role: { $in: ['GROUP_LEADER', 'group_leader'] }
      }).select('_id username realName role teamName commission createdAt teamGroupId parentTlId employeeId level').lean();

      const glTLMap = new Map();
      glDocs.forEach(gl => {
        const tlId = gl.parentTlId ? String(gl.parentTlId) : null;
        if (!tlId) return;
        if (!glTLMap.has(tlId)) glTLMap.set(tlId, []);
        glTLMap.get(tlId).push(gl);
      });

      for (const tl of tlDocs) {
        const tlId = String(tl._id);
        const tlScope = { kind: 'TL', adminId: tlId };
        const tlToday = await computeNewKpi(tlScope, 'today');
        const tlMonth = await computeNewKpi(tlScope, 'month');
        const tlYesterday = await computeNewKpi(tlScope, 'yesterday');
        const memberCount = (tlToday._debug?.dCount || 0) + (tlToday._debug?.iCount || 0);

        managers.push({
          realName: tl.realName || '',
          username: tl.username || '',
          userId: tlId,
          _id: tlId,
          objectId: tlId,
          adminId: tlId,
          employeeId: tl.employeeId || '',
          role: 'NORMAL_ADMIN',
          teamName: tl.teamName || '',
          team: tl.teamName || '',
          level: tl.level || '',
          commissionRate: n2(tl.commission || 0),
          rate: n2(tl.commission || 0),
          commission: n2(tl.commission || 0),
          memberCount: safeInt(memberCount),
          todayActive: safeInt(tlToday.directActiveUsers || 0),
          todayRevenue: n2(tlToday.teamRevenue),
          monthlyRevenue: n2(tlMonth.teamRevenue),
          yesterdayRevenue: n2(tlYesterday.teamRevenue),
          todayAdCount: safeInt(tlToday.directImpressions || 0),
          impressions: safeInt(tlToday.directImpressions || 0),
          totalAds: safeInt(tlToday.directImpressions || 0),
          avgEcpm: n2(tlToday.teamRevenue > 0 && tlToday.directImpressions > 0
            ? (tlToday.teamRevenue / tlToday.directImpressions) * 1000 : 0),
          ecpm: n2(tlToday.teamRevenue > 0 && tlToday.directImpressions > 0
            ? (tlToday.teamRevenue / tlToday.directImpressions) * 1000 : 0),
          avgGold: n2(tlToday.teamRevenue),
          createdAt: tl.createdAt ? tl.createdAt.toISOString() : null,
          _scope: 'TL'
        });

        const subGLs = glTLMap.get(tlId) || [];
        for (const gl of subGLs) {
          const glId = String(gl._id);
          const glScope = { kind: 'GL', adminId: glId, teamGroupId: gl.teamGroupId };
          const glToday = await computeNewKpi(glScope, 'today');
          const glMonth = await computeNewKpi(glScope, 'month');
          const glYesterday = await computeNewKpi(glScope, 'yesterday');
          const glMemberCount = (glToday._debug?.dCount || 0) + (glToday._debug?.iCount || 0);

          managers.push({
            realName: gl.realName || '',
            username: gl.username || '',
            userId: glId,
            _id: glId,
            objectId: glId,
            adminId: glId,
            employeeId: gl.employeeId || '',
            role: 'GROUP_LEADER',
            teamName: tl.teamName || '',
            team: tl.teamName || '',
            level: gl.level || '',
            commissionRate: 0.05,
            rate: 0.05,
            commission: 0.05,
            memberCount: safeInt(glMemberCount),
            todayActive: safeInt(glToday.directActiveUsers || 0),
            todayRevenue: n2(glToday.teamRevenue),
            monthlyRevenue: n2(glMonth.teamRevenue),
            yesterdayRevenue: n2(glYesterday.teamRevenue),
            todayAdCount: safeInt(glToday.directImpressions || 0),
            impressions: safeInt(glToday.directImpressions || 0),
            totalAds: safeInt(glToday.directImpressions || 0),
            avgEcpm: n2(glToday.teamRevenue > 0 && glToday.directImpressions > 0
              ? (glToday.teamRevenue / glToday.directImpressions) * 1000 : 0),
            ecpm: n2(glToday.teamRevenue > 0 && glToday.directImpressions > 0
              ? (glToday.teamRevenue / glToday.directImpressions) * 1000 : 0),
            avgGold: n2(glToday.teamRevenue),
            createdAt: gl.createdAt ? gl.createdAt.toISOString() : null,
            _scope: 'GL'
          });
        }
      }
    }

    // 排序：今日业绩降序
    managers.sort((a, b) => (b.todayRevenue || 0) - (a.todayRevenue || 0));
    const limited = managers.slice(0, limitNum);

    res.json({
      success: true,
      data: limited,
      total: managers.length
    });
  } catch (error) {
    console.error('管理者业绩卡错误:', error);
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

// 聚合 GoldLog 数据并计算提成（聚合管道版本）
// rateConfig: { type: 'direct'|'indirect'|'gl', fallback, subOwnRate?, diffRate? }
async function aggWithRate(ids, s, e, rateConfig) {
  const GoldLog = mongoose.model('GoldLog');
  
  let rateExpr;
  
  if (rateConfig.type === 'gl' || rateConfig.type === 'direct_gl') {
    rateExpr = rateConfig.fallback;
    
  } else if (rateConfig.type === 'direct') {
    // 团队长算自己直属员工提成
    // 优先级：commissionRate > tlCommissionRate > fallback
    //   commissionRate > 0 → 组内员工历史记录，当时的组长提成
    //   tlCommissionRate > 0 → 直属员工记录，全率
    rateExpr = {
      $cond: [
        { $and: [
          { $gt: [{ $ifNull: ['$commissionRate', 0] }, 0] },
          { $lte: [{ $ifNull: ['$commissionRate', 0] }, 1] }
        ]},
        '$commissionRate',
        { $cond: [
          { $and: [
            { $gt: [{ $ifNull: ['$tlCommissionRate', 0] }, 0] },
            { $lte: [{ $ifNull: ['$tlCommissionRate', 0] }, 1] }
          ]},
          '$tlCommissionRate',
          rateConfig.fallback
        ]}
      ]
    };
    
  } else if (rateConfig.type === 'indirect') {
    // 团队长算间推级差
    // 优先级：jcCommissionRate > parentTlCommissionRate > (tlCommissionRate - commissionRate) > fallback
    //   jcCommissionRate → 新记录，直接固化好的级差，直接用
    //   parentTlCommissionRate → 旧直属员工记录，上上级级差
    //   tlCommissionRate - commissionRate → 旧组内员工记录，级差 = TL全率 - 组长率
    const MIN_INDIRECT_RATE = 0.02;
    const fallbackDiff = rateConfig.diffRate && rateConfig.diffRate > 0 ? rateConfig.diffRate : MIN_INDIRECT_RATE;

    const jcRate = { $ifNull: ['$jcCommissionRate', 0] };
    const ptlRate = { $ifNull: ['$parentTlCommissionRate', 0] };
    const tlRate = { $ifNull: ['$tlCommissionRate', 0] };
    const commRate = { $ifNull: ['$commissionRate', 0] };

    // 旧组内员工记录级差：tlCommissionRate(TL全率) - commissionRate(组长率)，保底2%
    const tlCommDiff = {
      $cond: [
        { $gt: [{ $subtract: [tlRate, commRate] }, 0] },
        { $subtract: [tlRate, commRate] },
        MIN_INDIRECT_RATE
      ]
    };

    rateExpr = {
      $cond: [
        // 1) 新记录：jcCommissionRate 直接固化好的级差
        { $and: [{ $gt: [jcRate, 0] }, { $lte: [jcRate, 1] }] },
        jcRate,
        { $cond: [
          // 2) 旧直属员工记录：parentTlCommissionRate
          { $and: [{ $gt: [ptlRate, 0] }, { $lte: [ptlRate, 1] }] },
          ptlRate,
          { $cond: [
            // 3) 旧组内员工记录：tlCommissionRate - commissionRate
            { $and: [{ $gt: [tlRate, 0] }, { $gt: [commRate, 0] }] },
            tlCommDiff,
            // 4) fallback
            fallbackDiff
          ]}
        ]}
      ]
    };
    
  } else {
    return { count: 0, totalGold: 0, commGold: 0 };
  }
  
  const result = await GoldLog.aggregate([
    { $match: { employeeId: { $in: ids }, createTime: { $gte: s, $lt: e } } },
    { $group: {
      _id: null,
      count: { $sum: 1 },
      totalGold: { $sum: { $ifNull: ['$gold', 0] } },
      commGold: { $sum: {
        $cond: [
          { $lte: [{ $ifNull: ['$gold', 0] }, 2000] },
          { $multiply: [{ $ifNull: ['$gold', 0] }, rateExpr] },
          0
        ]
      }}
    }}
  ]).exec();
  
  if (result.length === 0) return { count: 0, totalGold: 0, commGold: 0 };
  return {
    count: result[0].count,
    totalGold: +result[0].totalGold || 0,
    commGold: +result[0].commGold || 0
  };
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
    const adminGroups = await TeamGroup.find({ teamLeaderId: scope.adminId, status: { $ne: 'disbanded' } }).lean();
    const groupIds = adminGroups.map(g => String(g._id));
    const groupNames = adminGroups.map(g => g.groupName).filter(Boolean);
    
    directEmpIds = directEmps.filter(e => {
      const gid = e.teamGroupId ? String(e.teamGroupId) : '';
      const gn = e.groupName || '';
      return !groupIds.includes(gid) && !groupNames.includes(gn);
    }).map(e => e.employeeId);
    
    // 下属组长的G员工（F1 二次校验防同名 groupName 串组）
    if (groupIds.length > 0 || groupNames.length > 0) {
      const allowedGroupIds = new Set(groupIds);
      const allowedGroupNames = new Set(groupNames);
      const groupEmpsRaw = await Employee.find({
        $or: [
          { teamGroupId: { $in: groupIds } },
          { groupName: { $in: groupNames } }
        ]
      }).select('employeeId teamGroupId groupName').lean();
      const groupEmps = router._f1_validateGroupEmps(groupEmpsRaw, { allowedGroupIds, allowedGroupNames });
      groupEmpIds = groupEmps.map(e => e.employeeId);
    }
    
    // 下属TL及其直属员工（注意：最多2级，排除下属TL自己的组长组员工！）
    const subTls = await Admin.find({
      parentTlId: scope.adminId,
      role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
    }).select('_id commission').lean();
    
    for (const subTl of subTls) {
      const subTlId = String(subTl._id);
      const subTlRate = +(subTl.commission || 0);
      const subTlDirectEmpsRaw = await Employee.find({ parentId: subTlId }).select('employeeId groupName teamGroupId').lean();
      // 查询下属TL自己的组长组（TeamGroup.teamLeaderId=子TL）
      const subTlGroups = await TeamGroup.find({ teamLeaderId: subTl._id, status: { $ne: 'disbanded' } }).lean();
      const subTlGroupIds = new Set(subTlGroups.map(g => String(g._id)));
      const subTlGroupNames = new Set(subTlGroups.map(g => g.groupName).filter(Boolean));
      // 过滤：只保留 parentId=subTlId 且 NOT IN 子TL组长组的员工（<=2级规则，避免下属TL的组长组员工作为第3级混入）
      const subTlDirectIds = subTlDirectEmpsRaw.filter(e => {
        const gid = e.teamGroupId ? String(e.teamGroupId) : '';
        const gn = e.groupName || '';
        return !subTlGroupIds.has(gid) && !subTlGroupNames.has(gn);
      }).map(e => e.employeeId);
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
    const rateConfig = scope.kind === 'GL' 
      ? { type: 'gl', fallback: tlFallbackRate }
      : { type: 'direct', fallback: tlFallbackRate };
    
    const [dCur, dPrev] = await Promise.all([
      aggWithRate(directEmpIds, start, end, rateConfig),
      aggWithRate(directEmpIds, prevStart, prevEnd, rateConfig)
    ]);
    dCurCount = dCur.count; dCurGold = dCur.totalGold; dCurComm = dCur.commGold;
    dPrevCount = dPrev.count; dPrevGold = dPrev.totalGold; dPrevComm = dPrev.commGold;
  }
  
  // 计算间推提成（组长员工 + 下属TL员工）
  let iCurCount = 0, iCurGold = 0, iCurComm = 0;
  let iPrevCount = 0, iPrevGold = 0, iPrevComm = 0;
  
  // 组长员工：级差 = (tlFallbackRate - glOwnRate) <= 0 时保底 2%
  const glOwnRate = 0.05;
  const glRawDiff = tlFallbackRate - glOwnRate;
  const glDiffRate = glRawDiff <= 0 ? 0.02 : glRawDiff;
  if (groupEmpIds.length > 0) {
    const [gCur, gPrev] = await Promise.all([
      aggWithRate(groupEmpIds, start, end, {
        type: 'indirect', subOwnRate: glOwnRate,
        diffRate: glDiffRate
      }),
      aggWithRate(groupEmpIds, prevStart, prevEnd, {
        type: 'indirect', subOwnRate: glOwnRate,
        diffRate: glDiffRate
      })
    ]);
    iCurCount += gCur.count; iCurGold += gCur.totalGold; iCurComm += gCur.commGold;
    iPrevCount += gPrev.count; iPrevGold += gPrev.totalGold; iPrevComm += gPrev.commGold;
  }
  
  // 下属TL员工：级差 = (tlFallbackRate - subTlRate) <= 0 时保底 2%
  for (const sub of subTlInfo) {
    const subOwnRate = sub.rate || 0;
    const subRawDiff = tlFallbackRate - subOwnRate;
    const subDiffRate = subRawDiff <= 0 ? 0.02 : subRawDiff;
    const rc = { type: 'indirect', subOwnRate, diffRate: subDiffRate };
    const [subCur, subPrev] = await Promise.all([
      aggWithRate(sub.ids, start, end, rc),
      aggWithRate(sub.ids, prevStart, prevEnd, rc)
    ]);
    iCurCount += subCur.count; iCurGold += subCur.totalGold; iCurComm += subCur.commGold;
    iPrevCount += subPrev.count; iPrevGold += subPrev.totalGold; iPrevComm += subPrev.commGold;
  }
  
  // 业绩和提成转换为元
  const dRevenue = safeToFixed2(revToYuan(dCurGold));
  const dCommission = safeToFixed2(revToYuan(dCurComm));
  const dPrevRevenue = safeToFixed2(revToYuan(dPrevGold));
  const dPrevCommission = safeToFixed2(revToYuan(dPrevComm));
  const iRevenue = safeToFixed2(revToYuan(iCurGold));
  const iCommission = safeToFixed2(revToYuan(iCurComm));
  const iPrevRevenue = safeToFixed2(revToYuan(iPrevGold));
  const iPrevCommission = safeToFixed2(revToYuan(iPrevComm));
  const teamRevenue = safeToFixed2(dRevenue + iRevenue);
  const teamCommission = safeToFixed2(dCommission + iCommission);
  const teamRevenuePrev = safeToFixed2(dPrevRevenue + iPrevRevenue);
  const teamCommissionPrev = safeToFixed2(dPrevCommission + iPrevCommission);
  
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
  const teamCommissionGrowth = teamCommissionPrev > 0
    ? round1((teamCommission - teamCommissionPrev) / teamCommissionPrev * 100)
    : 0;
  const directRevenueGrowth = dPrevRevenue > 0
    ? round1((dRevenue - dPrevRevenue) / dPrevRevenue * 100)
    : 0;
  const directCommissionGrowth = dPrevCommission > 0
    ? round1((dCommission - dPrevCommission) / dPrevCommission * 100)
    : 0;
  const indirectRevenueGrowth = iPrevRevenue > 0
    ? round1((iRevenue - iPrevRevenue) / iPrevRevenue * 100)
    : 0;
  const indirectCommissionGrowth = iPrevCommission > 0
    ? round1((iCommission - iPrevCommission) / iPrevCommission * 100)
    : 0;
  
  return {
    directRevenue: dRevenue,
    directPrevRevenue: dPrevRevenue,
    indirectRevenue: iRevenue,
    indirectPrevRevenue: iPrevRevenue,
    teamRevenue,
    teamRevenuePrev,
    directCommission: dCommission,
    directPrevCommission: dPrevCommission,
    indirectCommission: iCommission,
    indirectPrevCommission: iPrevCommission,
    teamCommission,
    teamCommissionPrev,
    directImpressions: dCurCount,
    directPrevImpressions: dPrevCount,
    indirectImpressions: iCurCount,
    indirectPrevImpressions: iPrevCount,
    directUserCount: dirTotalN,
    indirectUserCount: indirTotalN,
    directActiveUsers: activeUserCount,
    indirectActiveUsers: 0,
    directActiveRate: dirTotalN > 0 ? round1(activeUserCount / dirTotalN * 100) : 0,
    indirectActiveRate: 0,
    teamRevenueGrowth,
    teamCommissionGrowth,
    directRevenueGrowth,
    directCommissionGrowth,
    indirectRevenueGrowth,
    indirectCommissionGrowth,
    _scope: scope.kind === 'TL' ? 'TL' : 'GL',
    _range: range,
    _window: { startISO: start.toISOString(), endISO: end.toISOString() },
    _debug: { dCount: dirTotalN, iCount: indirTotalN }
  };
}

function getEmptyKpi() {
  return {
    directRevenue: 0, directPrevRevenue: 0,
    indirectRevenue: 0, indirectPrevRevenue: 0,
    teamRevenue: 0, teamRevenuePrev: 0,
    directCommission: 0, directPrevCommission: 0,
    indirectCommission: 0, indirectPrevCommission: 0,
    teamCommission: 0, teamCommissionPrev: 0,
    directImpressions: 0, directPrevImpressions: 0,
    indirectImpressions: 0, indirectPrevImpressions: 0,
    directUserCount: 0, indirectUserCount: 0,
    directActiveUsers: 0, indirectActiveUsers: 0,
    directActiveRate: 0, indirectActiveRate: 0,
    teamRevenueGrowth: 0, teamCommissionGrowth: 0,
    directRevenueGrowth: 0, directCommissionGrowth: 0,
    indirectRevenueGrowth: 0, indirectCommissionGrowth: 0,
    _scope: 'TL', _range: '', _window: { startISO: '', endISO: '' },
    _debug: { dCount: 0, iCount: 0 }
  };
}

// ==================== 辅助函数：计算员工范围（可预计算复用）====================
async function computeEmployeeScope(teamIds) {
  const Admin = mongoose.model('Admin');
  const Employee = mongoose.model('Employee');
  const TeamGroup = mongoose.model('TeamGroup');
  
  let scopeEmpIds = null;
  let allTlIds = [];
  let allGlIds = [];
  
  if (!teamIds || teamIds.length === 0) {
    const allTls = await Admin.find({ role: { $in: ['NORMAL_ADMIN', 'normal_admin'] } }).select('_id').lean();
    allTlIds = allTls.map(t => String(t._id));
    
    const allGroups = await TeamGroup.find({ status: { $ne: 'disbanded' } }).select('_id teamLeaderId groupLeaderId').lean();
    const groupIds = allGroups.map(g => String(g._id));
    allGlIds = [...new Set(allGroups.map(g => g.groupLeaderId).filter(id => id).map(id => String(id)))];
    
    const allEmps = await Employee.find({
      $or: [
        { parentId: { $in: allTlIds } },
        { teamGroupId: { $in: groupIds } }
      ]
    }).select('employeeId').lean();
    scopeEmpIds = [...new Set(allEmps.map(e => e.employeeId))];
  } else {
    const managedIdStrings = teamIds.map(id => String(id));
    const directTlIds = managedIdStrings;
    
    const subTls = await Admin.find({
      parentTlId: { $in: directTlIds },
      role: { $in: ['NORMAL_ADMIN', 'normal_admin'] }
    }).select('_id').lean();
    const subTlIds = subTls.map(t => String(t._id));
    allTlIds = [...new Set([...directTlIds, ...subTlIds])];
    
    const allGroups = await TeamGroup.find({ 
      teamLeaderId: { $in: allTlIds }, 
      status: { $ne: 'disbanded' } 
    }).select('_id groupLeaderId').lean();
    const groupIds = allGroups.map(g => String(g._id));
    allGlIds = [...new Set(allGroups.map(g => g.groupLeaderId).filter(id => id).map(id => String(id)))];
    
    const allEmps = await Employee.find({
      $or: [
        { parentId: { $in: allTlIds } },
        { teamGroupId: { $in: groupIds } }
      ]
    }).select('employeeId').lean();
    scopeEmpIds = [...new Set(allEmps.map(e => e.employeeId))];
  }
  
  return { scopeEmpIds, allTlIds, allGlIds };
}

// ==================== 辅助函数：超管/高管KPI计算（统一口径）====================
// 口径：businessRevenue=ecpm总计, userShareCommission=gold/1000, managementCommission=TL+GL提成
// 区别：teamIds为空=全量，有值=指定范围；precomputedScope可预计算员工范围
async function computeSuperKpi(range, teamIds, precomputedScope) {
  const { start, end, prevStart, prevEnd } = _getKpiTimeRange(range);
  const Admin = mongoose.model('Admin');
  const Employee = mongoose.model('Employee');
  const TeamGroup = mongoose.model('TeamGroup');
  const GoldLog = mongoose.model('GoldLog');
  const LoginRecord = mongoose.model('LoginRecord');
  const safeToFixed2 = (v) => +(+v || 0).toFixed(2);
  const round1 = (v) => +(+v || 0).toFixed(1);
  
  // 确定员工范围（优先使用预计算结果）
  let scopeEmpIds, allTlIds, allGlIds;
  if (precomputedScope) {
    scopeEmpIds = precomputedScope.scopeEmpIds;
    allTlIds = precomputedScope.allTlIds;
    allGlIds = precomputedScope.allGlIds;
  } else {
    const scope = await computeEmployeeScope(teamIds);
    scopeEmpIds = scope.scopeEmpIds;
    allTlIds = scope.allTlIds;
    allGlIds = scope.allGlIds;
  }
  
  // ===== 准备三个并行查询管线 =====
  
  // 1) 主业绩聚合
  const mainPipe = [];
  const matchStage = { createTime: { $gte: start, $lt: end } };
  if (scopeEmpIds && scopeEmpIds.length > 0) {
    matchStage.employeeId = { $in: scopeEmpIds };
  }
  mainPipe.push({ $match: matchStage });
  mainPipe.push({
    $group: {
      _id: null,
      count: { $sum: 1 },
      totalGold: { $sum: { $ifNull: ['$gold', 0] } },
      totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } },
      filteredGold: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$gold', 0] }, 2000] }, { $ifNull: ['$gold', 0] }, 0] } }
    }
  });
  
  // 2) 环比业绩聚合
  const prevPipe = [];
  const prevMatchStage = { createTime: { $gte: prevStart, $lt: prevEnd } };
  if (scopeEmpIds && scopeEmpIds.length > 0) {
    prevMatchStage.employeeId = { $in: scopeEmpIds };
  }
  prevPipe.push({ $match: prevMatchStage });
  prevPipe.push({
    $group: {
      _id: null,
      totalGold: { $sum: { $ifNull: ['$gold', 0] } },
      totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } },
      count: { $sum: 1 },
      filteredGold: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$gold', 0] }, 2000] }, { $ifNull: ['$gold', 0] }, 0] } }
    }
  });
  
  // 3) 活跃用户查询
  const loginMatch = { loginDate: { $gte: start, $lt: end } };
  if (scopeEmpIds && scopeEmpIds.length > 0) {
    loginMatch.employeeId = { $in: scopeEmpIds };
  }
  const prevLoginMatch = { loginDate: { $gte: prevStart, $lt: prevEnd } };
  if (scopeEmpIds && scopeEmpIds.length > 0) {
    prevLoginMatch.employeeId = { $in: scopeEmpIds };
  }
  
  // 4) 准备 GL 提成批量查询
  const glGroupMap = {};
  if (allGlIds.length > 0) {
    const allGlGroups = await TeamGroup.find({
      groupLeaderId: { $in: allGlIds },
      status: { $ne: 'disbanded' }
    }).select('groupLeaderId _id').lean();
    for (const g of allGlGroups) {
      const gid = String(g.groupLeaderId);
      if (!glGroupMap[gid]) glGroupMap[gid] = [];
      glGroupMap[gid].push(String(g._id));
    }
  }
  
  // 并发限制函数：控制最大并发数
  async function runWithConcurrencyLimit(tasks, limit) {
    const results = [];
    let nextIndex = 0;
    const runner = async () => {
      while (nextIndex < tasks.length) {
        const index = nextIndex++;
        results[index] = await tasks[index]();
      }
    };
    await Promise.all(Array(Math.min(limit, tasks.length)).fill(null).map(() => runner()));
    return results;
  }
  
  const tlTasks = allTlIds.map(tlId => 
    () => computeNewKpi({ kind: 'TL', adminId: tlId }, range)
  );
  const glTasks = [];
  for (const glId of allGlIds) {
    const gids = glGroupMap[glId];
    if (gids && gids.length > 0) {
      glTasks.push(() => computeNewKpi({ kind: 'GL', adminId: glId, teamGroupId: gids[0] }, range));
    }
  }
  
  // ===== 分步执行，降低数据库压力 =====
  // 第1步：主聚合+环比+活跃用户（4路轻量并行）
  const [rows, prevRows, activeUserCounts, prevActiveUserCounts] = await Promise.all([
    GoldLog.aggregate(mainPipe).exec(),
    GoldLog.aggregate(prevPipe).exec(),
    LoginRecord.aggregate([{ $match: loginMatch }, { $group: { _id: '$userId' } }, { $count: 'total' }]).exec(),
    LoginRecord.aggregate([{ $match: prevLoginMatch }, { $group: { _id: '$userId' } }, { $count: 'total' }]).exec()
  ]);
  
  // 第2步：TL 提成计算（串行，最多2并发）
  const tlResults = await runWithConcurrencyLimit(tlTasks, 2);
  
  // 第3步：GL 提成计算（串行，最多2并发）
  const glResults = await runWithConcurrencyLimit(glTasks, 2);
  
  // ===== 汇总主业绩数据 =====
  const r = rows[0] || { count: 0, totalGold: 0, totalEcpm: 0 };
  const businessRevenue = safeToFixed2((+r.totalEcpm || 0) / 1000);
  const impressions = r.count || 0;
  const ecpmAvg = impressions > 0 ? safeToFixed2((+r.totalEcpm || 0) / impressions) : 0;
  const userShareCommission = safeToFixed2((+r.totalGold || 0) / 1000);
  const dividendUserShare = safeToFixed2((+r.filteredGold || 0) / 1000);  // 分红用：过滤 gold>2000
  
  // ===== 汇总环比业绩数据 =====
  const pr = prevRows[0] || { totalGold: 0, totalEcpm: 0, count: 0, filteredGold: 0 };
  const prevBusinessRevenue = safeToFixed2((+pr.totalEcpm || 0) / 1000);
  const prevUserShareCommission = safeToFixed2((+pr.totalGold || 0) / 1000);
  const prevDividendUserShare = safeToFixed2((+pr.filteredGold || 0) / 1000);  // 环比分红用
  const activeUserCount = activeUserCounts[0]?.total || 0;
  const prevActiveUserCount = prevActiveUserCounts[0]?.total || 0;
  
  // ===== 汇总提成数据 =====
  let managementCommission = 0;
  let prevManagementCommission = 0;
  for (const kpi of tlResults) {
    managementCommission += kpi.teamCommission;
    prevManagementCommission += kpi.teamCommissionPrev;
  }
  for (const kpi of glResults) {
    managementCommission += kpi.teamCommission;
    prevManagementCommission += kpi.teamCommissionPrev;
  }
  managementCommission = safeToFixed2(managementCommission);
  prevManagementCommission = safeToFixed2(prevManagementCommission);
  
  // 增长率
  const businessRevenueGrowth = prevBusinessRevenue > 0 
    ? round1((businessRevenue - prevBusinessRevenue) / prevBusinessRevenue * 100) 
    : 0;
  const userShareGrowth = prevUserShareCommission > 0 
    ? round1((userShareCommission - prevUserShareCommission) / prevUserShareCommission * 100) 
    : 0;
  const managementCommissionGrowth = prevManagementCommission > 0 
    ? round1((managementCommission - prevManagementCommission) / prevManagementCommission * 100) 
    : 0;
  const impressionsGrowth = pr.count > 0 
    ? round1((impressions - pr.count) / pr.count * 100) 
    : 0;
  const prevEcpmAvg = pr.count > 0 ? safeToFixed2((+pr.totalEcpm || 0) / pr.count) : 0;
  const ecpmAvgGrowth = prevEcpmAvg > 0 
    ? round1((ecpmAvg - prevEcpmAvg) / prevEcpmAvg * 100) 
    : 0;
  
  // 分红 = 过滤后用户分成金额×25% - 管理分成
  const expectedCommission = dividendUserShare * 0.25;
  const dividendTotal = safeToFixed2(Math.max(0, expectedCommission - managementCommission));
  const prevExpectedCommission = prevDividendUserShare * 0.25;
  const prevDividendTotal = safeToFixed2(Math.max(0, prevExpectedCommission - prevManagementCommission));
  const dividendTotalGrowth = prevDividendTotal > 0 
    ? round1((dividendTotal - prevDividendTotal) / prevDividendTotal * 100) 
    : 0;
  
  // 活跃用户环比
  const activeUserGrowth = prevActiveUserCount > 0 
    ? round1((activeUserCount - prevActiveUserCount) / prevActiveUserCount * 100) 
    : 0;
  
  // 新增用户（暂无数据源，返回 0）
  const newUserCount = 0;
  const prevNewUserCount = 0;
  const newUserCountGrowth = 0;
  
  // 平台毛利 = 业务总收入 - 用户分成金额 - 管理分成 - 分红
  const platformProfit = safeToFixed2(businessRevenue - userShareCommission - managementCommission - dividendTotal);
  const prevPlatformProfit = safeToFixed2(prevBusinessRevenue - prevUserShareCommission - prevManagementCommission - prevDividendTotal);
  const platformProfitGrowth = prevPlatformProfit > 0 
    ? round1((platformProfit - prevPlatformProfit) / prevPlatformProfit * 100) 
    : 0;
  const platformProfitRate = businessRevenue > 0 ? round1(platformProfit / businessRevenue * 100) : 0;
  const platformProfitRateGrowth = prevBusinessRevenue > 0 
    ? round1((platformProfitRate - (prevPlatformProfit / prevBusinessRevenue * 100)) / Math.max(0.01, prevPlatformProfit / prevBusinessRevenue * 100) * 100)
    : 0;
  
  return {
    businessRevenue,
    businessRevenueGrowth,
    userShareCommission,
    userShareGrowth,
    managementCommission,
    managementCommissionGrowth,
    platformProfit,
    platformProfitGrowth,
    platformProfitRate,
    platformProfitRateGrowth,
    dividendTotal,
    dividendTotalGrowth,
    impressions,
    impressionsGrowth,
    ecpmAvg,
    ecpmAvgGrowth,
    activeUserCount,
    activeUserRate: scopeEmpIds && scopeEmpIds.length > 0 ? round1(activeUserCount / scopeEmpIds.length * 100) : 0,
    activeUserGrowth,
    newUserCount,
    newUserCountGrowth,
    registeredUserCount: scopeEmpIds ? scopeEmpIds.length : 0
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
    
    // 计算KPI（超管和高管统一口径，区别在员工范围）
    const kpi = await computeSuperKpi(range, teamIds);
    
    // 设置缓存：今日5分钟，其他1小时
    setCache(cacheKey, kpi, range === 'today' ? 5 * 60 * 1000 : 60 * 60 * 1000);
    
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
    const forceRefresh = req.query.refresh === '1';
    const cacheKey = `dividend_summary_${adminId}`;
    if (!forceRefresh) {
      const cachedData = getFromCache(cacheKey);
      if (cachedData) {
        return res.json({ success: true, data: cachedData, cached: true });
      }
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
    
    // 预计算员工范围（三个时间范围共用，避免重复查询）
    const employeeScope = await computeEmployeeScope(teamIds);
    
    // 计算三个时间范围（超管和高管统一口径）
    const [today, month, lastMonth] = await Promise.all([
      computeSuperKpi('today', teamIds, employeeScope),
      computeSuperKpi('month', teamIds, employeeScope),
      computeSuperKpi('lastMonth', teamIds, employeeScope)
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
      todayDividend: safeToFixed2(today.dividendTotal),
      monthDividend: safeToFixed2(month.dividendTotal),
      lastMonthDividend: safeToFixed2(lastMonth.dividendTotal),
      availableBalance: safeToFixed2(availableBalance)
    };
    
    setCache(cacheKey, result, 5 * 60 * 1000);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('高管分红汇总错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ==================== 导出辅助函数 ====================
router.computeSuperKpi = computeSuperKpi;
router.computeNewKpi = computeNewKpi;
router.computeEmployeeScope = computeEmployeeScope;
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

// ================================================================
// Helper 导出（供 verification.js 中 getTeamLeaderPerformance 复用）
// 100% 复用 KPI/团队员工范围、Rate 口径，确保 业绩Tab ↔ 团队Tab(KPI) 一致
// ================================================================

/**
 * 直推员工ID集合（parentId === TL Admin ID）
 * @param {string} tlIdStr TL Admin._id.toString()
 * @returns {Promise<string[]>} employeeId 字符串数组
 */
router._getTLDirectDIds = async function _getTLDirectDIds(tlIdStr) {
  const emps = await Employee.find({ parentId: String(tlIdStr) }).select('employeeId').lean().exec();
  return emps.map(e => String(e.employeeId));
};

/**
 * F1 下属组员工归属二次校验工具函数（防同名 groupName 串组）
 *
 * 背景：Employee 查询常常用 `$or:[{groupName:{$in:names}},{teamGroupId:{$in:ids}}]`，
 *  如果另一个 TL 也拥有同名 groupName，那 groupName 匹配会把"不属于本 TL 但同名字符串的组员工"也拉进来，
 *  导致 A TL 看板算到 B TL 组的业绩（串组 Bug）。
 *
 * 本函数在"Employee $or 查出 emps"之后做二次内存过滤，规则：
 *  1) 若员工 teamGroupId 非空（有精确组 ID） → 必须在允许的 allowedGroupIds 集合内（100% 不串）
 *  2) 若员工 teamGroupId 为空（历史脏数据只填了 groupName 字符串） → groupName 必须在本 TL 名下的 allowedGroupNames 集合内
 *  3) teamGroupId + groupName 双空 → 孤儿员工，保留（直推员工/D员工）
 *
 * @param {Array<{teamGroupId: any, groupName: string|null, employeeId: string}>} emps Employee $or 查出的员工
 * @param {{allowedGroupIds: Set<string>, allowedGroupNames: Set<string>}} opts 允许的组 ID / 组名集合（必须是 scopeAdmin 名下的 TeamGroup）
 * @returns {Array} 过滤后只属于 scopeAdmin 下属组的员工数组
 */
router._f1_validateGroupEmps = function _f1_validateGroupEmps(emps, opts) {
  if (!emps || !emps.length) return [];
  const allowedGroupIds = opts.allowedGroupIds || new Set();
  const allowedGroupNames = opts.allowedGroupNames || new Set();
  return emps.filter(e => {
    const gid = e.teamGroupId ? String(e.teamGroupId) : '';
    const gn = e.groupName || '';
    if (gid) return allowedGroupIds.has(gid);
    if (gn) return allowedGroupNames.has(gn);
    return true;
  });
};

/**
 * 组长下属组 G 员工ID集合：TeamGroup.teamLeaderId === TL._id，再查 Employee 组名/teamGroupId 匹配（F1 二次校验防同名串组）
 * @param {string} tlIdStr TL Admin._id.toString()
 * @returns {Promise<string[]>} employeeId 字符串数组
 */
router._getTLSubGroupGIds = async function _getTLSubGroupGIds(tlIdStr) {
  const tlGroups = await TeamGroup.find({
    teamLeaderId: mongoose.Types.ObjectId.isValid(tlIdStr) ? new mongoose.Types.ObjectId(tlIdStr) : tlIdStr,
    status: { $ne: 'disbanded' }
  }).select('_id groupName').lean().exec();
  const names = tlGroups.map(g => g.groupName).filter(Boolean);
  const ids = tlGroups.map(g => String(g._id));
  if (!names.length && !ids.length) return [];
  const allowedGroupIds = new Set(ids);
  const allowedGroupNames = new Set(names);
  const $or = [];
  if (names.length) $or.push({ groupName: { $in: names } });
  if (ids.length) $or.push({ teamGroupId: { $in: ids } });
  if (ids.length) $or.push({ teamGroupId: { $in: ids.map(i => mongoose.Types.ObjectId.isValid(i) ? new mongoose.Types.ObjectId(i) : i) } });
  const empsRaw = await Employee.find({ $or }).select('employeeId teamGroupId groupName').lean().exec();
  const emps = router._f1_validateGroupEmps(empsRaw, { allowedGroupIds, allowedGroupNames });
  return [...new Set(emps.map(e => String(e.employeeId)))];
};

/**
 * 直推 Rate MQL 表达式（KPI 同款 dRateExprRate）
 *  优先级：GoldLog.tlCommissionRate → GoldLog.commissionRate → fallback
 * @param {number} fallback 兜底提成率（TL 自身配置 commission）
 * @returns {object} MQL 可嵌入 $multiply 的 rate 表达式
 */
router._dRateExpr = function _dRateExpr(fallback) {
  const hasTl = { $and: [
    { $ne: [{ $ifNull: ['$tlCommissionRate', null] }, null] },
    { $gt: ['$tlCommissionRate', 0] },
    { $lte: ['$tlCommissionRate', 1] }
  ] };
  const hasGl = { $and: [
    { $ne: [{ $ifNull: ['$commissionRate', null] }, null] },
    { $gt: ['$commissionRate', 0] },
    { $lte: ['$commissionRate', 1] }
  ] };
  return { $cond: [hasTl, '$tlCommissionRate', { $cond: [hasGl, '$commissionRate', fallback] }] };
};

/**
 * 下级（组长 G / 下属 TL）级差 Rate MQL 表达式（KPI 同款 ptlRateExprForSub）
 *  规则：如果 GoldLog.tlCommissionRate 存在且 > subOwnRate → tlCommissionRate - subOwnRate；否则 fallback
 * @param {number} subOwnRate 下级自身的提成率（组长统一 5%，下属TL按其配置 commission）
 * @param {number} fallback 兜底级差率（通常 max(0, tlFallbackRate - subOwnRate)）
 * @returns {object} MQL 表达式
 */
router._ptlRateExprForSubordinate = function _ptlRateExprForSubordinate(subOwnRate, fallback) {
  const tlHas = { $and: [
    { $ne: [{ $ifNull: ['$tlCommissionRate', null] }, null] },
    { $gt: ['$tlCommissionRate', 0] },
    { $lte: ['$tlCommissionRate', 1] }
  ] };
  return { $cond: [
    tlHas,
    { $max: [0, { $subtract: ['$tlCommissionRate', subOwnRate] }] },
    fallback
  ] };
};

/**
 * GoldLog 汇总聚合：返回 {totalGold, totalCommissionGold, count}
 *  KPI 同款：所有记录都会参与计算（无 gold<=2000 过滤）
 * @param {string[]} ids Employee.employeeId
 * @param {Date} start UTC 起始（含）
 * @param {Date} end UTC 结束（不含）
 * @param {number|object} rate Rate 表达式（来自 _dRateExpr / _ptlRateExprForSubordinate）
 */
router._aggGold = async function _aggGold(ids, start, end, rate) {
  if (!ids || !ids.length) return { totalGold: 0, totalCommissionGold: 0, count: 0 };
  const rows = await GoldLog.aggregate([
    { $match: { employeeId: { $in: ids }, createTime: { $gte: start, $lt: end } } },
    { $group: {
      _id: null,
      count: { $sum: 1 },
      totalGold: { $sum: '$gold' },
      totalCommissionGold: { $sum: { $multiply: ['$gold', rate] } }
    } }
  ], { hint: { employeeId: 1, createTime: 1 } }).exec();
  const r = rows[0] || { count: 0, totalGold: 0, totalCommissionGold: 0 };
  return {
    count: +r.count || 0,
    totalGold: +r.totalGold || 0,
    totalCommissionGold: +r.totalCommissionGold || 0
  };
};

module.exports = router;
