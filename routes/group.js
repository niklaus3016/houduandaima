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
    
    // 权限控制：团队长只能查看自己团队的小组，高管查看自己管理的团队的小组
    const role = req.user.role;
    const isSuper = role === 'superadmin' || String(role).toUpperCase() === 'SUPER_ADMIN';
    const isAdminManager = String(role).toUpperCase() === 'ADMIN_MANAGER';
    
    if (!isSuper) {
      const currentAdmin = await Admin.findById(req.user.id);
      if (currentAdmin) {
        if (isAdminManager) {
          // 高管：查看自己管理的团队的小组
          const managedIds = currentAdmin.managedTeamIds || [];
          if (managedIds.length === 0) {
            // 高管未分配团队，直接返回空数据
            return res.json({
              success: true,
              groups: [],
              total: 0,
              page: parseInt(page),
              pageSize: parseInt(pageSize)
            });
          }
          query.teamLeaderId = { $in: managedIds };
        } else if (currentAdmin.teamName) {
          // 团队长/组长：只查看自己团队的小组
          query.teamName = currentAdmin.teamName;
        }
      }
    }
    
    const groups = await TeamGroup.find(query);

    const todayStart = getBeijingStartOfDay();
    const monthStart = getBeijingStartOfMonth();
    const yesterdayStart = getYesterdayStart();
    const yesterdayEnd = getYesterdayEnd();

    // 优化：批量查询所有数据，避免 N+1 问题
    // 1. 获取所有组的员工
    const groupIds = groups.map(g => g._id.toString());
    const allEmployees = await Employee.find({ teamGroupId: { $in: groupIds } });

    // 按 teamGroupId 分组员工
    const employeesByGroup = {};
    const allEmployeeIds = [];
    allEmployees.forEach(emp => {
      const groupId = emp.teamGroupId;
      if (!employeesByGroup[groupId]) {
        employeesByGroup[groupId] = [];
      }
      employeesByGroup[groupId].push(emp);
      allEmployeeIds.push(emp.employeeId);
    });

    // 2. 批量查询今日登录记录
    const todayLoginRecords = await LoginRecord.find({
      employeeId: { $in: allEmployeeIds },
      loginDate: { $gte: todayStart }
    });

    // 按 employeeId 分组登录记录
    const loginByEmployee = {};
    todayLoginRecords.forEach(r => {
      loginByEmployee[r.employeeId] = true;
    });

    // 3. 批量查询所有收益数据（今日、本月、昨日）- 使用聚合查询，避免全量拉取到内存
    const [todayStats, monthStats, yesterdayStats, allStats] = await Promise.all([
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, createTime: { $gte: todayStart } } },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, createTime: { $gte: monthStart } } },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds }, createTime: { $gte: yesterdayStart, $lt: yesterdayEnd } } },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
      ]),
      GoldLog.aggregate([
        { $match: { employeeId: { $in: allEmployeeIds } } },
        { $group: { _id: '$employeeId', totalGold: { $sum: '$gold' }, totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } }, count: { $sum: 1 } } }
      ])
    ]);

    // 按 employeeId 分组收益数据（从聚合结果构建）
    const todayRevenueByEmployee = {};
    todayStats.forEach(stats => {
      todayRevenueByEmployee[stats._id] = stats.totalGold;
    });

    const monthRevenueByEmployee = {};
    monthStats.forEach(stats => {
      monthRevenueByEmployee[stats._id] = stats.totalGold;
    });

    const yesterdayRevenueByEmployee = {};
    yesterdayStats.forEach(stats => {
      yesterdayRevenueByEmployee[stats._id] = stats.totalGold;
    });

    // allStats 已经是聚合结果，按 _id 分组
    const allStatsByEmployee = {};
    allStats.forEach(stats => {
      allStatsByEmployee[stats._id] = stats;
    });

    // 4. 组装每个组的数据
    const groupsWithStats = groups.map(group => {
      const employees = employeesByGroup[group._id.toString()] || [];
      const employeeIds = employees.map(emp => emp.employeeId);

      // 成员总数
      const memberCount = employeeIds.length;

      // 今日活跃人数
      let todayActive = 0;
      employeeIds.forEach(eid => {
        if (loginByEmployee[eid]) todayActive++;
      });

      // 今日收益
      let todayRevenue = 0;
      employeeIds.forEach(eid => {
        todayRevenue += todayRevenueByEmployee[eid] || 0;
      });

      // 本月收益
      let monthlyRevenue = 0;
      employeeIds.forEach(eid => {
        monthlyRevenue += monthRevenueByEmployee[eid] || 0;
      });

      // 今日广告次数
      let todayAdCount = 0;
      employeeIds.forEach(eid => {
        todayAdCount += todayGoldLogs.filter(log => log.employeeId === eid).length;
      });

      // 平均ECPM（使用聚合结果）
      let totalEcpm = 0;
      let totalAds = 0;
      employeeIds.forEach(eid => {
        const stats = allStatsByEmployee[eid];
        if (stats) {
          totalEcpm += stats.totalEcpm;
          totalAds += stats.count;
        }
      });
      const avgEcpm = totalAds > 0 ? totalEcpm / totalAds : 0;

      // 昨日收益
      let yesterdayRevenue = 0;
      employeeIds.forEach(eid => {
        yesterdayRevenue += yesterdayRevenueByEmployee[eid] || 0;
      });

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
    });
    
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