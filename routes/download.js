const express = require('express');
const router = express.Router();
const SystemConfig = require('../models/SystemConfig');
const authMiddleware = require('../middleware/auth');

router.get('/', async (req, res) => {
  try {
    const downloadConfig = await SystemConfig.findOne({ key: 'downloadConfig' });
    
    if (!downloadConfig || !downloadConfig.value || !downloadConfig.value.downloadUrl) {
      return res.status(404).json({
        success: false,
        message: '下载链接未配置'
      });
    }
    
    res.redirect(downloadConfig.value.downloadUrl);
  } catch (error) {
    console.error('获取下载链接错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/config', async (req, res) => {
  try {
    const downloadConfig = await SystemConfig.findOne({ key: 'downloadConfig' }).read('primary');
    
    res.json({
      success: true,
      data: {
        downloadUrl: downloadConfig?.value?.downloadUrl || ''
      }
    });
  } catch (error) {
    console.error('获取下载配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.put('/admin/download-config', authMiddleware, async (req, res) => {
  try {
    const { downloadUrl } = req.body;
    
    if (!downloadUrl) {
      return res.status(400).json({ success: false, message: '下载链接不能为空' });
    }
    
    await SystemConfig.updateOne(
      { key: 'downloadConfig' },
      { 
        $set: {
          value: { downloadUrl },
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );
    
    const updatedConfig = await SystemConfig.findOne({ key: 'downloadConfig' }).read('primary');
    
    res.json({
      success: true,
      message: '配置更新成功',
      data: {
        downloadUrl: updatedConfig?.value?.downloadUrl || downloadUrl
      }
    });
  } catch (error) {
    console.error('更新下载配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/admin/download-config', authMiddleware, async (req, res) => {
  try {
    const downloadConfig = await SystemConfig.findOne({ key: 'downloadConfig' }).read('primary');
    
    res.json({
      success: true,
      data: {
        downloadUrl: downloadConfig?.value?.downloadUrl || ''
      }
    });
  } catch (error) {
    console.error('获取下载配置详情错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;