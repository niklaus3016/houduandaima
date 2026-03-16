const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const Employee = require('../models/Employee');
const Admin = require('../models/Admin');
const UserActivity = require('../models/UserActivity');
const Team = require('../models/Team');

function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay() {
  const beijingNow = getBeijingDate();
  const startOfDay = new Date(beijingNow);
  startOfDay.setHours(0, 0, 0, 0);
  return startOfDay;
}

function getBeijingEndOfDay() {
  const beijingNow = getBeijingDate();
  const endOfDay = new Date(beijingNow);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

function getBeijingDateString() {
  return getBeijingDate().toISOString().split('T')[0];
}

router.get('/list', async (req, res) => {
  try {
    const { page = 1, pageSize = 10, team } = req.query;
    
    const todayStart = getBeijingStartOfDay();
    const todayEnd = getBeijingEndOfDay();
    
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    
    // 获取团队信息（用于团队筛选）
    const teams = await Team.find({});
    const teamMap = {};
    teams.forEach(team => {
      teamMap[team.name] = team;
    });
    
    // 团队筛选
    let teamEmployeeIds = null;
    if (team && teamMap[team]) {
      const teamMemberUserIds = teamMap[team].members.map(m => m.userId);
      const teamEmployees = await Employee.find({ userId: { $in: teamMemberUserIds } });
      teamEmployeeIds = teamEmployees.map(e => e.employeeId);
    }
    
    // 构建基础查询条件
    const baseQuery = {
      createdAt: { $gte: fifteenDaysAgo },
      $or: [{ status: 'enabled' }, { status: 1 }, { status: { $exists: false } }]
    };
    
    // 添加团队筛选条件
    const query = teamEmployeeIds ? { ...baseQuery, employeeId: { $in: teamEmployeeIds } } : baseQuery;
    
    const total = await Employee.countDocuments(query);
    
    const employees = await Employee.find(query)
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize))
      .sort({ createdAt: -1 });
    
    // 今日新增用户查询（也应用团队筛选）
    const todayNewUsersQuery = {
      createdAt: { $gte: todayStart, $lte: todayEnd },
      $or: [{ status: 'enabled' }, { status: 1 }, { status: { $exists: false } }]
    };
    const todayNewUsersFinalQuery = teamEmployeeIds ? { ...todayNewUsersQuery, employeeId: { $in: teamEmployeeIds } } : todayNewUsersQuery;
    const todayNewUsers = await Employee.countDocuments(todayNewUsersFinalQuery);
    
    const employeeIds = employees.map(e => e.employeeId);
    
    const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
    const userGoldMap = {};
    userGolds.forEach(ug => {
      userGoldMap[ug.employeeId] = ug;
    });
    
    const parentIds = [...new Set(employees.map(e => e.parentId).filter(id => id))];
    const admins = await Admin.find({ _id: { $in: parentIds } });
    const adminMap = {};
    admins.forEach(admin => {
      adminMap[admin._id.toString()] = admin;
    });
    
    // 查询今日相关用户的GoldLog（同时通过userId和employeeId查询）
    const allUserIds = userGolds.map(ug => ug.userId).filter(id => id);
    const todayGoldLogsByUserId = await GoldLog.find({
      userId: { $in: allUserIds },
      createTime: { $gte: todayStart }
    });
    const todayGoldLogsByEmpId = await GoldLog.find({
      employeeId: { $in: employeeIds },
      createTime: { $gte: todayStart }
    });

    // 合并并去重
    const todayGoldLogsMap = new Map();
    [...todayGoldLogsByUserId, ...todayGoldLogsByEmpId].forEach(log => {
      todayGoldLogsMap.set(log._id.toString(), log);
    });
    const todayGoldLogs = Array.from(todayGoldLogsMap.values());

    // 构建employeeId到今日goldLogs的映射
    const todayGoldLogMap = {};
    todayGoldLogs.forEach(log => {
      const empId = log.employeeId;
      if (empId) {
        if (!todayGoldLogMap[empId]) {
          todayGoldLogMap[empId] = [];
        }
        todayGoldLogMap[empId].push(log);
      }
    });

    const usersWithDetails = await Promise.all(employees.map(async (employee) => {
      const userGold = userGoldMap[employee.employeeId] || {};
      const userId = userGold.userId || '';

      // 使用employeeId查询今日goldLogs
      const goldLogs = todayGoldLogMap[employee.employeeId] || [];
      const watched = goldLogs.length;
      const earnings = goldLogs.reduce((sum, log) => sum + log.gold, 0);
      const totalEcpm = goldLogs.reduce((sum, log) => sum + (log.ecpm || 0), 0);
      const ecpm = watched > 0 ? totalEcpm / watched : 0;
      
      const ipList = await UserActivity.distinct('ip', { userId });
      const deviceList = await UserActivity.distinct('deviceId', { userId });
      
      const regDays = Math.floor((Date.now() - new Date(employee.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      
      let superior = '系统直属';
      if (employee.parentId) {
        const parentAdmin = adminMap[employee.parentId];
        if (parentAdmin) {
          superior = parentAdmin.teamName || parentAdmin.realName || parentAdmin.username;
        }
      }
      
      return {
        userId: userId,
        employeeId: employee.employeeId,
        name: employee.realName || `用户${employee.employeeId}`,
        watched: watched,
        earnings: earnings,
        ipCount: ipList.length,
        deviceCount: deviceList.length,
        ecpm: parseFloat(ecpm.toFixed(2)),
        regDays: regDays,
        superior: superior
      };
    }));
    
    res.json({
      success: true,
      todayNewUsers: todayNewUsers,
      list: usersWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取新用户列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
