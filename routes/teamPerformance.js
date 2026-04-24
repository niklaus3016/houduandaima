const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const GoldLog = require('../models/GoldLog');
const authMiddleware = require('../middleware/auth');

// 缓存管理
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1小时

// 团队管理接口 - 展示各团队长的业绩数据
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { range = 'today' } = req.query;
    
    // 先查缓存
    const cacheKey = `team-performance-${range}`;
    const cachedItem = cache.get(cacheKey);
    if (cachedItem && Date.now() - cachedItem.timestamp < CACHE_TTL) {
      return res.json(cachedItem.data);
    }
    
    // 获取北京时间
    const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    let startDate, endDate, yesterdayStart, yesterdayEnd, lastMonthStart;
    
    if (range === 'month') {
      // 本月
      const monthStart = new Date(beijingNow);
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      startDate = new Date(monthStart.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
      
      // 上月
      const lastMonth = new Date(beijingNow);
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      lastMonth.setUTCDate(1);
      lastMonth.setUTCHours(0, 0, 0, 0);
      lastMonthStart = new Date(lastMonth.getTime() - 8 * 60 * 60 * 1000);
    } else {
      // 今日
      const todayStartBeijing = new Date(beijingNow);
      todayStartBeijing.setUTCHours(0, 0, 0, 0);
      startDate = new Date(todayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
      
      // 昨日
      const yesterdayStartBeijing = new Date(beijingNow);
      yesterdayStartBeijing.setUTCDate(yesterdayStartBeijing.getUTCDate() - 1);
      yesterdayStartBeijing.setUTCHours(0, 0, 0, 0);
      yesterdayStart = new Date(yesterdayStartBeijing.getTime() - 8 * 60 * 60 * 1000);
      
      const yesterdayEndBeijing = new Date(beijingNow);
      yesterdayEndBeijing.setUTCHours(0, 0, 0, 0);
      yesterdayEnd = new Date(yesterdayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
    }
    
    // 从teamgroups集合获取团队数据
    const db = mongoose.connection;
    const teamGroups = await db.collection('teamgroups').find({}).toArray();
    
    // 按团队名称分组
    const teamsByGroup = {};
    teamGroups.forEach(group => {
      if (!teamsByGroup[group.teamName]) {
        teamsByGroup[group.teamName] = {
          teamName: group.teamName,
          leaderId: group.teamLeaderId,
          groups: []
        };
      }
      teamsByGroup[group.teamName].groups.push(group);
    });
    
    // 获取所有管理员，包括团队长
    const admins = await db.collection('admins').find({}).toArray();
    
    // 为每个管理员添加到团队列表（如果有teamName）
    admins.forEach(admin => {
      if (admin.teamName) {
        if (!teamsByGroup[admin.teamName]) {
          teamsByGroup[admin.teamName] = {
            teamName: admin.teamName,
            leaderId: admin._id.toString(),
            groups: []
          };
        }
      }
    });
    
    // 转换为数组
    let teams = Object.values(teamsByGroup);
    
    // 过滤掉测试团队
    teams = teams.filter(team => {
      const excludedTeams = ['华东团队', '测试团队'];
      return !excludedTeams.includes(team.teamName);
    });
    
    const teamData = [];
    
    // 优化：先收集所有团队的员工ID，一次性查询所有员工
    const allTeamEmployeeIds = new Map();
    const allEmployees = [];
    const allGroupIds = [];
    
    for (const team of teams) {
      const groupIds = team.groups.map(g => g._id.toString());
      allGroupIds.push(...groupIds);
    }
    
    // 一次性查询所有组的员工
    const employeesResult = await Employee.find({
      $or: [
        { teamGroupId: { $in: allGroupIds } },
        { parentId: { $in: teams.map(t => t.leaderId) } }
      ]
    });
    
    // 按团队分组员工
    const employeesByLeaderId = {};
    const employeeSet = new Set();
    
    employeesResult.forEach(emp => {
      // 找到这个员工属于哪个团队
      for (const team of teams) {
        const groupIds = team.groups.map(g => g._id.toString());
        if (emp.parentId === team.leaderId || groupIds.includes(emp.teamGroupId)) {
          if (!employeesByLeaderId[team.leaderId]) {
            employeesByLeaderId[team.leaderId] = [];
          }
          employeesByLeaderId[team.leaderId].push(emp);
          employeeSet.add(emp.employeeId);
          break;
        }
      }
    });
    
    // 构建团队员工ID映射
    teams.forEach(team => {
      const emps = employeesByLeaderId[team.leaderId] || [];
      allTeamEmployeeIds.set(team.leaderId, emps.map(e => e.employeeId));
    });
    
    const allEmployeeIds = Array.from(employeeSet);
    
    // 一次性查询当前时间范围的所有金币记录
    const currentStats = allEmployeeIds.length > 0 ? await GoldLog.aggregate([
      {
        $match: {
          employeeId: { $in: allEmployeeIds },
          createTime: { $gte: startDate, $lt: endDate }
        }
      },
      {
        $group: {
          _id: '$employeeId',
          totalGold: { $sum: '$gold' },
          totalAds: { $sum: 1 }
        }
      }
    ]) : [];
    
    const currentStatsMap = {};
    currentStats.forEach(stat => {
      currentStatsMap[stat._id] = { totalGold: stat.totalGold, totalAds: stat.totalAds };
    });
    
    // 一次性查询对比时间范围的所有金币记录
    let compareStats = [];
    if (range === 'today' && yesterdayStart) {
      compareStats = allEmployeeIds.length > 0 ? await GoldLog.aggregate([
        {
          $match: {
            employeeId: { $in: allEmployeeIds },
            createTime: { $gte: yesterdayStart, $lt: yesterdayEnd }
          }
        },
        {
          $group: {
            _id: '$employeeId',
            totalGold: { $sum: '$gold' }
          }
        }
      ]) : [];
    } else if (range === 'month' && lastMonthStart) {
      compareStats = allEmployeeIds.length > 0 ? await GoldLog.aggregate([
        {
          $match: {
            employeeId: { $in: allEmployeeIds },
            createTime: { $gte: lastMonthStart, $lt: startDate }
          }
        },
        {
          $group: {
            _id: '$employeeId',
            totalGold: { $sum: '$gold' }
          }
        }
      ]) : [];
    }
    
    const compareStatsMap = {};
    compareStats.forEach(stat => {
      compareStatsMap[stat._id] = stat.totalGold;
    });
    
    // 构建团队数据
    for (const team of teams) {
      const memberEmployeeIds = allTeamEmployeeIds.get(team.leaderId) || [];
      
      let totalGold = 0;
      let totalAds = 0;
      let compareGold = 0;
      
      memberEmployeeIds.forEach(empId => {
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
      
      teamData.push({
        teamName: team.teamName,
        leaderId: team.leaderId,
        memberCount: memberEmployeeIds.length,
        totalAds: totalAds,
        totalRevenue: totalGold / 1000,
        avgGold: parseFloat(avgGold.toFixed(2)),
        growthRate: parseFloat(growthRate.toFixed(2))
      });
    }
    
    // 按总收益排序
    teamData.sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    // 计算总计数据
    const totalTeams = teamData.length;
    const totalMembers = teamData.reduce((sum, team) => sum + team.memberCount, 0);
    
    res.json({
      success: true,
      data: teamData,
      totalTeams: totalTeams,
      totalMembers: totalMembers
    });
  } catch (error) {
    console.error('获取团队业绩数据错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;