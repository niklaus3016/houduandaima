const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const LoginRecord = require('../models/LoginRecord');
const Employee = require('../models/Employee');
const Admin = require('../models/Admin');
const UserActivity = require('../models/UserActivity');
const TeamGroup = require('../models/TeamGroup');

function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate();
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

function getBeijingStartOfMonth(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const utcMidnight = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

// 获取昨日开始时间（UTC时间）
function getYesterdayStart(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate() - 1;
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

// 获取昨日结束时间（UTC时间）
function getYesterdayEnd(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const day = beijingTime.getUTCDate();
  const utcMidnight = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

// 获取上月开始时间（UTC时间）
function getLastMonthStart(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth() - 1;
  const utcMidnight = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

// 获取上月结束时间（UTC时间）
function getLastMonthEnd(beijingTime) {
  const year = beijingTime.getUTCFullYear();
  const month = beijingTime.getUTCMonth();
  const utcMidnight = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const beijingStartUTC = new Date(utcMidnight.getTime() - 8 * 60 * 60 * 1000);
  return beijingStartUTC;
}

// 获取团队列表
router.get('/list', async (req, res) => {
  try {
    const admins = await Admin.find({ status: 'enabled', role: { $ne: 'superadmin' } });
    
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay(beijingNow);
    const monthStart = getBeijingStartOfMonth(beijingNow);
    const yesterdayStart = getYesterdayStart(beijingNow);
    const yesterdayEnd = getYesterdayEnd(beijingNow);
    const lastMonthStart = getLastMonthStart(beijingNow);
    const lastMonthEnd = getLastMonthEnd(beijingNow);
    
    const teamsWithStats = await Promise.all(admins.map(async (admin) => {
      const employees = await Employee.find({ parentId: admin._id.toString() });
      const employeeIds = employees.map(e => e.employeeId);
      
      const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
      const userIds = userGolds.map(ug => ug.userId);
      
      const todayGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: todayStart }
      });
      const todayAds = todayGoldLogs.length;
      const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
      
      // 计算昨日收益
      const yesterdayGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: yesterdayStart, $lt: yesterdayEnd }
      });
      const yesterdayRevenue = yesterdayGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
      
      // 计算本月收益
      const monthGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: monthStart }
      });
      const monthlyAds = monthGoldLogs.length;
      const monthlyRevenue = monthGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
      
      // 计算上月收益
      const lastMonthGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: lastMonthStart, $lte: lastMonthEnd }
      });
      const lastMonthRevenue = lastMonthGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
      
      // 计算增长率
      const todayGrowth = yesterdayRevenue > 0 
        ? parseFloat((((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100).toFixed(2)) 
        : 0;
      
      const monthGrowth = lastMonthRevenue > 0 
        ? parseFloat((((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(2)) 
        : 0;
      
      const totalGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds }
      });
      const totalAds = totalGoldLogs.length;
      const totalRevenue = totalGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
      
      const totalEcpm = totalGoldLogs.reduce((sum, log) => sum + (log.ecpm || 0), 0);
      const ecpm = totalAds > 0 ? totalEcpm / totalAds : 0;
      
      const todayLoginRecords = await LoginRecord.find({
        employeeId: { $in: employeeIds },
        loginDate: { $gte: todayStart }
      });
      const todayActiveUsers = new Set(todayLoginRecords.map(r => r.employeeId)).size;
      const todayActiveRate = employeeIds.length > 0 
        ? Math.round((todayActiveUsers / employeeIds.length) * 100) + '%' 
        : '0%';
      
      const monthLoginRecords = await LoginRecord.find({
        employeeId: { $in: employeeIds },
        loginDate: { $gte: monthStart }
      });
      const monthActiveUsers = new Set(monthLoginRecords.map(r => r.employeeId)).size;
      const monthlyActiveRate = employeeIds.length > 0 
        ? Math.round((monthActiveUsers / employeeIds.length) * 100) + '%' 
        : '0%';
      
      let level = '新锐';
      if (totalRevenue >= 100000) level = '荣耀';
      else if (totalRevenue >= 50000) level = '王牌';
      else if (totalRevenue >= 10000) level = '精英';
      
      // 获取团队组数
      const groups = await TeamGroup.find({ teamLeaderId: admin._id.toString() });
      const groupCount = groups.length;
      
      return {
        id: admin._id,
        leader: admin.teamName || admin.realName || admin.username,
        memberCount: employeeIds.length,
        groupCount: groupCount,
        todayAds,
        monthlyAds,
        totalAds,
        todayRevenue: parseFloat(todayRevenue.toFixed(2)),
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        todayGrowth: todayGrowth,
        monthGrowth: monthGrowth,
        ecpm: parseFloat(ecpm.toFixed(2)),
        todayActiveRate,
        monthlyActiveRate,
        level
      };
    }));
    
    teamsWithStats.sort((a, b) => b.todayRevenue - a.todayRevenue);
    
    res.json({
      success: true,
      data: teamsWithStats
    });
  } catch (error) {
    console.error('获取团队列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取团队成员详情
router.get('/:teamId/members', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    const admin = await Admin.findById(teamId);
    if (!admin) {
      return res.status(404).json({ success: false, message: '团队不存在' });
    }
    
    const employees = await Employee.find({ parentId: teamId });
    const employeeIds = employees.map(e => e.employeeId);
    
    const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
    
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay(beijingNow);
    const monthStart = getBeijingStartOfMonth(beijingNow);
    
    const members = await Promise.all(employees.map(async (emp) => {
      const userGold = userGolds.find(ug => ug.employeeId === emp.employeeId);
      const userId = userGold ? userGold.userId : '';
      
      const todayGoldLogs = await GoldLog.find({
        userId,
        createTime: { $gte: todayStart }
      });
      const todayWatched = todayGoldLogs.length;
      const todayEarnings = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
      const todayEcpm = todayWatched > 0 
        ? todayGoldLogs.reduce((sum, log) => sum + (log.ecpm || 0), 0) / todayWatched 
        : 0;
      
      const monthGoldLogs = await GoldLog.find({
        userId,
        createTime: { $gte: monthStart }
      });
      const monthlyWatched = monthGoldLogs.length;
      const monthlyEarnings = monthGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
      const monthlyEcpm = monthlyWatched > 0 
        ? monthGoldLogs.reduce((sum, log) => sum + (log.ecpm || 0), 0) / monthlyWatched 
        : 0;
      
      const ipList = await UserActivity.distinct('ip', { userId });
      const deviceList = await UserActivity.distinct('deviceId', { userId });
      
      const todayLogin = await LoginRecord.findOne({
        employeeId: emp.employeeId,
        loginDate: { $gte: todayStart }
      });
      const status = todayLogin ? '在线' : '离线';
      
      return {
        id: emp.employeeId,
        name: emp.realName || emp.name || `用户${emp.employeeId}`,
        todayWatched,
        monthlyWatched,
        todayEarnings: parseFloat(todayEarnings.toFixed(2)),
        monthlyEarnings: parseFloat(monthlyEarnings.toFixed(2)),
        todayEcpm: parseFloat(todayEcpm.toFixed(2)),
        monthlyEcpm: parseFloat(monthlyEcpm.toFixed(2)),
        ipCount: ipList.length,
        deviceCount: deviceList.length,
        status
      };
    }));
    
    res.json({
      success: true,
      members
    });
  } catch (error) {
    console.error('获取团队成员错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取团队上月累计金币
router.get('/last-month-coins', async (req, res) => {
  try {
    const { team } = req.query;
    
    const beijingNow = getBeijingDate();
    const monthStart = getBeijingStartOfMonth(beijingNow);
    
    let totalLastMonthGold = 0;
    
    if (team) {
      const targetTeam = await Team.findOne({ name: team });
      if (targetTeam) {
        const teamMemberUserIds = targetTeam.members.map(m => m.userId);
        const teamEmployees = await Employee.find({ userId: { $in: teamMemberUserIds } });
        const employeeIds = teamEmployees.map(e => e.employeeId);
        
        const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
        totalLastMonthGold = userGolds.reduce((sum, ug) => sum + (ug.lastMonthGold || 0), 0);
      }
    } else {
      const allUserGolds = await UserGold.find({});
      totalLastMonthGold = allUserGolds.reduce((sum, ug) => sum + (ug.lastMonthGold || 0), 0);
    }
    
    res.json({
      success: true,
      data: {
        totalLastMonthGold: parseFloat(totalLastMonthGold.toFixed(2))
      }
    });
  } catch (error) {
    console.error('获取团队上月金币错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
