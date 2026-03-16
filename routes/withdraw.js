const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const WithdrawRecord = require('../models/WithdrawRecord');
const SystemConfig = require('../models/SystemConfig');
const authMiddleware = require('../middleware/auth');

// 初始化提现开关配置
const initWithdrawConfig = async () => {
  try {
    const config = await SystemConfig.findOne({ key: 'withdraw_enabled' });
    if (!config) {
      await SystemConfig.create({
        key: 'withdraw_enabled',
        value: {
          enabled: true,
          message: '提现功能已开启'
        }
      });
      console.log('提现开关配置已初始化');
    }
  } catch (error) {
    console.error('初始化提现开关配置失败:', error);
  }
};

initWithdrawConfig();

// 获取提现开关状态
router.get('/status', async (req, res) => {
  try {
    const config = await SystemConfig.findOne({ key: 'withdraw_enabled' });
    
    if (!config) {
      return res.json({
        success: true,
        data: {
          enabled: true,
          message: '提现功能已开启'
        }
      });
    }
    
    res.json({
      success: true,
      data: config.value
    });
  } catch (error) {
    console.error('获取提现开关状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 提交提现申请（简化版：提交即成功）
router.post('/submit', async (req, res) => {
  try {
    const { userId, employeeId, amount, goldAmount, alipayAccount, alipayName } = req.body;
    
    if (!userId || !employeeId || !amount || !goldAmount || !alipayAccount || !alipayName) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 检查提现开关
    const config = await SystemConfig.findOne({ key: 'withdraw_enabled' });
    if (config && !config.value.enabled) {
      return res.status(400).json({ success: false, message: config.value.message || '提现功能已关闭' });
    }
    
    // 查询用户当前金币
    const user = await UserGold.findOne({ userId, employeeId });
    
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    // 检查金币是否足够（使用上月金币）
    if (user.lastMonthGold < goldAmount) {
      return res.status(400).json({ success: false, message: '上月金币不足' });
    }
    
    // 扣除金币（原子操作）
    await UserGold.updateOne(
      { userId, employeeId },
      { $inc: { lastMonthGold: -goldAmount } }
    );
    
    // 创建提现记录（直接标记为成功）
    const withdrawRecord = new WithdrawRecord({
      userId,
      employeeId,
      amount,
      goldAmount,
      alipayAccount,
      alipayName,
      status: 0,
      statusText: '提现成功',
      createTime: new Date()
    });
    
    await withdrawRecord.save();
    
    // 获取更新后的用户金币
    const updatedUser = await UserGold.findOne({ userId, employeeId });
    
    res.json({
      success: true,
      data: {
        _id: withdrawRecord._id,
        userId: withdrawRecord.userId,
        employeeId: withdrawRecord.employeeId,
        amount: withdrawRecord.amount,
        goldAmount: withdrawRecord.goldAmount,
        alipayAccount: withdrawRecord.alipayAccount,
        alipayName: withdrawRecord.alipayName,
        status: withdrawRecord.status,
        statusText: withdrawRecord.statusText,
        createTime: withdrawRecord.createTime,
        remainingGold: updatedUser.lastMonthGold
      }
    });
  } catch (error) {
    console.error('提交提现申请错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取提现记录列表（用户端）
router.get('/list', async (req, res) => {
  try {
    const { userId, page = 1, pageSize = 20, employeeId, status } = req.query;
    
    // 如果有userId，返回用户端的提现记录
    if (userId) {
      const records = await WithdrawRecord.find({ userId })
        .sort({ createTime: -1 })
        .limit(50);
      
      return res.json({
        success: true,
        data: records
      });
    }
    
    // 管理端：返回所有提现记录
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
      status: record.status === 0 ? 'pending' : record.status === 1 ? 'approved' : 'rejected',
      statusText: record.statusText || (record.status === 0 ? '待处理' : record.status === 1 ? '已通过' : '已拒绝'),
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

// 获取所有提现记录（管理端）
router.get('/admin/list', authMiddleware, async (req, res) => {
  try {
    const { page = 1, pageSize = 20, employeeId, status } = req.query;
    
    // 构建查询条件
    let query = {};
    if (employeeId) {
      query.employeeId = employeeId;
    }
    if (status !== undefined && status !== '') {
      query.status = parseInt(status);
    }
    
    // 获取总数
    const total = await WithdrawRecord.countDocuments(query);
    
    // 获取记录列表
    const records = await WithdrawRecord.find(query)
      .sort({ createTime: -1 })
      .skip((page - 1) * pageSize)
      .limit(parseInt(pageSize));
    
    res.json({
      success: true,
      data: {
        list: records,
        pagination: {
          total,
          page: parseInt(page),
          pageSize: parseInt(pageSize)
        }
      }
    });
  } catch (error) {
    console.error('获取提现记录列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 设置提现开关（管理端）
router.post('/admin/set-status', authMiddleware, async (req, res) => {
  try {
    const { enabled, message } = req.body;
    
    if (typeof enabled === 'undefined') {
      return res.status(400).json({ success: false, message: '缺少enabled参数' });
    }
    
    // 更新或创建配置
    await SystemConfig.findOneAndUpdate(
      { key: 'withdraw_enabled' },
      {
        value: {
          enabled: enabled,
          message: message || (enabled ? '提现功能已开启' : '提现功能已关闭')
        },
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );
    
    res.json({
      success: true,
      message: '提现开关设置成功',
      data: {
        enabled: enabled,
        message: message || (enabled ? '提现功能已开启' : '提现功能已关闭')
      }
    });
  } catch (error) {
    console.error('设置提现开关错误:', error);
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
    
    // 返还金币
    await UserGold.updateOne(
      { userId: record.userId, employeeId: record.employeeId },
      { $inc: { lastMonthGold: record.goldAmount } }
    );
    
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

module.exports = router;