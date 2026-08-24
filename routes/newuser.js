const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const Employee = require('../models/Employee');
const Team = require('../models/Team');
const Admin = require('../models/Admin');
const UserActivity = require('../models/UserActivity');
const authMiddleware = require('../middleware/auth');
const { get, set } = require('../utils/cache');

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

// 获取北京时间的当天结束（返回北京时间23:59:59）
function getBeijingEndOfDay() {
  const beijingNow = getBeijingDate();
  const endOfDay = new Date(beijingNow);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay;
}

// 获取北京时间的当天日期字符串（YYYY-MM-DD）
function getBeijingDateString() {
  return getBeijingDate().toISOString().split('T')[0];
}

router.get('/list', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 10 } = req.query;
    const { username } = req.user;
    
    const todayStart = getBeijingStartOfDay();
    const todayEnd = getBeijingEndOfDay();
    
    // 查询注册天数 <= 15 的员工
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    
    // 获取当前管理员信息
    const currentAdmin = await Admin.findOne({ username });
    
    // 构建缓存键
    let cacheKey = `newuser_list_${page}_${pageSize}`;
    if (currentAdmin) {
      const role = String(currentAdmin.role).toUpperCase();
      if (role === 'ADMIN_MANAGER') {
        const managedIds = currentAdmin.managedTeamIds || [];
        cacheKey += `_admin_${managedIds.length > 0 ? managedIds.sort().join('_') : 'empty'}`;
      } else if (role !== 'SUPER_ADMIN') {
        cacheKey += `_user_${currentAdmin._id}`;
      }
    }
    
    const cached = get(cacheKey);
    if (cached) {
      return res.json(cached);
    }
    
    // 构建查询条件
    const query = {
      createdAt: { $gte: fifteenDaysAgo },
      $or: [{ status: 'enabled' }, { status: 1 }, { status: { $exists: false } }]
    };
    
    // 如果不是系统管理员，只显示自己团队的新人
    if (currentAdmin) {
      const role = String(currentAdmin.role).toUpperCase();
      if (role !== 'SUPER_ADMIN') {
        if (role === 'ADMIN_MANAGER') {
          // 高管：显示自己管理的所有团队长及其下属的员工
          const managedIds = currentAdmin.managedTeamIds || [];
          if (managedIds.length === 0) {
            // 高管未分配团队，直接返回空数据
            return res.json({
              success: true,
              todayNewUsers: 0,
              list: [],
              pagination: {
                total: 0,
                page: parseInt(page),
                pageSize: parseInt(pageSize)
              }
            });
          }
          query.$or = [
            { parentId: { $in: managedIds } },
            { teamId: { $in: managedIds } }
          ];
        } else {
          // 团队长/组长：只显示自己团队的员工
          query.parentId = currentAdmin._id;
        }
      }
    }
    
    const total = await Employee.countDocuments(query);
    
    const employees = await Employee.find(query)
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize))
      .sort({ createdAt: -1 });
    
    // 今日新注册用户数
    const todayQuery = {
      createdAt: { $gte: todayStart, $lte: todayEnd },
      $or: [{ status: 'enabled' }, { status: 1 }, { status: { $exists: false } }]
    };
    
    if (currentAdmin) {
      const role = String(currentAdmin.role).toUpperCase();
      if (role !== 'SUPER_ADMIN') {
        if (role === 'ADMIN_MANAGER') {
          const managedIds = currentAdmin.managedTeamIds || [];
          todayQuery.$or = [
            { parentId: { $in: managedIds } },
            { teamId: { $in: managedIds } }
          ];
        } else {
          todayQuery.parentId = currentAdmin._id;
        }
      }
    }
    
    const todayNewUsers = await Employee.countDocuments(todayQuery);
    
    // 获取所有员工号
    const employeeIds = employees.map(e => e.employeeId);
    
    // 查询用户金币记录
    const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
    const userGoldMap = {};
    userGolds.forEach(ug => {
      userGoldMap[ug.employeeId] = ug;
    });
    
    // 查询团队信息
    const teams = await Team.find({});
    const teamMap = {};
    teams.forEach(team => {
      team.members.forEach(member => {
        if (member.userId) {
          teamMap[member.userId] = team.name;
        }
      });
    });
    
    // 查询团队长信息
    const parentIds = [...new Set(employees.map(e => e.parentId).filter(id => id))];
    const admins = await Admin.find({ _id: { $in: parentIds } });
    const adminMap = {};
    admins.forEach(admin => {
      adminMap[admin._id.toString()] = admin;
    });
    
    // 构建返回数据
    const usersWithDetails = await Promise.all(employees.map(async (employee) => {
      const userGold = userGoldMap[employee.employeeId] || {};
      const userId = userGold.userId || '';
      
      // 查询金币记录（使用聚合避免全量拉取）
      const goldStats = await GoldLog.aggregate([
        { $match: { userId } },
        { $group: { _id: null, count: { $sum: 1 }, totalGold: { $sum: '$gold' }, totalEcpm: { $sum: { $ifNull: ['$ecpm', 0] } } } }
      ]);
      const stats = goldStats[0] || { count: 0, totalGold: 0, totalEcpm: 0 };
      const watched = stats.count;
      const earnings = stats.totalGold;
      const ecpm = watched > 0 ? stats.totalEcpm / watched : 0;
      
      // 查询IP和设备数量
      const ipList = await UserActivity.distinct('ip', { userId });
      const deviceList = await UserActivity.distinct('deviceId', { userId });
      
      // 计算注册天数
      const regDays = Math.floor((Date.now() - new Date(employee.createdAt).getTime()) / (1000 * 60 * 60 * 24));
      
      // 获取上级
      let superior = '系统直属';
      if (teamMap[userId]) {
        superior = teamMap[userId];
      } else if (employee.parentId) {
        const parentAdmin = adminMap[employee.parentId];
        if (parentAdmin) {
          superior = parentAdmin.teamName || parentAdmin.realName || parentAdmin.username;
        }
      }
      
      return {
        id: employee._id,
        userId: userId,
        employeeId: employee.employeeId,
        name: employee.realName || `用户${employee.employeeId}`,
        avatar: '',
        watched: watched,
        earnings: parseFloat(earnings.toFixed(2)),
        ipCount: ipList.length,
        deviceCount: deviceList.length,
        ecpm: parseFloat(ecpm.toFixed(2)),
        regDays: regDays,
        superior: superior,
        createdAt: employee.createdAt
      };
    }));
    
    // 过滤数据：如果不是系统管理员，只显示superior匹配的新人
    let filteredUsers = usersWithDetails;
    if (currentAdmin) {
      const role = String(currentAdmin.role).toUpperCase();
      if (role !== 'SUPER_ADMIN') {
        if (role === 'ADMIN_MANAGER') {
          // 高管：已经在数据库查询时过滤了，这里不过滤
        } else {
          // 团队长/组长：只显示superior匹配的员工
          const currentAdminName = currentAdmin.teamName || currentAdmin.realName || currentAdmin.username;
          filteredUsers = usersWithDetails.filter(user => user.superior === currentAdminName);
        }
      }
    }
    
    const result = {
      success: true,
      todayNewUsers: todayNewUsers,
      list: filteredUsers,
      pagination: {
        total: filteredUsers.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    };
    
    // 缓存5分钟
    set(cacheKey, result, 5 * 60 * 1000);
    
    res.json(result);
  } catch (error) {
    console.error('获取新用户列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
