const express = require('express');
const router = express.Router();
const UserActivity = require('../models/UserActivity');

// 获取客户端真实IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.headers['cf-connecting-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.ip ||
         '127.0.0.1';
}

// 记录用户活动（IP和设备信息）
router.post('/record', async (req, res) => {
  try {
    const { userId, employeeId, deviceId } = req.body;
    
    // 自动从请求中获取IP
    const ip = getClientIP(req);
    
    // 参数校验
    if (!userId || !employeeId || !deviceId) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少必要参数：userId, employeeId, deviceId' 
      });
    }
    
    // 使用findOneAndUpdate实现upsert（存在则更新，不存在则创建）
    const result = await UserActivity.findOneAndUpdate(
      { userId, ip, deviceId },
      {
        $set: {
          employeeId,
          updateTime: new Date()
        },
        $setOnInsert: {
          createTime: new Date()
        }
      },
      {
        upsert: true,
        new: true
      }
    );
    
    res.json({
      success: true,
      message: '活动记录成功',
      data: {
        userId: result.userId,
        employeeId: result.employeeId,
        ip: result.ip,
        deviceId: result.deviceId,
        createTime: result.createTime,
        updateTime: result.updateTime
      }
    });
  } catch (error) {
    console.error('记录用户活动错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取用户活动统计（IP和设备数量）
router.get('/stats', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少userId参数' 
      });
    }
    
    // 统计IP数量
    const ipList = await UserActivity.distinct('ip', { userId });
    // 统计设备数量
    const deviceList = await UserActivity.distinct('deviceId', { userId });
    
    res.json({
      success: true,
      data: {
        userId,
        ipCount: ipList.length,
        deviceCount: deviceList.length,
        ipList,
        deviceList
      }
    });
  } catch (error) {
    console.error('获取用户活动统计错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
