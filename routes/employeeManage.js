const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const UserGold = require('../models/UserGold');
const Admin = require('../models/Admin');
const TeamGroup = require('../models/TeamGroup');
const GoldLog = require('../models/GoldLog');
const authMiddleware = require('../middleware/auth');
const { cache, CACHE_TTL, get, set, clear } = require('../utils/cache');

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
    const { parentId, realName, phone, region, employeeId, teamGroupId, groupName, groupId } = req.body;
    
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
        phoneCount: employee.phoneCount || 0
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
    const cacheKey = 'team_leaders_list';
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return res.json({
        success: true,
        data: cached.data
      });
    }
    
    const admins = await Admin.find({ status: 'enabled' })
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
    const { groupName, commission, groupLeaderId, groupLeaderName } = req.body;
    
    const group = await TeamGroup.findById(id);
    if (!group) {
      return res.status(404).json({ success: false, message: '组不存在' });
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
    
    if (commission !== undefined) group.commission = commission;
    if (groupLeaderId !== undefined) group.groupLeaderId = groupLeaderId;
    // 禁止修改groupLeaderName，保持团队长设置的姓名
    
    await group.save();
    
    res.json({
      success: true,
      message: '更新成功',
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



// 团队长组情况接口 - 展示团队下各组的业绩数据
router.get('/team-leader/groups', authMiddleware, async (req, res) => {
  try {
    const { teamId, range = 'today' } = req.query;
    
    if (!teamId) {
      return res.status(400).json({ success: false, message: '缺少团队ID参数' });
    }
    
    // 生成缓存键
    const cacheKey = `team_leader_groups_${teamId}_${range}`;
    const cachedItem = cache.get(cacheKey);
    if (cachedItem && Date.now() - cachedItem.timestamp < CACHE_TTL) {
      return res.json({
        success: true,
        message: '获取团队组列表成功（缓存）',
        data: cachedItem.data.data,
        totalGroups: cachedItem.data.totalGroups,
        totalMembers: cachedItem.data.totalMembers,
        totalRevenue: cachedItem.data.totalRevenue,
        fromCache: true
      });
    }
    
    // 获取北京时间
    const beijingNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
    let startDate, endDate, yesterdayStart, yesterdayEnd, lastMonthStart;
    
    if (range === 'month') {
      const monthStart = new Date(beijingNow);
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      startDate = new Date(monthStart.getTime() - 8 * 60 * 60 * 1000);
      endDate = new Date();
      
      const lastMonth = new Date(beijingNow);
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      lastMonth.setUTCDate(1);
      lastMonth.setUTCHours(0, 0, 0, 0);
      lastMonthStart = new Date(lastMonth.getTime() - 8 * 60 * 60 * 1000);
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
    
    // 获取团队长的所有组
    const groups = await TeamGroup.find({ teamLeaderId: teamId });
    const groupIds = groups.map(g => g._id.toString());
    
    // 查询有 teamGroupId 的员工（兼容 ObjectId 和 String 两种类型）
    const allEmployees = await Employee.find({
      $or: [
        { teamGroupId: { $in: groupIds } },
        { teamGroupId: { $in: groupIds.map(id => new mongoose.Types.ObjectId(id)) } }
      ]
    });
    
    // 根据 groupName 分组
    const employeesByGroup = {};
    allEmployees.forEach(emp => {
      if (emp.groupName) {
        if (!employeesByGroup[emp.groupName]) {
          employeesByGroup[emp.groupName] = [];
        }
        employeesByGroup[emp.groupName].push(emp);
      }
    });
    

    // 收集所有员工ID
    const allEmployeeIds = allEmployees.map(e => e.employeeId);
    
    // 批量查询当前时间范围的金币记录
    const currentStats = await GoldLog.aggregate([
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
    ]);
    
    const statsByEmployee = {};
    currentStats.forEach(stat => {
      statsByEmployee[stat._id] = { totalGold: stat.totalGold, totalAds: stat.totalAds };
    });
    
    // 批量查询对比时间范围的金币记录
    let compareStats = [];
    if (range === 'today' && yesterdayStart) {
      compareStats = await GoldLog.aggregate([
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
      ]);
    } else if (range === 'month' && lastMonthStart) {
      compareStats = await GoldLog.aggregate([
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
      ]);
    }
    
    const compareStatsByEmployee = {};
    compareStats.forEach(stat => {
      compareStatsByEmployee[stat._id] = stat.totalGold;
    });
    
    // 构建组数据
    const groupData = groups.map(group => {
      const employees = employeesByGroup[group.groupName] || [];
      const memberEmployeeIds = employees.map(e => e.employeeId);
      
      let totalGold = 0;
      let totalAds = 0;
      let yesterdayGold = 0;
      
      memberEmployeeIds.forEach(empId => {
        const stat = statsByEmployee[empId];
        if (stat) {
          totalGold += stat.totalGold;
          totalAds += stat.totalAds;
        }
        const compare = compareStatsByEmployee[empId];
        if (compare) {
          yesterdayGold += compare;
        }
      });
      
      const avgGold = totalAds > 0 ? totalGold / totalAds : 0;
      let growthRate = 0;
      if (yesterdayGold > 0) {
        growthRate = ((totalGold - yesterdayGold) / yesterdayGold) * 100;
      }
      
      return {
        groupId: group._id.toString(),
        groupName: group.groupName,
        groupLeaderName: group.groupLeaderName || '',
        memberCount: employees.length,
        totalAds: totalAds,
        totalRevenue: totalGold / 1000,
        avgGold: parseFloat(avgGold.toFixed(2)),
        growthRate: parseFloat(growthRate.toFixed(2)),
        commission: group.commission || 0.05,
        createdAt: group.createdAt
      };
    });
    
    // 按总收益排序
    groupData.sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    // 计算总计数据
    const totalGroups = groupData.length;
    const totalMembers = groupData.reduce((sum, group) => sum + group.memberCount, 0);
    const totalRevenue = groupData.reduce((sum, group) => sum + group.totalRevenue, 0);
    
    // 存储缓存
    const cacheData = {
      data: groupData,
      totalGroups: totalGroups,
      totalMembers: totalMembers,
      totalRevenue: parseFloat(totalRevenue.toFixed(2))
    };
    cache.set(cacheKey, {
      data: cacheData,
      timestamp: Date.now()
    });
    
    res.json({
      success: true,
      message: '获取团队组列表成功',
      data: groupData,
      totalGroups: totalGroups,
      totalMembers: totalMembers,
      totalRevenue: parseFloat(totalRevenue.toFixed(2))
    });
  } catch (error) {
    console.error('获取团队组数据错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

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
      { employeeId: 1, realName: 1, status: 1, phone: 1, region: 1, teamGroupId: 1, groupName: 1, parentId: 1, createdAt: 1, _id: 1 }
    );

    // 优化：批量查询组信息
    const groupIds = [...new Set(employees.map(e => e.teamGroupId).filter(id => id))];
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
