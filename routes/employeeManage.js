const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const UserGold = require('../models/UserGold');
const Admin = require('../models/Admin');
const TeamGroup = require('../models/TeamGroup');
const GoldLog = require('../models/GoldLog');
const authMiddleware = require('../middleware/auth');

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
    
    const total = await Employee.countDocuments(query);
    const employees = await Employee.find(query)
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize))
      .sort({ createdAt: -1 });
    
    const employeesWithDetails = await Promise.all(employees.map(async (emp) => {
      let parentName = '系统直属';
      if (emp.parentId) {
        const parent = await Admin.findById(emp.parentId);
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
    }));
    
    res.json({
      success: true,
      data: employeesWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
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
    if (teamGroupId !== undefined || groupId !== undefined) {
      const newTeamGroupId = teamGroupId || groupId; // 兼容前端传递的groupId
      if (newTeamGroupId && newTeamGroupId !== employee.teamGroupId) {
        // 分配新组或转移组，更新入组时间
        employee.joinedGroupAt = new Date();
      }
      employee.teamGroupId = newTeamGroupId;
    }
    
    if (groupName !== undefined) employee.groupName = groupName;
    if (req.body.phoneCount !== undefined) employee.phoneCount = req.body.phoneCount;
    
    employee.updatedAt = new Date();
    await employee.save();
    
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
    const admins = await Admin.find({ status: 'enabled' })
      .select('_id teamName realName username')
      .sort({ teamName: 1 });
    
    const leaders = await Promise.all(admins.map(async (admin) => {
      // 计算团队成员数量
      const memberCount = await Employee.countDocuments({ parentId: admin._id });
      
      return {
        _id: admin._id,
        username: admin.username,
        realName: admin.realName || admin.username,
        teamName: admin.teamName || '',
        memberCount: memberCount
      };
    }));
    
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
    const { teamId } = req.query;
    
    if (!teamId) {
      return res.status(400).json({ success: false, message: '缺少团队ID参数' });
    }
    
    const groups = await TeamGroup.find({ teamLeaderId: teamId });
    
    const now = new Date();
    const todayStart = getBeijingStartOfDay(now);
    const todayEnd = getBeijingEndOfDay(now);
    
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStart = getBeijingStartOfDay(yesterday);
    const yesterdayEnd = getBeijingEndOfDay(yesterday);
    
    const monthStart = getMonthStart(now);
    
    const groupLeaders = await Promise.all(groups.map(async (group) => {
      const employees = await Employee.find({ teamGroupId: group._id });
      const employeeIds = employees.map(e => e.employeeId);
      
      const todayGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: todayStart, $lte: todayEnd }
      });
      
      const yesterdayGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: yesterdayStart, $lte: yesterdayEnd }
      });
      
      const monthGoldLogs = await GoldLog.find({
        employeeId: { $in: employeeIds },
        createTime: { $gte: monthStart }
      });
      
      const todayActiveSet = new Set(todayGoldLogs.map(log => log.employeeId));
      const todayActive = todayActiveSet.size;
      
      const todayRevenue = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
      const yesterdayRevenue = yesterdayGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
      const monthlyRevenue = monthGoldLogs.reduce((sum, log) => sum + log.gold, 0) / 1000;
      
      const todayAdCount = todayGoldLogs.length;
      
      const totalEcpm = todayGoldLogs.reduce((sum, log) => sum + (log.ecpm || 0), 0);
      const avgEcpm = todayAdCount > 0 ? totalEcpm / todayAdCount : 0;
      
      return {
        _id: group._id,
        groupId: group._id,
        groupName: group.groupName,
        groupLeaderId: group.groupLeaderId,
        groupLeaderName: group.groupLeaderName,
        commission: group.commission,
        memberCount: group.memberCount || employees.length,
        todayActive,
        todayRevenue: parseFloat(todayRevenue.toFixed(2)),
        monthlyRevenue: parseFloat(monthlyRevenue.toFixed(2)),
        todayAdCount,
        avgEcpm: parseFloat(avgEcpm.toFixed(2)),
        yesterdayRevenue: parseFloat(yesterdayRevenue.toFixed(2))
      };
    }));
    
    res.json({
      success: true,
      data: groupLeaders
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
    if (groupLeaderName !== undefined) group.groupLeaderName = groupLeaderName;
    
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

module.exports = router;
