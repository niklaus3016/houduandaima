const express = require('express');
const router = express.Router();
const TeamGroup = require('../models/TeamGroup');
const Employee = require('../models/Employee');
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const LoginRecord = require('../models/LoginRecord');
const Admin = require('../models/Admin');
const authMiddleware = require('../middleware/auth');

// 获取北京时间
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

// 获取北京时间的当月第一天（返回北京时间0点）
function getBeijingStartOfMonth() {
  const beijingNow = getBeijingDate();
  const startOfMonth = new Date(beijingNow);
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  return startOfMonth;
}

// 获取昨日开始时间（UTC时间）
function getYesterdayStart() {
  const beijingNow = getBeijingDate();
  const startOfYesterday = new Date(beijingNow);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  startOfYesterday.setHours(0, 0, 0, 0);
  // 转换为UTC时间
  return new Date(startOfYesterday.getTime() - 8 * 60 * 60 * 1000);
}

// 获取昨日结束时间（UTC时间）
function getYesterdayEnd() {
  const beijingNow = getBeijingDate();
  const startOfToday = new Date(beijingNow);
  startOfToday.setHours(0, 0, 0, 0);
  // 转换为UTC时间
  return new Date(startOfToday.getTime() - 8 * 60 * 60 * 1000);
}

// 1. GET /group/list?teamId={teamId}
// 返回团队的小组列表
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const { teamId, teamName } = req.query;
    
    if (!teamId && !teamName) {
      return res.status(400).json({ success: false, message: '缺少teamId或teamName参数' });
    }
    
    let query = {};
    if (teamId) {
      query.teamLeaderId = teamId;
    }
    if (teamName) {
      query.teamName = teamName;
    }
    
    // 权限控制：团队长只能查看自己团队的小组
    if (req.user.role !== 'superadmin') {
      const currentAdmin = await Admin.findById(req.user.id);
      if (currentAdmin && currentAdmin.teamName) {
        query.teamName = currentAdmin.teamName;
      }
    }
    
    const groups = await TeamGroup.find(query);
    
    const todayStart = getBeijingStartOfDay();
    const monthStart = getBeijingStartOfMonth();
    const yesterdayStart = getYesterdayStart();
    const yesterdayEnd = getYesterdayEnd();
    
    const groupsWithStats = await Promise.all(groups.map(async (group) => {
      // 获取小组的员工列表
      const employees = await Employee.find({ teamGroupId: group._id.toString() });
      const employeeIds = employees.map(emp => emp.employeeId);
      
      // 成员总数
      const memberCount = employeeIds.length;
      
      // 今日活跃人数
      const todayLoginRecords = await LoginRecord.find({
        employeeId: { $in: employeeIds },
        loginDate: { $gte: todayStart }
      });
      const todayActive = new Set(todayLoginRecords.map(r => r.employeeId)).size;
      
      // 今日收益
      const todayGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: todayStart }
      });
      const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      
      // 本月收益
      const monthGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: monthStart }
      });
      const monthlyRevenue = monthGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      
      // 今日广告次数
      const todayAdCount = todayGoldLogs.length;
      
      // 平均ECPM
      const totalGoldLogs = await GoldLog.find({ employeeId: { $in: employeeIds } });
      const totalAds = totalGoldLogs.length;
      const avgEcpm = totalAds > 0 
        ? totalGoldLogs.reduce((sum, log) => sum + (log.ecpm || 0), 0) / totalAds 
        : 0;
      
      // 昨日收益
      const yesterdayGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: yesterdayStart, $lt: yesterdayEnd }
      });
      const yesterdayRevenue = yesterdayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
      
      return {
        id: group._id.toString(),
        name: group.groupName,
        teamId: group.teamLeaderId,
        teamName: group.teamName,
        memberCount: memberCount,
        todayActive: todayActive,
        todayRevenue: parseFloat(todayRevenue.toFixed(2)),
        monthlyRevenue: parseFloat(monthlyRevenue.toFixed(2)),
        todayAdCount: todayAdCount,
        avgEcpm: parseFloat(avgEcpm.toFixed(2)),
        yesterdayRevenue: parseFloat(yesterdayRevenue.toFixed(2))
      };
    }));
    
    res.json({
      success: true,
      data: groupsWithStats
    });
  } catch (error) {
    console.error('获取小组列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;