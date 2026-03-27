const express = require('express');
const router = express.Router();
const DeviceStatus = require('../models/DeviceStatus');
const DeviceConfig = require('../models/DeviceConfig');

// 获取设备状态
router.get('/status', async (req, res) => {
  try {
    const { deviceId } = req.query;
    
    if (!deviceId) {
      return res.status(400).json({ success: false, message: '缺少设备ID' });
    }
    
    // 查询设备状态记录
    let deviceStatus = await DeviceStatus.findOne({ deviceId });
    
    // 如果不存在，创建新记录
    if (!deviceStatus) {
      deviceStatus = new DeviceStatus({ deviceId });
      await deviceStatus.save();
    }
    
    res.json({
      success: true,
      data: {
        isLimited: deviceStatus.isLimited,
        message: deviceStatus.isLimited ? '检测到该设备价值过低' : '设备状态正常'
      }
    });
  } catch (error) {
    console.error('获取设备状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新设备记录
router.post('/update', async (req, res) => {
  try {
    const { deviceId, gold } = req.body;
    
    if (!deviceId || gold === undefined) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 查询设备状态记录
    let deviceStatus = await DeviceStatus.findOne({ deviceId });
    
    // 如果不存在，创建新记录
    if (!deviceStatus) {
      deviceStatus = new DeviceStatus({ deviceId });
    }
    
    // 查询配置表，获取连续记录条数阈值和金币阈值
    let deviceConfig = await DeviceConfig.findOne();
    
    // 如果不存在，创建默认配置
    if (!deviceConfig) {
      deviceConfig = new DeviceConfig();
      await deviceConfig.save();
    }
    
    // 检查金币数是否低于阈值
    if (gold < deviceConfig.goldThreshold) {
      // 增加连续低价值记录数
      deviceStatus.consecutiveLowValueCount += 1;
    } else {
      // 重置连续低价值记录数
      deviceStatus.consecutiveLowValueCount = 0;
    }
    
    // 检查连续低价值记录数是否达到配置的条数
    if (deviceStatus.consecutiveLowValueCount >= deviceConfig.consecutiveLimit) {
      // 将设备标记为限制状态
      deviceStatus.isLimited = true;
      deviceStatus.lastLimitedTime = new Date();
    }
    
    // 更新最后更新时间
    deviceStatus.lastUpdateTime = new Date();
    
    // 保存设备状态记录
    await deviceStatus.save();
    
    res.json({
      success: true,
      data: {
        isLimited: deviceStatus.isLimited,
        consecutiveLowValueCount: deviceStatus.consecutiveLowValueCount
      }
    });
  } catch (error) {
    console.error('更新设备记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取配置
router.get('/config', async (req, res) => {
  try {
    // 查询配置表
    let deviceConfig = await DeviceConfig.findOne();
    
    // 如果不存在，创建默认配置
    if (!deviceConfig) {
      deviceConfig = new DeviceConfig();
      await deviceConfig.save();
    }
    
    res.json({
      success: true,
      data: {
        consecutiveLimit: deviceConfig.consecutiveLimit,
        goldThreshold: deviceConfig.goldThreshold
      }
    });
  } catch (error) {
    console.error('获取配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;