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

router.post('/record', async (req, res) => {
  try {
    const { userId, employeeId, deviceId } = req.body;
    
    if (!userId || !employeeId || !deviceId) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少必要参数：userId, employeeId, deviceId' 
      });
    }
    
    // CSJ 系统：登录接口(/api/employee/check)已记录设备信息，此处直接跳过避免重复
    if (deviceId.startsWith('csj_')) {
      return res.json({
        success: true,
        message: '活动记录成功',
        data: { userId, employeeId, ip: getClientIP(req), deviceId, createTime: new Date() }
      });
    }
    
    // 百度系统：保持原逻辑
    const ip = getClientIP(req);
    const result = await UserActivity.findOneAndUpdate(
      { userId, ip, deviceId },
      {
        $set: { employeeId, updateTime: new Date() },
        $setOnInsert: { createTime: new Date() }
      },
      { upsert: true, new: true }
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
