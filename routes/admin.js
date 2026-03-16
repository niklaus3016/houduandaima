const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const { generateToken, hashPassword, comparePassword } = require('../utils/auth');
const authMiddleware = require('../middleware/auth');

// 初始化默认管理员账号
const initDefaultAdmin = async () => {
  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      const defaultAdmin = new Admin({
        username: 'admin',
        password: hashPassword('admin123'),
        role: 'superadmin'
      });
      await defaultAdmin.save();
      console.log('默认管理员账号已创建: admin / admin123');
    }
  } catch (error) {
    console.error('初始化默认管理员失败:', error);
  }
};

// 调用初始化函数
initDefaultAdmin();

// 管理员登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '缺少用户名或密码' });
    }
    
    // 查找管理员
    const admin = await Admin.findOne({ username });
    
    if (!admin) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    
    // 验证密码
    if (!comparePassword(password, admin.password)) {
      return res.status(401).json({ success: false, message: '用户名或密码错误' });
    }
    
    // 生成token
    const token = generateToken(admin);
    
    // 返回用户信息和token
    res.json({
      success: true,
      message: '登录成功',
      data: {
        user: {
          id: admin._id,
          username: admin.username,
          role: admin.role,
          teamName: admin.teamName || '',
          commission: admin.commission || 0
        },
        token
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id);
    
    if (!admin) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    res.json({
      success: true,
      data: {
        id: admin._id,
        username: admin.username,
        role: admin.role,
        teamName: admin.teamName || '',
        commission: admin.commission || 0,
        createdAt: admin.createdAt
      }
    });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 修改密码
router.post('/update-password', authMiddleware, async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    
    if (!userId || !newPassword) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 验证权限
    if (req.user.role !== 'superadmin' && req.user.id.toString() !== userId) {
      return res.status(403).json({ success: false, message: '权限不足' });
    }
    
    // 更新密码
    const admin = await Admin.findById(userId);
    
    if (!admin) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    admin.password = hashPassword(newPassword);
    await admin.save();
    
    res.json({ success: true, message: '密码修改成功' });
  } catch (error) {
    console.error('修改密码错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;