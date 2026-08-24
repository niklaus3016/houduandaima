const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const UserGold = require('../models/UserGold');
const Admin = require('../models/Admin');
const TeamGroup = require('../models/TeamGroup');
const GoldLog = require('../models/GoldLog');
const CommissionHistory = require('../models/CommissionHistory');
const authMiddleware = require('../middleware/auth');
const { cache, CACHE_TTL, get, set, clear } = require('../utils/cache');
const db = require('./dashboard'); // 复用 _getKpiTimeRange / computeNewKpi，保证和数据看板/首页 KPI 口径 100% 一致

const LOCAL_CACHE_TTL = CACHE_TTL.employee_list;

function getCacheKey(teamId) {
  return `employee_list_${teamId}`;
}

function setCache(teamId, data) {
  const cacheKey = getCacheKey(teamId);
  set(cacheKey, data, LOCAL_CACHE_TTL);
}

function getCache(teamId) {
  const cacheKey = getCacheKey(teamId);
  return get(cacheKey);
}

function getBeijingDate(date = new Date()) {
  return new Date(date.getTime() + 8 * 60 * 60 * 1000);
}

function getBeijingStartOfDay(date = new Date()) {
  const beijingDate = getBeijingDate(date);
  const startOfDay = new Date(beijingDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  return new Date(startOfDay.getTime() - 8 * 60 * 60 * 1000);
}

function getBeijingEndOfDay(date = new Date()) {
  const beijingDate = getBeijingDate(date);
  const endOfDay = new Date(beijingDate);
  endOfDay.setUTCHours(23, 59, 59, 999);
  return new Date(endOfDay.getTime() - 8 * 60 * 60 * 1000);
}

function getMonthStart(date = new Date()) {
  const beijingDate = getBeijingDate(date);
  const startOfMonth = new Date(beijingDate.getUTCFullYear(), beijingDate.getUTCMonth(), 1);
  return new Date(startOfMonth.getTime() - 8 * 60 * 60 * 1000);
}

function generateEmployeeId() {
  const luckyNumbers = ['1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999'];
  let employeeId;
  let attempts = 0;
  
  do {
    employeeId = Math.floor(1000 + Math.random() * 9000).toString();
    attempts++;
  } while (luckyNumbers.includes(employeeId) && attempts < 100);
  
  return employeeId;
}

// 创建员工账号
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { parentId, realName, phone, region, teamGroupId, groupName, groupId } = req.body;
    
    if (!realName) {
      return res.status(400).json({ success: false, message: '请填写员工姓名' });
    }
    
    let employeeId;
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 100) {
      employeeId = generateEmployeeId();
      const existingEmployee = await Employee.findOne({ employeeId });
      if (!existingEmployee) {
        isUnique = true;
      }
      attempts++;
    }
    
    if (!isUnique) {
      return res.status(500).json({ success: false, message: '无法生成唯一员工号，请稍后重试' });
    }
    
    const newEmployee = new Employee({
      employeeId,
      parentId: parentId || '',
      realName,
      phone: phone || '',
      region: region || '',
      phoneCount: 0,
      teamGroupId: teamGroupId || groupId || null, // 兼容前端传递的groupId
      groupName: groupName || null,
      status: 'enabled',
      role: 'EMPLOYEE'
    });
    
    await newEmployee.save();
    
    // 自动创建UserGold记录，确保新员工出现在统计接口中
    const userId = `user_${employeeId}_${Date.now()}`;
    const newUserGold = new UserGold({
      userId,
      employeeId,
      currentMonthGold: 0,
      lastMonthGold: 0
    });
    await newUserGold.save();

    // 清除相关缓存
    clear('employee_list_');
    clear('team_leaders_');
    clear('group_leaders_');
    
    res.json({
      success: true,
      message: '创建成功',
      data: {
        _id: newEmployee._id,
        parentId: newEmployee.parentId,
        realName: newEmployee.realName,
        phone: newEmployee.phone,
        region: newEmployee.region,
        employeeId: newEmployee.employeeId,
        role: newEmployee.role,
        status: newEmployee.status,
        teamGroupId: newEmployee.teamGroupId,
        groupName: newEmployee.groupName,
        userId: userId // 返回生成的userId
      }
    });
  } catch (error) {
    console.error('创建员工账号错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取员工账号列表
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const { search, page = 1, pageSize = 10, parentId } = req.query;
    
    let query = {};
    if (search) {
      query.$or = [
        { realName: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    if (parentId) {
      query.parentId = parentId;
    }
    
    const cacheKey = `employee_list_all_${search || 'none'}_${page}_${pageSize}_${parentId || 'none'}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return res.json({
        success: true,
        data: cached.data,
        pagination: cached.pagination
      });
    }
    
    const total = await Employee.countDocuments(query);
    const employees = await Employee.find(query)
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize))
      .sort({ createdAt: -1 });
    
    // 优化：批量查询所有相关的Admin
    const parentIds = [...new Set(employees.map(emp => emp.parentId).filter(id => id))];
    const admins = parentIds.length > 0 ? await Admin.find({ _id: { $in: parentIds } }) : [];
    const adminById = {};
    admins.forEach(admin => {
      adminById[admin._id.toString()] = admin;
    });
    
    const employeesWithDetails = employees.map(emp => {
      let parentName = '系统直属';
      if (emp.parentId) {
        const parent = adminById[emp.parentId.toString()];
        if (parent) {
          parentName = parent.teamName || parent.realName || parent.username;
        }
      }
      
      return {
        _id: emp._id,
        parentId: emp.parentId,
        parentName,
        realName: emp.realName || emp.name || '',
        phone: emp.phone || '',
        region: emp.region || emp.area || '',
        employeeId: emp.employeeId,
        role: emp.role || 'EMPLOYEE',
        status: emp.status,
        phoneCount: emp.phoneCount || 0,
        teamGroupId: emp.teamGroupId || null,
        groupName: emp.groupName || null,
        joinedGroupAt: emp.joinedGroupAt || null,
        csjDeviceLimit: emp.csjDeviceLimit || 0,
        ksDeviceLimit: emp.ksDeviceLimit || 0,
        ylhDeviceLimit: emp.ylhDeviceLimit || 0,
        createdAt: emp.createdAt
      };
    });
    
    const result = {
      data: employeesWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    };
    
    // 缓存结果，10分钟过期
    cache.set(cacheKey, {
      data: result.data,
      pagination: result.pagination,
      timestamp: Date.now()
    });
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('获取员工列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新员工账号
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { parentId, realName, phone, region, employeeId, teamGroupId, groupName, groupId, csjDeviceLimit, ksDeviceLimit, ylhDeviceLimit } = req.body;

    // 权限校验：设备数限制字段仅超管/高管可修改，团队长/组长无权修改
    const callerRole = String(req.user?.role || '').toUpperCase();
    const canModifyDeviceLimit = callerRole === 'SUPERADMIN'
      || callerRole === 'SUPER_ADMIN'
      || callerRole === 'ADMIN_MANAGER';

    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: '员工不存在' });
    }
    
    // 如果要更新员工号，检查是否已被其他员工使用
    if (employeeId && employeeId !== employee.employeeId) {
      const existingEmployee = await Employee.findOne({ 
        employeeId, 
        _id: { $ne: id } 
      });
      if (existingEmployee) {
        return res.status(400).json({ success: false, message: '员工号已被使用' });
      }
      employee.employeeId = employeeId;
    }
    
    if (parentId !== undefined) employee.parentId = parentId;
    if (realName !== undefined) employee.realName = realName;
    if (phone !== undefined) employee.phone = phone;
    if (region !== undefined) employee.region = region;
    
    // 处理组分配，记录入组时间
    const newTeamGroupId = teamGroupId || groupId;
    if (newTeamGroupId && newTeamGroupId !== String(employee.teamGroupId)) {
      // 分配新组或转移组，更新入组时间
      employee.joinedGroupAt = new Date();
      employee.teamGroupId = newTeamGroupId;
    }
    
    if (groupName !== undefined && groupName !== '') employee.groupName = groupName;
    if (req.body.phoneCount !== undefined) employee.phoneCount = req.body.phoneCount;
    // 设备数限制字段仅超管/高管可修改；团队长/组长传该字段将被忽略
    // 前端超管仅展示 csjDeviceLimit 输入框，修改 csj 时自动同步 ks 和 ylh，确保三系统统一生效
    if (canModifyDeviceLimit) {
      if (csjDeviceLimit !== undefined) {
        employee.csjDeviceLimit = csjDeviceLimit;
        employee.ksDeviceLimit = csjDeviceLimit;
        employee.ylhDeviceLimit = csjDeviceLimit;
      } else {
        // 单独传 ks/ylh 的兜底逻辑（预留扩展，当前前端不会传）
        if (ksDeviceLimit !== undefined) {
          employee.ksDeviceLimit = ksDeviceLimit;
        }
        if (ylhDeviceLimit !== undefined) {
          employee.ylhDeviceLimit = ylhDeviceLimit;
        }
      }
    }
    
    employee.updatedAt = new Date();
    await employee.save();

    // 清除相关缓存
    clear('employee_list_');
    clear('team_leaders_');
    clear('group_leaders_');
    
    res.json({
      success: true,
      message: '更新成功',
      data: {
        _id: employee._id,
        parentId: employee.parentId,
        realName: employee.realName,
        phone: employee.phone,
        region: employee.region,
        employeeId: employee.employeeId,
        teamGroupId: employee.teamGroupId,
        groupName: employee.groupName,
        phoneCount: employee.phoneCount || 0,
        csjDeviceLimit: employee.csjDeviceLimit || 0,
        ksDeviceLimit: employee.ksDeviceLimit || 0,
        ylhDeviceLimit: employee.ylhDeviceLimit || 0
      }
    });
  } catch (error) {
    console.error('更新员工账号错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 启用/禁用员工账号
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['enabled', 'disabled'].includes(status)) {
      return res.status(400).json({ success: false, message: '无效的状态值' });
    }
    
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: '员工不存在' });
    }
    
    employee.status = status;
    employee.updatedAt = new Date();
    await employee.save();

    // 清除相关缓存
    clear('employee_list_');
    clear('team_leaders_');
    clear('group_leaders_');
    
    res.json({
      success: true,
      message: '状态更新成功',
      data: {
        _id: employee._id,
        status: employee.status
      }
    });
  } catch (error) {
    console.error('更新员工状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除员工账号
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const employee = await Employee.findByIdAndDelete(id);
    if (!employee) {
      return res.status(404).json({ success: false, message: '员工不存在' });
    }

    // 清除相关缓存
    clear('employee_list_');
    clear('team_leaders_');
    clear('group_leaders_');
    
    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除员工账号错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取团队长列表（用于下拉选择）
router.get('/team-leaders', authMiddleware, async (req, res) => {
  try {
    const role = req.user?.role;
    const isSuper = role === 'superadmin' || String(role).toUpperCase() === 'SUPER_ADMIN';
    const isAdminManager = String(role).toUpperCase() === 'ADMIN_MANAGER';
    
    let scopeTeamIds = null;
    if (isAdminManager) {
      const admin = await Admin.findById(req.user.id).select('managedTeamIds').lean();
      scopeTeamIds = admin?.managedTeamIds || [];
    }
    
    const cacheKey = `team_leaders_list_${isSuper ? 'super' : isAdminManager ? `admin_manager_${scopeTeamIds?.length || 0}` : 'normal'}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return res.json({
        success: true,
        data: cached.data
      });
    }
    
    const query = { status: 'enabled', role: { $in: ['NORMAL_ADMIN', 'NORMAL', 'TEAM_LEADER'] } };
    const hasScope = scopeTeamIds !== null && scopeTeamIds !== undefined;
    if (hasScope) {
      if (scopeTeamIds.length === 0) {
        // 高管未分配团队，直接返回空数据
        return res.json({
          success: true,
          data: []
        });
      }
      query._id = { $in: scopeTeamIds };
    }
    
    const admins = await Admin.find(query)
      .select('_id teamName realName username')
      .sort({ teamName: 1 });
    
    // 优化：批量查询所有团队的成员数量
    const adminIds = admins.map(admin => admin._id);
    const employeeCounts = await Employee.aggregate([
      { $match: { parentId: { $in: adminIds } } },
      { $group: { _id: '$parentId', count: { $sum: 1 } } }
    ]);
    
    const countByAdminId = {};
    employeeCounts.forEach(item => {
      countByAdminId[item._id.toString()] = item.count;
    });
    
    const leaders = admins.map(admin => ({
      _id: admin._id,
      username: admin.username,
      realName: admin.realName || admin.username,
      teamName: admin.teamName || '',
      memberCount: countByAdminId[admin._id.toString()] || 0
    }));
    
    // 缓存结果，10分钟过期
    cache.set(cacheKey, {
      data: leaders,
      timestamp: Date.now()
    });
    
    res.json({
      success: true,
      data: leaders
    });
  } catch (error) {
    console.error('获取团队长列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取团队下组长列表
router.get('/group-leaders', authMiddleware, async (req, res) => {
  try {
    const { teamId, includeEmployees, includeStats, page, pageSize } = req.query;
    
    if (!teamId) {
      return res.status(400).json({ success: false, message: '缺少团队ID参数' });
    }
    
    const groups = await TeamGroup.find({ teamLeaderId: teamId });
    const groupIds = groups.map(g => g._id);
    
    const allEmployees = await Employee.find({ teamGroupId: { $in: groupIds } });
    const employeesByGroup = {};
    allEmployees.forEach(emp => {
      if (!employeesByGroup[emp.teamGroupId]) {
        employeesByGroup[emp.teamGroupId] = [];
      }
      employeesByGroup[emp.teamGroupId].push(emp);
    });
    
    const allEmployeeIds = allEmployees.map(e => e.employeeId);
    
    const now = new Date();
    const todayStart = getBeijingStartOfDay(now);
    const todayEnd = getBeijingEndOfDay(now);
    
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStart = getBeijingStartOfDay(yesterday);
    const yesterdayEnd = getBeijingEndOfDay(yesterday);
    
    const monthStart = getMonthStart(now);
    
    const weekStart = new Date(now);
    const dayOfWeek = weekStart.getUTCDay() || 7;
    const daysToMonday = dayOfWeek - 1;
    weekStart.setDate(weekStart.getDate() - daysToMonday);
    weekStart.setHours(0, 0, 0, 0);
    
    const [todayGoldLogs, yesterdayGoldLogs, monthGoldLogs, weekGoldLogs] = await Promise.all([
      GoldLog.find({ employeeId: { $in: allEmployeeIds }, createTime: { $gte: todayStart, $lte: todayEnd } }),
      GoldLog.find({ employeeId: { $in: allEmployeeIds }, createTime: { $gte: yesterdayStart, $lte: yesterdayEnd } }),
      GoldLog.find({ employeeId: { $in: allEmployeeIds }, createTime: { $gte: monthStart } }),
      GoldLog.find({ employeeId: { $in: allEmployeeIds }, createTime: { $gte: weekStart } })
    ]);
    
    const todayStatsByEmployee = {};
    todayGoldLogs.forEach(log => {
      if (!todayStatsByEmployee[log.employeeId]) {
        todayStatsByEmployee[log.employeeId] = { gold: 0, ecpm: 0, count: 0 };
      }
      todayStatsByEmployee[log.employeeId].gold += log.gold;
      todayStatsByEmployee[log.employeeId].ecpm += log.ecpm || 0;
      todayStatsByEmployee[log.employeeId].count += 1;
    });
    
    const statsByGroup = {};
    groups.forEach(g => {
      const empIds = (employeesByGroup[g._id] || []).map(e => e.employeeId);
      const todayLogs = todayGoldLogs.filter(l => empIds.includes(l.employeeId));
      const yesterdayLogs = yesterdayGoldLogs.filter(l => empIds.includes(l.employeeId));
      const monthLogs = monthGoldLogs.filter(l => empIds.includes(l.employeeId));
      const weekLogs = weekGoldLogs.filter(l => empIds.includes(l.employeeId));
      
      const todayActive = new Set(todayLogs.map(l => l.employeeId)).size;
      const todayRevenue = todayLogs.reduce((sum, l) => sum + l.gold, 0) / 1000;
      const yesterdayRevenue = yesterdayLogs.reduce((sum, l) => sum + l.gold, 0) / 1000;
      const monthlyRevenue = monthLogs.reduce((sum, l) => sum + l.gold, 0) / 1000;
      const weeklyRevenue = weekLogs.reduce((sum, l) => sum + l.gold, 0) / 1000;
      const todayAdCount = todayLogs.length;
      const avgEcpm = todayAdCount > 0 ? todayLogs.reduce((sum, l) => sum + (l.ecpm || 0), 0) / todayAdCount : 0;
      
      statsByGroup[g._id.toString()] = {
        todayActive, todayRevenue, yesterdayRevenue, weeklyRevenue, monthlyRevenue, todayAdCount, avgEcpm
      };
    });
    
    const groupLeaders = groups.map(group => {
      const employees = employeesByGroup[group._id] || [];
      const stats = statsByGroup[group._id.toString()] || {};
      
      return {
        _id: group._id,
        groupId: group._id,
        groupName: group.groupName,
        groupLeaderId: group.groupLeaderId,
        groupLeaderName: group.groupLeaderName,
        commission: group.commission,
        memberCount: group.memberCount || employees.length,
        todayActive: stats.todayActive || 0,
        todayRevenue: parseFloat((stats.todayRevenue || 0).toFixed(2)),
        weeklyRevenue: parseFloat((stats.weeklyRevenue || 0).toFixed(2)),
        monthlyRevenue: parseFloat((stats.monthlyRevenue || 0).toFixed(2)),
        todayAdCount: stats.todayAdCount || 0,
        avgEcpm: parseFloat((stats.avgEcpm || 0).toFixed(2)),
        yesterdayRevenue: parseFloat((stats.yesterdayRevenue || 0).toFixed(2)),
        ...(includeEmployees === 'true' || includeEmployees === true ? {
          employees: employees.map(emp => ({
            _id: emp._id,
            employeeId: emp.employeeId,
            realName: emp.realName,
            phone: emp.phone,
            region: emp.region,
            status: emp.status,
            todayActive: todayStatsByEmployee[emp.employeeId] ? 1 : 0,
            todayRevenue: parseFloat(((todayStatsByEmployee[emp.employeeId]?.gold || 0) / 1000).toFixed(2)),
            todayAdCount: todayStatsByEmployee[emp.employeeId]?.count || 0
          }))
        } : {})
      };
    });
    
    const teamStats = includeStats === 'true' || includeStats === true ? {
      totalGroups: groups.length,
      totalEmployees: allEmployees.length,
      activeEmployees: new Set(todayGoldLogs.map(l => l.employeeId)).size,
      todayRevenue: parseFloat((Object.values(statsByGroup).reduce((sum, s) => sum + (s.todayRevenue || 0), 0)).toFixed(2)),
      weeklyRevenue: parseFloat((Object.values(statsByGroup).reduce((sum, s) => sum + (s.weeklyRevenue || 0), 0)).toFixed(2)),
      monthlyRevenue: parseFloat((Object.values(statsByGroup).reduce((sum, s) => sum + (s.monthlyRevenue || 0), 0)).toFixed(2)),
      groupLeaderRevenue: parseFloat((groups.reduce((sum, g) => {
        const stats = statsByGroup[g._id.toString()];
        return sum + (stats?.todayRevenue || 0) * (g.commission || 0.05);
      }, 0)).toFixed(2))
    } : null;
    
    let result = groupLeaders;
    if (page && pageSize) {
      const pageNum = parseInt(page);
      const size = parseInt(pageSize);
      result = groupLeaders.slice((pageNum - 1) * size, pageNum * size);
    }
    
    res.json({
      success: true,
      data: result,
      ...(teamStats ? { teamStats } : {}),
      pagination: page && pageSize ? {
        total: groupLeaders.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(groupLeaders.length / parseInt(pageSize))
      } : undefined
    });
  } catch (error) {
    console.error('获取团队下组长列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 创建组长（创建组）
router.post('/group-leader/add', authMiddleware, async (req, res) => {
  try {
    const { teamLeaderId, teamName, groupName, commission, groupLeaderId, groupLeaderName } = req.body;
    
    if (!teamLeaderId || !teamName || !groupName) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 检查是否已存在同名组
    const existingGroup = await TeamGroup.findOne({ teamLeaderId, groupName });
    if (existingGroup) {
      return res.status(400).json({ success: false, message: '组名已存在' });
    }
    
    const newGroup = new TeamGroup({
      teamLeaderId,
      teamName,
      groupName,
      groupLeaderId: groupLeaderId || null,
      groupLeaderName: groupLeaderName || null,
      commission: commission || 0.05,
      memberCount: 0
    });
    
    await newGroup.save();
    
    res.json({
      success: true,
      message: '创建成功',
      data: {
        _id: newGroup._id,
        groupId: newGroup._id,
        groupName: newGroup.groupName,
        groupLeaderId: newGroup.groupLeaderId,
        groupLeaderName: newGroup.groupLeaderName,
        commission: newGroup.commission,
        memberCount: newGroup.memberCount
      }
    });
  } catch (error) {
    console.error('创建组长错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新组长（更新组信息）
router.put('/group-leader/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { groupName, commission, groupLeaderId, groupLeaderName, remark } = req.body;

    const group = await TeamGroup.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: '组不存在' });
    }

    // 权限检查：超管可以修改任何组，团队长只能修改自己团队下的组
    if (req.user.role !== 'superadmin') {
      // 非超管，检查是否为该组所属团队的团队长
      const admin = await Admin.findById(req.user.id);
      if (!admin || !admin.teamName || admin._id.toString() !== (group.teamLeaderId ? group.teamLeaderId.toString() : '')) {
        return res.status(403).json({ success: false, message: '权限不足，只能修改自己团队下的组长信息' });
      }
    }

    // 检查组名是否重复
    if (groupName && groupName !== group.groupName) {
      const existingGroup = await TeamGroup.findOne({
        teamLeaderId: group.teamLeaderId,
        groupName,
        _id: { $ne: id }
      });
      if (existingGroup) {
        return res.status(400).json({ success: false, message: '组名已存在' });
      }
      group.groupName = groupName;
    }

    // === 变更：比例改动记录 CommissionHistory + 清缓存 ===
    const oldCommission = +group.commission || 0;
    let commissionChanged = false;
    if (commission !== undefined && +commission !== oldCommission) {
      const newRate = +commission;
      group.commission = newRate;
      commissionChanged = true;
    }
    if (groupLeaderId !== undefined) group.groupLeaderId = groupLeaderId;
    // 禁止修改groupLeaderName，保持团队长设置的姓名

    await group.save();

    // 【A】有比例变动：写历史日志 + 清所有关联缓存
    if (commissionChanged) {
      try {
        const operator = await Admin.findById(req.user.id).select('username realName').lean();
        await CommissionHistory.create({
          teamGroupId: group._id,
          groupName: group.groupName || '',
          oldCommission,
          newCommission: +commission,
          operatorId: req.user.id,
          operatorName: operator?.realName || operator?.username || '',
          changeTime: new Date(),
          remark: typeof remark === 'string' ? remark.trim() : (typeof req.body.reason === 'string' ? req.body.reason.trim() : '')
        });
      } catch (_) { /* 日志写失败不影响主流程 */ console.warn('CommissionHistory write failed:', _); }
      // 清关联缓存：组长端三接口 + 团队长端业绩汇总
      clear('group-leader-commission-stats-');
      clear('group-leader-stats-');
      clear('group-leader-performance-');
      clear('team-leader-performance-');
      clear('admin-dashboard-');
      clear('dashboard-');
    }

    res.json({
      success: true,
      message: commissionChanged ? `提成比例已更新：${(oldCommission*100).toFixed(0)}% → ${(+commission*100).toFixed(0)}%，仅影响之后产生的业绩，过往业绩提成按当时比例结算` : '更新成功',
      data: {
        _id: group._id,
        groupId: group._id,
        groupName: group.groupName,
        groupLeaderId: group.groupLeaderId,
        groupLeaderName: group.groupLeaderName,
        commission: group.commission,
        memberCount: group.memberCount
      }
    });
  } catch (error) {
    console.error('更新组长错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除组长（删除组）
router.delete('/group-leader/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 检查是否有员工属于该组
    const employees = await Employee.find({ teamGroupId: id });
    if (employees.length > 0) {
      return res.status(400).json({ success: false, message: '该组下还有员工，无法删除' });
    }
    
    const group = await TeamGroup.findByIdAndDelete(id);
    if (!group) {
      return res.status(404).json({ success: false, message: '组不存在' });
    }
    
    res.json({
      success: true,
      message: '删除成功'
    });
  } catch (error) {
    console.error('删除组长错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 组长帐号列表接口 - 简化版
router.get('/group-leaders-simple', authMiddleware, async (req, res) => {
  try {
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, message: '缺少团队ID参数' });
    }

    const groups = await TeamGroup.find({ teamLeaderId: teamId });
    const groupIds = groups.map(g => g._id);

    const employees = await Employee.find({ teamGroupId: { $in: groupIds } });
    const employeeCountByGroup = {};
    employees.forEach(emp => {
      if (emp.teamGroupId) {
        employeeCountByGroup[emp.teamGroupId] = (employeeCountByGroup[emp.teamGroupId] || 0) + 1;
      }
    });

    const groupLeaderAdmins = await Admin.find({
      teamGroupId: { $in: groupIds },
      role: 'GROUP_LEADER'
    });

    const adminByGroupId = {};
    groupLeaderAdmins.forEach(admin => {
      if (admin.teamGroupId) {
        adminByGroupId[admin.teamGroupId.toString()] = admin;
      }
    });

    const result = groups.map(group => {
      const admin = adminByGroupId[group._id.toString()];
      const isOpened = admin && group.groupLeaderId;
      return {
        _id: admin ? admin._id.toString() : group._id.toString(),
        username: isOpened ? admin.username : '',
        realName: group.groupLeaderName || '',
        role: 'GROUP_LEADER',
        status: isOpened ? admin.status : 'disabled',
        groupName: group.groupName,
        commission: group.commission || 0.05,
        memberCount: employeeCountByGroup[group._id.toString()] || 0
      };
    });

    res.json({
      success: true,
      message: '获取组长列表成功',
      data: result
    });
  } catch (error) {
    console.error('获取组长列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});



// ================================================================
// 🌿 v2 团队长组情况接口（GET /admin/employee/team-leader/groups）
//   🔁 复用 dashboard.js 的口径：「3OR 组归属」+「递归下属 TL」+「直推 D 员工虚拟组」
//      保证和 /users /admin/dashboard/kpi /users 数据 100% 一致，不再出第二套口径
//
//   🔑 三类组（cuiding 视角示例）：
//     ① 直属直推 D 员工（parentId == cuiding._id，没有归属到任一组）→ 虚拟组「直推成员」
//     ② 本 TL 名下组长组（TeamGroup.teamLeaderId == cuiding._id，lixiang/xukeke 等 GL）
//     ③ 下属 TL 名下所有内容：
//       ③-a 下属 TL 本人的直推 D（parentId == fanjie._id）→ 虚拟组「fanjie 团队-直推成员」
//       ③-b 下属 TL 名下组长组（TeamGroup.teamLeaderId == fanjie._id）
// ================================================================
// ================================================================
// 🌿 v2 团队长组情况接口（GET /admin/employee/team-leader/groups）
//   🔁 复用 dashboard.js 的口径：「3OR 组归属」+「递归下属 TL」+「直推 D 员工虚拟组」
//      保证和 /users /admin/dashboard/kpi /users 数据 100% 一致，不再出第二套口径
//
//   🔑 三类组（cuiding 视角示例）：
//     ① 直属直推 D 员工（parentId == cuiding._id，没有归属到任一组）→ 虚拟组「直推成员」
//     ② 本 TL 名下组长组（TeamGroup.teamLeaderId == cuiding._id，lixiang/xukeke 等 GL）
//     ③ 下属 TL 名下所有内容：
//       ③-a 下属 TL 本人的直推 D（parentId == fanjie._id）→ 虚拟组「fanjie 团队-直推成员」
//       ③-b 下属 TL 名下组长组（TeamGroup.teamLeaderId == fanjie._id）
// ================================================================
async function _teamLeaderGroupsHandler(req, res) {
  try {
    const { teamId, range = 'today' } = req.query;
    if (!teamId) return res.status(400).json({ success: false, message: '缺少团队ID参数' });
    const callerId = String(req.user?.id || '');
    const callerRole = (req.user?.role || '').toString().trim().toUpperCase();
    const isSuperAdmin = /SUPER/i.test(callerRole);
    const isTL = /NORMAL|TEAM[_ -]?LEADER/i.test(callerRole) || /NORMAL_ADMIN/i.test(callerRole);

    // ---------- 权限 & 目标 TL 校验 ----------
    let targetTL = null;
    try { targetTL = await Admin.findById(mongoose.Types.ObjectId.isValid(teamId) ? new mongoose.Types.ObjectId(teamId) : teamId).select('_id username realName role teamName teamGroupId commission parentTlId manualLevel manualLevelSetAt').lean(); } catch(_){ targetTL = null; }
    if (!targetTL) return res.status(400).json({ success: false, message: '目标团队不存在或 teamId 无效' });
    const targetRole = (targetTL.role || '').toString().trim();
    const targetIsTL = /NORMAL_ADMIN|NORMAL|TEAM[_ -]?LEADER/i.test(targetRole);
    if (!targetIsTL) return res.status(400).json({ success: false, message: '目标团队(teamId)必须是团队长(NORMAL_ADMIN)账号' });
    if (!isSuperAdmin) {
      if (!isTL) return res.status(403).json({ success: false, message: '权限不足：只有团队长或超管可以查看团队组情况' });
      if (String(callerId) !== teamId && String(callerId) !== String(targetTL._id)) {
        // 允许：调用者是目标 TL 的「上级链条上的 TL」(递归)
        const alloweds = new Set([callerId, String(callerId)]);
        let frontier = [callerId];
        while (frontier.length) {
          const subs = await Admin.find({ parentTlId: { $in: frontier }, role: /NORMAL_ADMIN|normal_admin/i }).select('_id').lean();
          if (!subs.length) break;
          for (const s of subs) alloweds.add(String(s._id));
          frontier = subs.map(s => String(s._id));
        }
        if (!alloweds.has(String(targetTL._id))) return res.status(403).json({ success: false, message: '权限不足：只能查看自己团队或下属团队' });
      }
    }

    // 缓存键（版本 v4_B4_20260713：职级改为优先读业绩页真实档位（全战队总业绩算档），不再仅靠 Admin.commission 反推签约档，强制失效旧B3缓存）
    const cacheKey = `team_leader_groups_v4_B4_${String(targetTL._id)}_${range}`;
    try {
      const cached = (typeof get === 'function') ? get(cacheKey) : null;
      if (cached && cached.timestamp && Date.now() - cached.timestamp < (CACHE_TTL?.dashboard || 300000)) {
        return res.json({ success: true, message: '获取团队组列表成功(缓存v3)', ...cached.data, fromCache: true });
      }
    } catch(_){}

    // ---------- 时间范围：严格复用 dashboard.js _getKpiTimeRange，杜绝再出第二套时区口径 ----------
    //   ✅ 今天范围 = 北京 00:00:00 ~ 北京 当前时刻 = UTC start=昨日16:00, end=UTC now
    //   ✅ 本月范围 = 北京1号 00:00 ~ 北京 当前时刻
    //   ✅ prev 窗口（同范围的上一期）也一起返回，统一和首页 KPI / 团队数据看板 100% 对齐
    const winNow   = db._getKpiTimeRange(range || 'today');
    const winMonth = db._getKpiTimeRange('month');
    const S       = winNow.start;
    const E       = winNow.end;
    const S_prev  = winNow.prevStart;
    const E_prev  = winNow.prevEnd;
    const S_month = winMonth.start;

    // ---------- 🌿 口径A：TL 直属一级 ONLY（和首页 KPI 2级封 100% 对齐，不再递归下属TL全链条）----------
    //   targetTL本人 + 「直属一级下属TL：parentTlId == targetTL._id 的 NORMAL_ADMIN」
    //   未来 fanjie 下如果有下属TL「李四」/ 组长群「张三代理群」：
    //     → cuiding 视角不显示（要查看需通过代理查看传 teamId=lisi / zhangSanGroup）
    //     → 但 fanjie 本人视角会显示（因为 fanjie 自己的 targetTL 直属一级包含）
    const ALL_TLS = new Map(); // id → Admin(lean)
    function addTL(t) { ALL_TLS.set(String(t._id), t); }
    addTL(targetTL);
    // 只取直属一级（不复用 while 递归）
    const directSubTLs = await Admin.find({
      parentTlId: [String(targetTL._id), mongoose.Types.ObjectId.isValid(String(targetTL._id)) ? new mongoose.Types.ObjectId(String(targetTL._id)) : String(targetTL._id)],
      role: /NORMAL_ADMIN|normal_admin/i
    }).select('_id username realName role teamName teamGroupId commission parentTlId manualLevel manualLevelSetAt').lean();
    directSubTLs.forEach(addTL);
    const TL_IDS = [...ALL_TLS.keys()]; // 目标本人 + 直属一级下属 TL（cuiding场景 = [cuiId, fanId] → 2 人）

    // ---------- 组列表：TeamGroup 严格按口径A过滤 ----------
    //   ① targetTL 本人名下的所有 TG（cuiding 自己7个组长群）→ 全部保留
    //   ② 直属下属TL名下的 TG：必须满足 groupLeaderId == 该TL._id（代表是TL本人的直推集合TG，如 fanjie 的「洁然如初代理」groupLeaderId=fanjie._id）
    //       → 未来 fanjie 新发展的组长群「张三代理群」groupLeaderId=zhangsan≠fanjie._id → 自动排除，避免和KPI间推2级封不一致
    const rawTGs = await TeamGroup.find({ teamLeaderId: { $in: TL_IDS.concat(TL_IDS.map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id)) } })
      .select('_id teamLeaderId teamName groupName groupLeaderId groupLeaderName commission memberCount createdAt').lean();
    const TGs = rawTGs.filter(tg => {
      const tgTLId = String(tg.teamLeaderId);
      // 情况①：TG.teamLeaderId == targetTL._id 本人 → 全保留
      if (tgTLId === String(targetTL._id)) return true;
      // 情况②：TG.teamLeaderId 是 直属下属TL（非本人）→ 只取 groupLeaderId == TL._id 自己的那一条（TL本人的直推集合TG）
      const subTL = ALL_TLS.get(tgTLId);
      if (!subTL) return false;
      return tg.groupLeaderId && String(tg.groupLeaderId) === String(subTL._id);
    });
    const TGs_mine = TGs.filter(g => String(g.teamLeaderId) === String(targetTL._id)); // TL本人名下 GL 组
    const TGs_sub = TGs.filter(g => String(g.teamLeaderId) !== String(targetTL._id)); // 直属下属TL名下的 TG（TL本人直推集合TG）

    // ---------- 🌿 职级映射构建（groupLeaderLevel / groupLeaderLevelManual）----------
    //   ✅ 轻量方案：不复用 GoldLog 重算，直接用 Admin.commission 反推（晋升/手动调档同步更新，100%一致）
    //   ✅ 手动档：Admin.manualLevel 有值且合法档位 → true
    //   - TL(NORMAL_ADMIN): commission 0.08→P2, 0.10→P3, 0.12→P4, 0.14→P5, 0.16→P6, 0.18→P7, 0.20→P8
    //   - GL(GROUP_LEADER): commission 0.06 → P1
    const TL_COMMISSION_TO_LEVEL = { '0.08':'P2','0.10':'P3','0.12':'P4','0.14':'P5','0.16':'P6','0.18':'P7','0.20':'P8' };
    const TL_VALID_LEVELS = new Set(['P2','P3','P4','P5','P6','P7','P8']);
    const GL_VALID_LEVELS = new Set(['P1']);
    // 收集需要查职级的 groupLeaderAdminIds：① TL_IDS（虚拟组负责人）② 所有TG的 groupLeaderId（GL组长）
    const _glIdsRaw = TGs.map(g => g.groupLeaderId).filter(Boolean).map(id => String(id));
    const _allLeaderIdsSet = new Set([...TL_IDS, ..._glIdsRaw]);
    const _allLeaderIds = [..._allLeaderIdsSet];
    // TL 已有 ALL_TLS，缺的只有 GL 组长的 Admin 记录
    const _missingGLIds = _allLeaderIds.filter(id => !ALL_TLS.has(id));
    // 把 _id 的字符串和 ObjectId 两种形式都放入 $in 数组，兼容老存储
    const _idArr = [];
    for (const id of _missingGLIds) {
      _idArr.push(id);
      if (mongoose.Types.ObjectId.isValid(id)) _idArr.push(new mongoose.Types.ObjectId(id));
    }
    const _glAdmins = (_missingGLIds.length && _idArr.length) ? await Admin.find({
      _id: { $in: _idArr }
    }).select('_id username role commission manualLevel manualLevelSetAt').lean() : [];
    // 合并 ALL_TLS(TL) + _glAdmins(GL) → leaderAdminMap: id -> Admin(lean)
    const leaderAdminMap = new Map();
    for (const [id, tl] of ALL_TLS.entries()) leaderAdminMap.set(id, tl);
    for (const a of _glAdmins) leaderAdminMap.set(String(a._id), a);

    // ✅ 预取每个管理者的真实职级（100% 对齐该管理者自己的业绩页）
    //   策略：TL 调 verification.getTeamLeaderPerformance → data.level.currentLevel/currentCommission/manualLevel
    //        GL 调 verification.getGroupLeaderPerformance → 同上
    //   失败兜底：退化到下面的 Admin.manualLevel → commission 反推（保持最小可用性）
    //   TL_VALID_LEVELS / GL_VALID_LEVELS 已在函数顶部 796+ 行声明
    let verification = null;
    try { verification = require('./verification'); } catch (_) { verification = null; }
    const perfLvMap = new Map(); // adminId → { level, manual, fromPerf }
    if (verification && (typeof verification.getTeamLeaderPerformance === 'function' ||
                         typeof verification.getGroupLeaderPerformance === 'function')) {
      const PERF_CONCURRENCY = 3;
      for (let i = 0; i < _allLeaderIds.length; i += PERF_CONCURRENCY) {
        const slice = _allLeaderIds.slice(i, i + PERF_CONCURRENCY);
        await Promise.all(slice.map(async (id) => {
          const a = leaderAdminMap.get(id);
          if (!a) return;
          const role = (a.role || '').toString().toUpperCase().trim();
          const isTL = /NORMAL_ADMIN|NORMAL|TEAM/.test(role);
          const isGL = /GROUP_LEADER/.test(role);
          if (!isTL && !isGL) return;
          try {
            let lv = null;
            if (isTL && typeof verification.getTeamLeaderPerformance === 'function') {
              const r = await verification.getTeamLeaderPerformance(id, { monthCount: 1 });
              lv = r?.data?.level || null;
            } else if (isGL && typeof verification.getGroupLeaderPerformance === 'function') {
              const r = await verification.getGroupLeaderPerformance(id, { monthCount: 1 });
              lv = r?.data?.level || null;
            }
            const lvCode = lv?.currentLevel;
            const valid =
              (isTL && TL_VALID_LEVELS.has(String(lvCode || '').toUpperCase())) ||
              (isGL && GL_VALID_LEVELS.has(String(lvCode || '').toUpperCase()));
            if (valid) {
              perfLvMap.set(id, {
                level: String(lvCode).toUpperCase(),
                manual: lv.manualLevel != null,
                fromPerf: true
              });
            }
          } catch (_e) { /* 取不到就 fallback */ }
        }));
      }
    }

    // 构建 levelMap: id -> { level: 'Px', manual: boolean }
    //   优先级：1) 业绩页真实档位（perfLvMap 命中）；2) Admin.manualLevel（合法时手动档）；3) commission 反推签约档
    const groupLeaderLevelMap = new Map();
    for (const id of _allLeaderIds) {
      const a = leaderAdminMap.get(id);
      if (!a) { groupLeaderLevelMap.set(id, { level: null, manual: false }); continue; }

      // ① 优先用业绩页真实档位（全战队总业绩算档，不是签约档）
      const perf = perfLvMap.get(id);
      if (perf) {
        groupLeaderLevelMap.set(id, { level: perf.level, manual: perf.manual });
        continue;
      }

      // ② 兜底：签约档反推 + manualLevel 手动覆盖
      const role = (a.role || '').toString().toUpperCase().trim();
      const comm = +(a.commission || 0);
      const commKey = comm.toFixed(2);
      let level = null;
      if (/GROUP_LEADER/.test(role)) {
        // 组长：只有 P1
        level = 'P1';
      } else if (/NORMAL_ADMIN|NORMAL|TEAM/.test(role)) {
        // 团队长：按 commission 映射
        level = TL_COMMISSION_TO_LEVEL[commKey] || null;
        // 兜底：没有命中时用 TL.commission 的范围就近判断
        if (!level) {
          if (comm >= 0.195) level = 'P8';
          else if (comm >= 0.175) level = 'P7';
          else if (comm >= 0.155) level = 'P6';
          else if (comm >= 0.135) level = 'P5';
          else if (comm >= 0.115) level = 'P4';
          else if (comm >= 0.095) level = 'P3';
          else if (comm >= 0.075) level = 'P2';
        }
      }
      // 手动档判断
      let manual = false;
      if (a.manualLevel) {
        const ml = String(a.manualLevel).trim().toUpperCase();
        if ((/GROUP_LEADER/.test(role) && GL_VALID_LEVELS.has(ml)) ||
            (/NORMAL_ADMIN|NORMAL|TEAM/.test(role) && TL_VALID_LEVELS.has(ml))) {
          manual = true;
          // 手动档优先：有合法手动档 → level 直接取手动档
          level = ml;
        }
      }
      groupLeaderLevelMap.set(id, { level, manual });
    }

    // 升级缓存版本号：B3(commission反推) → B4(业绩页真实档位优先)
    const _oldCacheKey = `team_leader_groups_v4_B3_${String(targetTL._id)}_${range}`;

    // ---------- 员工集合归属（3OR 规则 + 直推 D）----------
    // ① 先把「TLs 能管到的所有在册员工」拿出来，和 /users 一致
    // 2a 每个 TL 直属直推 D：Employee.parentId == TL._id (Admin._id)
    const allDirectD_emp = await Employee.find({ parentId: { $in: TL_IDS.concat(TL_IDS.map(id => mongoose.Types.ObjectId.isValid(id)? new mongoose.Types.ObjectId(id): id)) } })
      .select('_id employeeId userId realName parentId groupName teamGroupId').lean();
    // 2b 组长组内员工（3OR：Employee.teamGroupId == TG._id，Employee.groupName == TG.groupName + teamLeaderId match，Employee.parentId == TG.groupLeaderId）
    const TG_IDS_STR = TGs.map(g => String(g._id));
    const TG_GL_IDS_STR = TGs.map(g => g.groupLeaderId).filter(Boolean).map(id => String(id));
    const TG_NAMES = [...new Set(TGs.map(g=>g.groupName).filter(Boolean))];
    const allGL_emp = await Employee.find({
      $or: [
        { teamGroupId: { $in: TG_IDS_STR.concat(TGs.map(g=>mongoose.Types.ObjectId.isValid(g._id)? new mongoose.Types.ObjectId(g._id):g._id)) } },
        { parentId:    { $in: TG_GL_IDS_STR.concat(TG_GL_IDS_STR.map(id => mongoose.Types.ObjectId.isValid(id)? new mongoose.Types.ObjectId(id): id)) } },
        ...(TG_NAMES.length? [{ groupName: { $in: TG_NAMES } }]: [])
      ]
    }).select('_id employeeId userId realName parentId groupName teamGroupId').lean();

    // 打归属 tag，每个员工唯一归到 1 个组：
    // 优先级 A：Employee.teamGroupId 命中某 TG → 归该 TG
    // 优先级 B：Employee.groupName 命中某 TG.groupName 且 teamLeaderId 属于 ALL_TLS → 归该 TG（若同 groupName 多个 TL → 取 teamLeaderId 和 Employee.parentId/teamGroupId 匹配的那个，否则取第一个）
    // 优先级 C：Employee.parentId 命中某 GL.adminId → 归该 GL 的组（唯一组）
    // 优先级 D：都没命中，但 Employee.parentId 命中某 TL._id → 归该 TL 的「直推虚拟组」
    // 否则忽略（不属于目标 TL 链）
    const TG_byID = new Map(TGs.map(g => [String(g._id), g]));
    const TG_byGL = new Map(TGs.filter(g=>g.groupLeaderId).map(g => [String(g.groupLeaderId), g]));
    const groupName_to_TGs = new Map(); // groupName -> TG[]
    for (const g of TGs) { const k = g.groupName; if (!k) continue; if (!groupName_to_TGs.has(k)) groupName_to_TGs.set(k,[]); groupName_to_TGs.get(k).push(g); }

    const groupsAgg = new Map(); // key=组唯一键(virtual+teamId or TG._id) -> { TG/tl, emps:Set(empId) }
    function ensureGroupVirtual(tlId) {
      const k = 'VIR_' + String(tlId);
      if (!groupsAgg.has(k)) {
        const tl = ALL_TLS.get(String(tlId));
        groupsAgg.set(k, { kind:'virtual', tl, emps: new Set() });
      }
      return k;
    }
    function ensureGroupTG(tgId) {
      const k = 'TG_' + String(tgId);
      if (!groupsAgg.has(k)) {
        const tg = TG_byID.get(String(tgId));
        groupsAgg.set(k, { kind:'tg', tg, emps: new Set() });
      }
      return k;
    }
    function assignEmp(emp, k) { const g = groupsAgg.get(k); if (g) g.emps.add(String(emp.employeeId)); return !!g; }

    const allEmps = allDirectD_emp.concat(allGL_emp);
    const seen = new Set();
    for (const emp of allEmps) {
      const key = String(emp._id);
      if (seen.has(key)) continue;
      seen.add(key);
      const eTG = emp.teamGroupId ? TG_byID.get(String(emp.teamGroupId)) : null;
      let done = false;
      if (eTG) { if (TG_IDS_STR.includes(String(eTG._id))) { assignEmp(emp, ensureGroupTG(eTG._id)); done=true; } }
      if (!done && emp.groupName) {
        const cand = groupName_to_TGs.get(emp.groupName) || [];
        let hit = cand.find(g => String(g.teamLeaderId) === String(eTG?.teamLeaderId || '') || String(g._id) === String(eTG?._id) || TL_IDS.includes(String(g.teamLeaderId)));
        if (!hit) hit = cand[0];
        if (hit) { assignEmp(emp, ensureGroupTG(hit._id)); done = true; }
      }
      if (!done && emp.parentId) {
        const tg = TG_byGL.get(String(emp.parentId));
        if (tg) { assignEmp(emp, ensureGroupTG(tg._id)); done = true; }
      }
      if (!done && emp.parentId && TL_IDS.includes(String(emp.parentId))) {
        assignEmp(emp, ensureGroupVirtual(emp.parentId)); done = true;
      }
      // 没命中的 drop（不在目标 TL 管辖范围）
    }

    // 所有员工 empIds：GoldLog 查一次（当前窗口 + prev 窗口 + 本月窗口 3 套）
    const allEmpIds = [...groupsAgg.values()].flatMap(v => [...v.emps]);
    const EMP_SET = new Set(allEmpIds);
    const EMP_IDS_EQ = allEmpIds.length ? { $in: allEmpIds } : { $in: ['__no_one__'] };
    const aggCur = EMP_SET.size ? await GoldLog.aggregate([
      { $match: { employeeId: EMP_IDS_EQ, createTime: { $gte: S, $lt: E } } },
      { $group: { _id: '$employeeId', g: { $sum: '$gold' }, ads: { $sum: 1 } } }
    ]).allowDiskUse(true) : [];
    const aggPrev = EMP_SET.size ? await GoldLog.aggregate([
      { $match: { employeeId: EMP_IDS_EQ, createTime: { $gte: S_prev, $lt: E_prev } } },
      { $group: { _id: '$employeeId', g: { $sum: '$gold' } } }
    ]).allowDiskUse(true) : [];
    const aggMonth = EMP_SET.size ? await GoldLog.aggregate([
      { $match: { employeeId: EMP_IDS_EQ, createTime: { $gte: S_month, $lt: new Date() } } },
      { $group: { _id: '$employeeId', g: { $sum: '$gold' } } }
    ]).allowDiskUse(true) : [];
    const curMap = new Map(aggCur.map(x=>[String(x._id),{g:+x.g||0,ads:+x.ads||0}]));
    const prevMap = new Map(aggPrev.map(x=>[String(x._id),+x.g||0]));
    const mMap = new Map(aggMonth.map(x=>[String(x._id),+x.g||0]));
    // 今日活跃员工 = 当前窗口有 goldlog 或 useractivity
    const activeSet = new Set(aggCur.map(x => String(x._id)));
    try {
      const UserActivity = mongoose.models.UserActivity || require('../models/UserActivity');
      if (UserActivity && EMP_SET.size) {
        const acts = await UserActivity.find({ employeeId: EMP_IDS_EQ, date: { $gte: S, $lt: E } }).select('employeeId').lean();
        acts.forEach(a => a.employeeId && activeSet.add(String(a.employeeId)));
      }
    } catch(_){}

    // ---------- 组装 groups 列表 ----------
    const result = [];
    // 虚拟组（直推D）：按 TL 维度，先 cuiding 自己放最上，再下属 TL
    const tlOrder = [String(targetTL._id), ...TL_IDS.filter(x => x !== String(targetTL._id))];
    for (const tlId of tlOrder) {
      const k = 'VIR_'+tlId;
      if (!groupsAgg.has(k)) continue;
      const agg = groupsAgg.get(k);
      const tl = agg.tl;
      const emps = [...agg.emps];
      let g=0, ads=0, prev=0, month=0, todAct=0;
      for (const eid of emps) { const c = curMap.get(eid); if (c) { g+=c.g; ads+=c.ads; todAct++; } prev += (prevMap.get(eid)||0); month += (mMap.get(eid)||0); if (activeSet.has(eid)) todAct++; }
      const avg = ads>0 ? (g/ads)/1000 : 0; // 平均「金币/次」换算元 = g/ads/1000
      let rate = 0;
      if (prev>0) rate = (g - prev) / prev * 100;
      else if (g>0) rate = 999.99; // 首日出业绩显示 +999.99%
      result.push({
        groupId: k,
        groupName: (String(tl._id)===String(targetTL._id)? '直推成员' : `${tl.teamName || tl.username || '下属TL'} - 直推成员`),
        kind: 'direct_members',
        isDirectGroup: true,
        teamLeaderId: String(tl._id),
        teamLeaderName: tl.realName || tl.username,
        teamLeaderUsername: tl.username,
        teamLevel: String(tl._id)===String(targetTL._id) ? 'own' : 'sub',
        subTeamName: String(tl._id)===String(targetTL._id) ? '' : (tl.teamName || tl.username || ''),
        groupLeaderId: String(tl._id),  // 🌿 B2：虚拟组的"负责人"就是所属TL本人，前端传userId=/group-leader/performance?userId=<groupLeaderId> 跳负责人整体业绩页
        groupLeaderName: tl.realName || tl.username,
        groupLeaderLevel: groupLeaderLevelMap.get(String(tl._id))?.level || null,
        groupLeaderLevelManual: !!(groupLeaderLevelMap.get(String(tl._id))?.manual),
        commission: +(tl.commission || 0) || 0,
        memberCount: emps.length,
        todayActive: todAct,
        totalAds: ads,
        avgGold: +(Math.round(avg*100)/100).toFixed(2), // 前端 Grep.tsx 读 g.avgGold
        avgEcpm: +(Math.round(avg*100)/100),
        todayRevenue:    +(Math.round((g/1000)*100)/100),
        yesterdayRevenue:+(Math.round((prev/1000)*100)/100),
        monthlyRevenue:  +(Math.round((month/1000)*100)/100),
        totalRevenue:    +(Math.round((g/1000)*100)/100), // 兼容旧字段
        growthRate:      +(Math.round(rate*100)/100),
        createdAt: tl.createdAt || targetTL.createdAt || new Date(),
      });
    }
    // TG 组（真实 GL 组）：先「直属 TL 的 GL 组」，再「下属 TL 的 GL 组」
    const orderTGs = [...TGs_mine, ...TGs_sub].filter(Boolean);
    for (const tg of orderTGs) {
      const k = 'TG_'+String(tg._id);
      if (!groupsAgg.has(k)) {
        // 空组（memberCount=0）也显示，避免前端组列表忽隐忽现；成员数填 TG.memberCount
        const tl = ALL_TLS.get(String(tg.teamLeaderId)) || { username: teamId, realName:'', teamName: tg.teamName };
        let rate = 0;
        result.push({
          groupId: String(tg._id),
          groupName: tg.groupName,
          kind: 'leader_group',
          isDirectGroup: false,
          teamLeaderId: String(tg.teamLeaderId),
          teamLeaderName: tl.realName || tl.username,
          teamLeaderUsername: tl.username,
          teamLevel: String(tg.teamLeaderId)===String(targetTL._id)?'own':'sub',
          subTeamName: String(tg.teamLeaderId)===String(targetTL._id)? '' : (tl.teamName||tl.username||''),
          groupLeaderId: tg.groupLeaderId? String(tg.groupLeaderId) : null,
          groupLeaderName: tg.groupLeaderName || '',
          groupLeaderLevel: (tg.groupLeaderId ? groupLeaderLevelMap.get(String(tg.groupLeaderId))?.level : null) || null,
          groupLeaderLevelManual: !!(tg.groupLeaderId ? groupLeaderLevelMap.get(String(tg.groupLeaderId))?.manual : false),
          commission: +(tg.commission || 0.05),
          memberCount: tg.memberCount|0,
          todayActive: 0,
          totalAds: 0,
          avgGold: 0,
          avgEcpm: 0,
          todayRevenue: 0,
          yesterdayRevenue: 0,
          monthlyRevenue: 0,
          totalRevenue: 0,
          growthRate: 0,
          createdAt: tg.createdAt,
        });
        continue;
      }
      const agg = groupsAgg.get(k);
      const tl = ALL_TLS.get(String(tg.teamLeaderId)) || { username:'', realName:'', teamName:tg.teamName };
      const emps = [...agg.emps];
      let g=0, ads=0, prev=0, month=0, todAct=0;
      for (const eid of emps) { const c = curMap.get(eid); if (c) { g+=c.g; ads+=c.ads; todAct++; } prev += (prevMap.get(eid)||0); month += (mMap.get(eid)||0); if (activeSet.has(eid)) todAct++; }
      const avg = ads>0 ? (g/ads)/1000 : 0;
      let rate = 0;
      if (prev>0) rate = (g - prev)/prev*100;
      else if (g>0) rate = 999.99;
      result.push({
        groupId: String(tg._id),
        groupName: tg.groupName,
        kind: 'leader_group',
        isDirectGroup: false,
        teamLeaderId: String(tg.teamLeaderId),
        teamLeaderName: tl.realName || tl.username,
        teamLeaderUsername: tl.username,
        teamLevel: String(tg.teamLeaderId)===String(targetTL._id)? 'own' : 'sub',
        subTeamName: String(tg.teamLeaderId)===String(targetTL._id)? '' : (tl.teamName||tl.username||''),
        groupLeaderId: tg.groupLeaderId? String(tg.groupLeaderId) : null,
        groupLeaderName: tg.groupLeaderName || '',
        groupLeaderLevel: (tg.groupLeaderId ? groupLeaderLevelMap.get(String(tg.groupLeaderId))?.level : null) || null,
        groupLeaderLevelManual: !!(tg.groupLeaderId ? groupLeaderLevelMap.get(String(tg.groupLeaderId))?.manual : false),
        commission: +(tg.commission || 0.05),
        memberCount: Math.max(emps.length, tg.memberCount|0),
        todayActive: todAct,
        totalAds: ads,
        avgGold: +(Math.round(avg*100)/100).toFixed(2),
        avgEcpm: +(Math.round(avg*100)/100),
        todayRevenue:    +(Math.round((g/1000)*100)/100),
        yesterdayRevenue:+(Math.round((prev/1000)*100)/100),
        monthlyRevenue:  +(Math.round((month/1000)*100)/100),
        totalRevenue:    +(Math.round((g/1000)*100)/100),
        growthRate:      +(Math.round(rate*100)/100),
        createdAt: tg.createdAt,
      });
    }

    // 排序：默认按 range 对应的 revenue 降序（today→todayRevenue，month→monthlyRevenue）
    const sortKey = range === 'month' ? 'monthlyRevenue' : 'todayRevenue';
    result.sort((a,b) => (b[sortKey]-a[sortKey]) || (b.totalRevenue-a.totalRevenue));

    const totalGroups = result.length;
    const totalMembers = result.reduce((s,g)=>s+g.memberCount,0);
    const totalRevenue = +(result.reduce((s,g)=>s+ (sortKey==='monthlyRevenue'?g.monthlyRevenue:g.todayRevenue),0)).toFixed(2);
    const out = {
      data: result,
      totalGroups,
      totalMembers,
      totalRevenue,
      // 额外回传给前端（GroupManagement.tsx 可以直接用，不用自己算）
      summary: {
        range,
        targetTL: { _id: String(targetTL._id), username: targetTL.username, realName: targetTL.realName, teamName: targetTL.teamName },
        subTLs: TL_IDS.filter(x => x!==String(targetTL._id)).map(x => {
          const t = ALL_TLS.get(x); return { _id: x, username: t?.username, realName: t?.realName, teamName: t?.teamName };
        }),
        groupCount_own_TG:   TGs_mine.length,
        groupCount_sub_TG:   TGs_sub.length,
        groupCount_virtual:  [...groupsAgg.keys()].filter(k=>k.startsWith('VIR_')).length,
        totalYesterdayRevenue: +(Math.round(result.reduce((s,g)=>s+g.yesterdayRevenue,0)*100)/100),
        totalMonthlyRevenue:   +(Math.round(result.reduce((s,g)=>s+g.monthlyRevenue,0)*100)/100),
        totalTodayActive:      result.reduce((s,g)=>s+g.todayActive,0),
        totalAds:              result.reduce((s,g)=>s+g.totalAds,0),
      }
    };
    // 存缓存
    try { if (typeof set === 'function') set(cacheKey, { timestamp: Date.now(), data: out }, CACHE_TTL?.dashboard || 300000); } catch(_){}
    return res.json({ success: true, message: '获取团队组列表成功(v3口径:复用KPI时间窗)', ...out });
  } catch (error) {
    console.error('v2 team-leader/groups 错误:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
}
// 独立函数注册到路由（便于 TDD 直接调用 handler 验证）
router.get('/team-leader/groups', authMiddleware, _teamLeaderGroupsHandler);

// 员工帐号列表接口 - 简化版
router.get('/employees-simple', authMiddleware, async (req, res) => {
  try {
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({ success: false, message: '缺少团队ID参数' });
    }

    // 检查缓存
    const cachedData = getCache(teamId);
    if (cachedData) {
      return res.json({
        success: true,
        message: '获取员工列表成功（缓存）',
        data: cachedData
      });
    }

    // 优化：只查询需要的字段
    const employees = await Employee.find(
      { parentId: teamId },
      { employeeId: 1, realName: 1, status: 1, phone: 1, region: 1, teamGroupId: 1, groupName: 1, parentId: 1, createdAt: 1, csjDeviceLimit: 1, ksDeviceLimit: 1, ylhDeviceLimit: 1, _id: 1 }
    );

    // 优化：批量查询组信息（过滤虚拟组ID，只保留有效ObjectId）
    const groupIds = [...new Set(employees.map(e => e.teamGroupId).filter(id => id && !String(id).startsWith('VIR_')))];
    const groups = groupIds.length > 0 ? await TeamGroup.find(
      { _id: { $in: groupIds } },
      { _id: 1, groupName: 1, groupLeaderName: 1 }
    ) : [];
    const groupById = {};
    groups.forEach(g => {
      groupById[g._id.toString()] = g;
    });

    const teamAdmin = await Admin.findById(teamId, { teamName: 1, _id: 0 });
    const teamName = teamAdmin ? teamAdmin.teamName : '';

    // 优化：使用并行查询
    const employeeIds = employees.map(e => e.employeeId);
    const beijingNow = getBeijingDate();
    const todayStart = getBeijingStartOfDay(beijingNow);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    // 优化：使用聚合查询获取每个员工的最近一次金币记录
    const goldByEmployee = {};
    
    if (employeeIds.length > 0) {
      const recentGoldLogs = await GoldLog.aggregate([
        {
          $match: {
            employeeId: { $in: employeeIds },
            createTime: { $gte: new Date(yesterdayStart.getTime() - 30 * 24 * 60 * 60 * 1000) }
          }
        },
        {
          $sort: { employeeId: 1, createTime: -1 }
        },
        {
          $group: {
            _id: '$employeeId',
            lastEarningDate: { $first: '$createTime' }
          }
        }
      ]);
      
      recentGoldLogs.forEach(log => {
        const dateKey = new Date(log.lastEarningDate).toISOString().split('T')[0];
        goldByEmployee[log._id] = dateKey;
      });
    }

    const result = employees.map(emp => {
      const group = emp.teamGroupId ? groupById[emp.teamGroupId.toString()] : null;
      
      let zeroEarningsDays = 0;
      const empId = emp.employeeId;
      const lastEarningDate = goldByEmployee[empId];
      
      const todayStr = todayStart.toISOString().split('T')[0];
      const createdDateStr = new Date(emp.createdAt).toISOString().split('T')[0];
      
      if (createdDateStr === todayStr) {
        zeroEarningsDays = 0;
      } else if (lastEarningDate) {
        const lastDate = new Date(lastEarningDate);
        const yesterdayDate = new Date(yesterdayStart);
        const diffTime = yesterdayDate.getTime() - lastDate.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        zeroEarningsDays = Math.min(diffDays, 15);
      } else {
        zeroEarningsDays = 15;
      }

      return {
        _id: emp._id.toString(),
        username: emp.employeeId,
        realName: emp.realName || emp.employeeId,
        role: 'EMPLOYEE',
        status: emp.status,
        employeeId: emp.employeeId,
        phone: emp.phone || '',
        region: emp.region || '',
        teamName: teamName,
        groupName: emp.groupName || '',
        parentId: emp.parentId,
        parentName: group ? (group.groupLeaderName || group.groupName) : '',
        zeroEarningsDays: zeroEarningsDays,
        csjDeviceLimit: emp.csjDeviceLimit || 2,
        ksDeviceLimit: emp.ksDeviceLimit || 2,
        ylhDeviceLimit: emp.ylhDeviceLimit || 2,
        createdAt: emp.createdAt
      };
    });

    // 缓存结果
    setCache(teamId, result);

    res.json({
      success: true,
      message: '获取员工列表成功',
      data: result
    });
  } catch (error) {
    console.error('获取员工列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
module.exports._teamLeaderGroupsHandler = _teamLeaderGroupsHandler;
