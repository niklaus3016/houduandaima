const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const Employee = require('../models/Employee');
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const { hashPassword } = require('../utils/auth');
const authMiddleware = require('../middleware/auth');

// 获取管理员列表
router.get('/admins', authMiddleware, async (req, res) => {
  try {
    const { search } = req.query;
    
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    let query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { realName: { $regex: search, $options: 'i' } },
        { teamName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const admins = await Admin.find(query);
    
    const adminsWithDetails = admins.map(admin => ({
      _id: admin._id,
      username: admin.username,
      role: admin.role,
      teamName: admin.teamName || '',
      realName: admin.realName || '',
      phone: admin.phone || '',
      region: admin.region || '',
      status: admin.status || 'enabled',
      createdAt: admin.createdAt,
      lastLoginAt: admin.lastLoginAt || null
    }));
    
    res.json({
      success: true,
      admins: adminsWithDetails
    });
  } catch (error) {
    console.error('获取管理员列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 添加管理员（团队长账号）
router.post('/add-admin', authMiddleware, async (req, res) => {
  try {
    const { username, password, teamName, realName, phone, region, role } = req.body;
    
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '缺少必要参数：用户名和密码' });
    }
    
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }
    
    const newAdmin = new Admin({
      username,
      password: hashPassword(password),
      role: role || 'admin',
      teamName: teamName || '',
      realName: realName || '',
      phone: phone || '',
      region: region || '',
      status: 'enabled'
    });
    
    await newAdmin.save();
    
    res.json({
      success: true,
      message: '管理员添加成功',
      data: {
        _id: newAdmin._id,
        username: newAdmin.username,
        role: newAdmin.role,
        teamName: newAdmin.teamName,
        realName: newAdmin.realName,
        phone: newAdmin.phone,
        region: newAdmin.region,
        status: newAdmin.status
      }
    });
  } catch (error) {
    console.error('添加管理员错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 创建管理员（新接口，支持前端新字段）
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { teamName, realName, phone, region, username, password, role } = req.body;
    
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '缺少必要参数：用户名和密码' });
    }
    
    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }
    
    const newAdmin = new Admin({
      username,
      password: hashPassword(password),
      role: role || 'NORMAL_ADMIN',
      teamName: teamName || '',
      realName: realName || '',
      phone: phone || '',
      region: region || '',
      status: 'enabled'
    });
    
    await newAdmin.save();
    
    res.json({
      success: true,
      message: '团队长账号创建成功',
      data: {
        _id: newAdmin._id,
        username: newAdmin.username,
        role: newAdmin.role,
        teamName: newAdmin.teamName,
        realName: newAdmin.realName,
        phone: newAdmin.phone,
        region: newAdmin.region,
        status: newAdmin.status
      }
    });
  } catch (error) {
    console.error('创建管理员错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取管理员列表（新接口）
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const { search, page = 1, pageSize = 10 } = req.query;
    
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    let query = {};
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { realName: { $regex: search, $options: 'i' } },
        { teamName: { $regex: search, $options: 'i' } }
      ];
    }
    
    const total = await Admin.countDocuments(query);
    const admins = await Admin.find(query)
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize))
      .sort({ createdAt: -1 });
    
    const adminsWithDetails = admins.map(admin => ({
      _id: admin._id,
      username: admin.username,
      role: admin.role,
      teamName: admin.teamName || '',
      realName: admin.realName || '',
      phone: admin.phone || '',
      region: admin.region || '',
      status: admin.status || 'enabled',
      createdAt: admin.createdAt
    }));
    
    res.json({
      success: true,
      admins: adminsWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取管理员列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取员工列表
router.get('/employees', authMiddleware, async (req, res) => {
  try {
    const { search, parentId } = req.query;
    
    let query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    if (parentId) {
      query.parentId = parentId;
    }
    
    const employees = await Employee.find(query);
    
    const employeesWithDetails = await Promise.all(employees.map(async (emp) => {
      const userGold = await UserGold.findOne({ employeeId: emp.employeeId });
      const coins = userGold ? userGold.currentMonthGold : 0;
      
      return {
        id: emp._id,
        employeeId: emp.employeeId,
        name: emp.name,
        phone: emp.phone || '',
        area: emp.area || '',
        status: emp.status,
        coins: parseFloat(coins.toFixed(2)),
        parentId: emp.parentId || '',
        createdAt: emp.createdAt
      };
    }));
    
    res.json({
      success: true,
      data: employeesWithDetails
    });
  } catch (error) {
    console.error('获取员工列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 添加员工
router.post('/add-employee', authMiddleware, async (req, res) => {
  try {
    const { username, password, parentId } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    let employeeId;
    let isUnique = false;
    
    while (!isUnique) {
      employeeId = Math.floor(1000 + Math.random() * 9000).toString();
      const existingEmployee = await Employee.findOne({ employeeId });
      if (!existingEmployee) {
        isUnique = true;
      }
    }
    
    const newEmployee = new Employee({
      employeeId,
      name: username,
      phone: '',
      area: '',
      status: 1,
      parentId: parentId || ''
    });
    
    await newEmployee.save();
    
    res.json({
      success: true,
      message: '员工添加成功',
      data: newEmployee
    });
  } catch (error) {
    console.error('添加员工错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新账号状态
router.post('/update-status', authMiddleware, async (req, res) => {
  try {
    const { id, status } = req.body;
    
    if (!id || !status) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    let result;
    
    const employee = await Employee.findOne({ employeeId: id });
    if (employee) {
      employee.status = status === 'enabled' ? 1 : 0;
      await employee.save();
      result = employee;
    } else {
      const admin = await Admin.findById(id);
      if (admin) {
        admin.status = status;
        await admin.save();
        result = admin;
      } else {
        return res.status(404).json({ success: false, message: '账号不存在' });
      }
    }
    
    res.json({
      success: true,
      message: '账号状态更新成功',
      data: result
    });
  } catch (error) {
    console.error('更新账号状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 启用/禁用账号（新接口）
router.put('/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['enabled', 'disabled'].includes(status)) {
      return res.status(400).json({ success: false, message: '无效的状态值' });
    }
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }
    
    admin.status = status;
    admin.updatedAt = new Date();
    await admin.save();
    
    res.json({
      success: true,
      message: '状态更新成功',
      data: {
        _id: admin._id,
        status: admin.status
      }
    });
  } catch (error) {
    console.error('更新账号状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新账号信息
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { teamName, realName, phone, region, username, password } = req.body;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }
    
    // 如果要更新用户名，检查是否已存在
    if (username && username !== admin.username) {
      const existingAdmin = await Admin.findOne({ username, _id: { $ne: id } });
      if (existingAdmin) {
        return res.status(400).json({ success: false, message: '用户名已存在' });
      }
      admin.username = username;
    }
    
    // 更新其他字段
    if (teamName !== undefined) admin.teamName = teamName;
    if (realName !== undefined) admin.realName = realName;
    if (phone !== undefined) admin.phone = phone;
    if (region !== undefined) admin.region = region;
    
    // 如果提供了新密码，则更新密码
    if (password) {
      admin.password = hashPassword(password);
    }
    
    admin.updatedAt = new Date();
    await admin.save();
    
    res.json({
      success: true,
      message: '更新成功',
      data: {
        _id: admin._id,
        teamName: admin.teamName,
        realName: admin.realName,
        phone: admin.phone,
        region: admin.region,
        username: admin.username,
        role: admin.role,
        status: admin.status
      }
    });
  } catch (error) {
    console.error('更新账号信息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 删除账号
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const admin = await Admin.findByIdAndDelete(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }
    
    res.json({
      success: true,
      message: '账号删除成功'
    });
  } catch (error) {
    console.error('删除账号错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
