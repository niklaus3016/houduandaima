const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const UserGold = require('../models/UserGold');
const Admin = require('../models/Admin');
const authMiddleware = require('../middleware/auth');

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
        groupName: newEmployee.groupName
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
    if (teamGroupId !== undefined) employee.teamGroupId = teamGroupId;
    if (groupId !== undefined) employee.teamGroupId = groupId; // 兼容前端传递的groupId
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
    
    const leaders = admins.map(admin => ({
      _id: admin._id,
      name: admin.teamName || admin.realName || admin.username
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

module.exports = router;
