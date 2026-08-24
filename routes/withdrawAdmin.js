const express = require('express');
const router = express.Router();
const WithdrawRecord = require('../models/WithdrawRecord');
const UserGold = require('../models/UserGold');
const authMiddleware = require('../middleware/auth');

// 获取提现记录列表
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, employeeId, status } = req.query;
    
    let query = {};
    if (employeeId) {
      query.employeeId = employeeId;
    }
    if (status !== undefined && status !== '') {
      query.status = parseInt(status);
    }
    
    const total = await WithdrawRecord.countDocuments(query);
    
    const records = await WithdrawRecord.find(query)
      .sort({ createTime: -1 })
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize));
    
    const list = records.map(record => ({
      _id: record._id,
      userId: record.userId,
      employeeId: record.employeeId,
      amount: record.amount,
      goldAmount: record.goldAmount,
      alipayAccount: record.alipayAccount,
      alipayName: record.alipayName,
      status: record.status,
      statusText: record.statusText || (record.status === 0 ? '提现成功' : '待处理'),
      createTime: record.createTime,
      processTime: record.processTime || null,
      remark: record.remark || ''
    }));
    
    res.json({
      success: true,
      list,
      pagination: {
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      }
    });
  } catch (error) {
    console.error('获取提现记录列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 通过提现申请
router.post('/:id/approve', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    
    const record = await WithdrawRecord.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: '提现记录不存在' });
    }
    
    if (record.status === 1) {
      return res.status(400).json({ success: false, message: '该提现已通过' });
    }
    
    record.status = 1;
    record.statusText = '已通过';
    record.processTime = new Date();
    await record.save();
    
    res.json({
      success: true,
      message: '已通过'
    });
  } catch (error) {
    console.error('通过提现申请错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 拒绝提现申请
router.post('/:id/reject', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { remark } = req.body;
    
    const record = await WithdrawRecord.findById(id);
    if (!record) {
      return res.status(404).json({ success: false, message: '提现记录不存在' });
    }
    
    if (record.status === 2) {
      return res.status(400).json({ success: false, message: '该提现已拒绝' });
    }
    
    // 如果之前是通过或待处理状态，需要退还金币
    if (record.status === 1 || record.status === 0) {
      // 统一用 employeeId 查找，避免 userId 字段不一致的问题
      await UserGold.updateOne(
        { employeeId: record.employeeId },
        { $inc: { lastMonthGold: record.goldAmount } }
      );
    }
    
    record.status = 2;
    record.statusText = '已拒绝';
    record.processTime = new Date();
    record.remark = remark || '';
    await record.save();
    
    res.json({
      success: true,
      message: '已拒绝'
    });
  } catch (error) {
    console.error('拒绝提现申请错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取提现统计
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const total = await WithdrawRecord.countDocuments();
    const pending = await WithdrawRecord.countDocuments({ status: 0 });
    const approved = await WithdrawRecord.countDocuments({ status: 1 });
    const rejected = await WithdrawRecord.countDocuments({ status: 2 });
    
    const totalAmount = await WithdrawRecord.aggregate([
      { $match: { status: { $ne: 2 } } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    
    res.json({
      success: true,
      data: {
        total,
        pending,
        approved,
        rejected,
        totalAmount: totalAmount[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('获取提现统计错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
