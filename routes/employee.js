const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const UserGold = require('../models/UserGold');

// 生成4位随机员工号
function generateEmployeeId() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// 校验员工号登录
router.post('/check', async (req, res) => {
  try {
    const { employeeId } = req.body;
    
    if (!employeeId || employeeId.length !== 4) {
      return res.status(400).json({ success: false, message: '请输入4位员工号' });
    }
    
    const employee = await Employee.findOne({ 
      employeeId, 
      $or: [{ status: 1 }, { status: 'enabled' }] 
    });
    
    if (!employee) {
      return res.status(401).json({ success: false, message: '员工号不存在或已禁用' });
    }
    
    // 查找该员工的用户金币记录，获取userId
    // 优先查找employeeId匹配且userId以user_开头的记录（系统生成的正式用户）
    let userGold = await UserGold.findOne({ 
      employeeId,
      userId: { $regex: `^user_${employeeId}_` }
    }).sort({ createdAt: -1 });
    
    // 如果没有找到系统生成的用户，再查找任何匹配employeeId的记录
    if (!userGold) {
      userGold = await UserGold.findOne({ employeeId }).sort({ createdAt: -1 });
    }
    
    // 如果没有用户记录，创建一个新的userId
    let userId;
    if (!userGold) {
      // 使用employeeId作为userId的基础，创建新用户
      userId = `user_${employeeId}_${Date.now()}`;
      userGold = new UserGold({
        userId,
        employeeId,
        currentMonthGold: 0,
        lastMonthGold: 0
      });
      await userGold.save();
    } else {
      userId = userGold.userId;
    }
    
    res.json({ 
      success: true, 
      message: '登录成功', 
      data: {
        ...employee.toObject(),
        userId: userId
      }
    });
  } catch (error) {
    console.error('登录校验错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 管理员添加员工
router.post('/add', async (req, res) => {
  try {
    const { name, phone, area } = req.body;
    
    if (!name || !phone || !area) {
      return res.status(400).json({ success: false, message: '请填写完整信息' });
    }
    
    // 生成唯一员工号
    let employeeId;
    let isUnique = false;
    
    while (!isUnique) {
      employeeId = generateEmployeeId();
      const existingEmployee = await Employee.findOne({ employeeId });
      if (!existingEmployee) {
        isUnique = true;
      }
    }
    
    const newEmployee = new Employee({
      employeeId,
      name,
      phone,
      area,
      status: 1
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
      message: '员工添加成功', 
      data: {
        ...newEmployee.toObject(),
        userId: userId
      }
    });
  } catch (error) {
    console.error('添加员工错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;