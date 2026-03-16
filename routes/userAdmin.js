const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const authMiddleware = require('../middleware/auth');

// 获取用户列表
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const { search, status, page = 1, pageSize = 10 } = req.query;
    
    // 构建查询条件
    let query = {};
    if (search) {
      query.userId = { $regex: search, $options: 'i' };
    }
    // 这里可以根据实际需求添加status的查询条件
    
    // 获取用户列表
    const total = await UserGold.countDocuments(query);
    const users = await UserGold.find(query)
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize));
    
    res.json({
      success: true,
      data: {
        list: users,
        pagination: {
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize)
        }
      }
    });
  } catch (error) {
    console.error('获取用户列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取用户详情
router.get('/detail', authMiddleware, async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!id) {
      return res.status(400).json({ success: false, message: '缺少用户ID' });
    }
    
    // 获取用户信息
    const user = await UserGold.findOne({ userId: id });
    
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 获取用户金币记录
    const goldLogs = await GoldLog.find({ userId: id })
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      data: {
        user,
        goldLogs
      }
    });
  } catch (error) {
    console.error('获取用户详情错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新用户状态
router.post('/update-status', authMiddleware, async (req, res) => {
  try {
    const { id, status } = req.body;
    
    if (!id || !status) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 这里简化处理，实际项目中可能需要单独的用户状态字段
    // 例如：const user = await User.findOne({ userId: id });
    // if (user) {
    //   user.status = status;
    //   await user.save();
    // }
    
    // 模拟更新成功
    res.json({
      success: true,
      message: '用户状态更新成功'
    });
  } catch (error) {
    console.error('更新用户状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;