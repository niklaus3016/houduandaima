const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const GoldLog = require('../models/GoldLog');
const Admin = require('../models/Admin');
const authMiddleware = require('../middleware/auth');

const cache = new Map();
const CACHE_TTL = {
  today: 5 * 60 * 1000,
  month: 15 * 60 * 1000,
  all: 60 * 60 * 1000
};

router.get('/', authMiddleware, async (req, res) => {
  try {
    const { range = 'today' } = req.query;
    
    const role = req.user?.role;
    const isSuper = role === 'superadmin' || String(role).toUpperCase() === 'SUPER_ADMIN';
    const isAdminManager = String(role).toUpperCase() === 'ADMIN_MANAGER';
    
    let scopeTeamIds = null;
    let scopeHash = 'super';
    
    if (isAdminManager) {
      const admin = await Admin.findById(req.user.id).select('managedTeamIds').lean();
      scopeTeamIds = admin?.managedTeamIds || [];
      scopeHash = scopeTeamIds.length > 0 
        ? `admin_${scopeTeamIds.sort().join('_')}` 
        : `admin_empty`;
    } else if (!isSuper && req.user) {
      scopeHash = `user_${req.user.id}`;
    }
    
    const cacheKey = `team-performance-${range}-${scopeHash}`;
    const cachedItem = cache.get(cacheKey);
    const ttl = CACHE_TTL[range] || CACHE_TTL.today;
    if (cachedItem && Date.now() - cachedItem.timestamp < ttl) {
      return res.json(cachedItem.data);
    }
    
    if (isAdminManager && scopeTeamIds.length === 0) {
      const result = {
        success: true,
        data: [],
        totalTeams: 0,
        totalMembers: 0
      };
      cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return res.json(result);
    }
    
    const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    let startDate, endDate, yesterdayStart, yesterdayEnd, lastMonthStart;
    
    if (range === 'month') {
      const monthStart = new Date(beijingNow);
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      startDate = new Date(monthStart.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
      
      const maxStartDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      if (startDate < maxStartDate) {
        startDate = maxStartDate;
      }
      
      const lastMonth = new Date(beijingNow);
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      lastMonth.setUTCDate(1);
      lastMonth.setUTCHours(0, 0, 0, 0);
      lastMonthStart = new Date(lastMonth.getTime() - 8 * 60 * 60 * 1000);
      if (lastMonthStart < maxStartDate) {
        lastMonthStart = maxStartDate;
      }
    } else {
      const todayStartBeijing = new Date(beijingNow);
      todayStartBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
      
      const yesterdayStartBeijing = new Date(beijingNow);
      yesterdayStartBeijing.setUTCDate(yesterdayStartBeijing.getUTCDate() - 1);
      yesterdayStartBeijing.setUTCHours(0, 0, 0, 0);
      yesterdayStart = new Date(yesterdayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      const yesterdayEndBeijing = new Date(beijingNow);
      yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
      yesterdayEnd = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
    }
    
    const db = mongoose.connection;
    
    let adminQuery = { role: { $in: ['NORMAL_ADMIN', 'GROUP_LEADER'] } };
    let teamGroupQuery = {};
    let teamGroups = [];
    
    if (isAdminManager && scopeTeamIds.length > 0) {
      const scopeTeamIdStrings = scopeTeamIds.map(id => String(id));
      teamGroupQuery = { teamLeaderId: { $in: scopeTeamIdStrings } };
      
      teamGroups = await db.collection('teamgroups').find(teamGroupQuery).toArray();
      const groupIds = teamGroups.map(g => String(g._id));
      const groupNames = teamGroups.map(g => g.groupName).filter(Boolean);
      
      adminQuery = { 
        $or: [
          { _id: { $in: scopeTeamIdStrings }, role: 'NORMAL_ADMIN' },
          { teamGroupId: { $in: groupIds }, role: 'GROUP_LEADER' },
          { groupName: { $in: groupNames }, role: 'GROUP_LEADER' }
        ]
      };
    }
    
    const admins = await db.collection('admins').find(adminQuery).toArray();
    
    if (teamGroups.length === 0) {
      teamGroups = await db.collection('teamgroups').find(teamGroupQuery).toArray();
    }
    
    const teamGroupMap = new Map();
    const groupIdMap = new Map();
    const groupNameMap = new Map();
    teamGroups.forEach(group => {
      const tlId = String(group.teamLeaderId);
      if (!teamGroupMap.has(tlId)) {
        teamGroupMap.set(tlId, []);
      }
      teamGroupMap.get(tlId).push(group);
      
      groupIdMap.set(String(group._id), group);
      if (group.groupName) {
        groupNameMap.set(group.groupName, group);
      }
    });
    
    const teamData = [];
    const allEmployeeIds = new Set();
    
    for (const admin of admins) {
      const adminId = String(admin._id);
      let groups = [];
      
      if (admin.role === 'NORMAL_ADMIN') {
        groups = teamGroupMap.get(adminId) || [];
      } else {
        if (admin.teamGroupId && groupIdMap.has(admin.teamGroupId)) {
          groups = [groupIdMap.get(admin.teamGroupId)];
        } else if (admin.groupName && groupNameMap.has(admin.groupName)) {
          groups = [groupNameMap.get(admin.groupName)];
        }
      }
      
      const groupIds = groups.map(g => String(g._id));
      const groupNames = groups.map(g => g.groupName).filter(Boolean);
      
      let employees;
      if (admin.role === 'NORMAL_ADMIN') {
        employees = await Employee.find({
          $or: [
            { parentId: adminId },
            { teamGroupId: { $in: groupIds } },
            ...groupNames.map(name => ({ groupName: name }))
          ]
        }).select('employeeId').lean();
      } else {
        employees = await Employee.find({
          $or: [
            { teamGroupId: { $in: groupIds } },
            ...groupNames.map(name => ({ groupName: name }))
          ]
        }).select('employeeId').lean();
      }
      
      const employeeIds = employees.map(e => e.employeeId).filter(Boolean);
      employeeIds.forEach(id => allEmployeeIds.add(id));
      
      teamData.push({
        _id: adminId,
        admin: admin,
        employees: employeeIds,
        groups: groups
      });
    }
    
    const allEmpIdsArray = Array.from(allEmployeeIds);
    
    const currentStats = allEmpIdsArray.length > 0 ? await GoldLog.aggregate([
      { $match: { employeeId: { $in: allEmpIdsArray }, createTime: { $gte: startDate, $lt: endDate } } },
      { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' }, totalAds: { $sum: 1 } } }
    ]) : [];
    
    const currentStatsMap = {};
    currentStats.forEach(stat => {
      currentStatsMap[stat._id] = { totalGold: stat.totalGold, totalAds: stat.totalAds };
    });
    
    let compareStats = [];
    if (range === 'today' && yesterdayStart) {
      compareStats = allEmpIdsArray.length > 0 ? await GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmpIdsArray }, createTime: { $gte: yesterdayStart, $lt: yesterdayEnd } } },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' } } }
      ]) : [];
    } else if (range === 'month' && lastMonthStart) {
      compareStats = allEmpIdsArray.length > 0 ? await GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmpIdsArray }, createTime: { $gte: lastMonthStart, $lt: startDate } } },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' } } }
      ]) : [];
    }
    
    const compareStatsMap = {};
    compareStats.forEach(stat => {
      compareStatsMap[stat._id] = stat.totalGold;
    });
    
    const resultData = [];
    let totalMembers = 0;
    
    for (const item of teamData) {
      const { admin, employees } = item;
      
      let totalGold = 0;
      let totalAds = 0;
      let compareGold = 0;
      
      employees.forEach(empId => {
        const stat = currentStatsMap[empId];
        if (stat) {
          totalGold += stat.totalGold;
          totalAds += stat.totalAds;
        }
        const cmp = compareStatsMap[empId];
        if (cmp) {
          compareGold += cmp;
        }
      });
      
      const avgGold = totalAds > 0 ? totalGold / totalAds : 0;
      let growthRate = 0;
      if (compareGold > 0) {
        growthRate = ((totalGold - compareGold) / compareGold) * 100;
      }
      
      totalMembers += employees.length;
      
      resultData.push({
        teamName: admin.teamName || admin.realName || admin.username,
        leaderId: String(admin._id),
        memberCount: employees.length,
        totalAds: totalAds,
        totalRevenue: totalGold / 1000,
        avgGold: parseFloat(avgGold.toFixed(2)),
        growthRate: parseFloat(growthRate.toFixed(2))
      });
    }
    
    resultData.sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    const result = {
      success: true,
      data: resultData,
      totalTeams: resultData.length,
      totalMembers: totalMembers
    };
    
    cache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    res.json(result);
  } catch (error) {
    console.error('获取团队业绩数据错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;