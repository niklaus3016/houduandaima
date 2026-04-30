const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const WithdrawRecord = require('../models/WithdrawRecord');
const SystemConfig = require('../models/SystemConfig');
const Admin = require('../models/Admin');
const Employee = require('../models/Employee');
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

// 健康检查接口
router.get('/health', async (req, res) => {
  res.json({ success: true, message: '提现接口服务正常' });
});

// 测试接口
router.post('/test', async (req, res) => {
  res.json({ success: true, message: '测试接口正常' });
});

// 新的提现接口
router.post('/new-submit', async (req, res) => {
  try {
    const { userId, employeeId, amount, goldAmount, alipayAccount, alipayName } = req.body;

    if (!userId || !employeeId || !amount || !goldAmount || !alipayAccount || !alipayName) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    // 检查余额是否足够
    const userGold = await UserGold.findOne({ employeeId: employeeId });
    if (!userGold || userGold.lastMonthGold < goldAmount) {
      return res.status(400).json({ success: false, message: '余额不足' });
    }

    // 创建提现记录（待处理状态）
    const withdrawRecord = new WithdrawRecord({
      userId: employeeId,
      employeeId: employeeId,
      amount,
      goldAmount,
      alipayAccount,
      alipayName,
      status: 0,
      statusText: '待处理',
      createTime: new Date(),
      type: 'employee'
    });

    // 原子操作：检查并扣除金币（防止并发导致负数）
    const result = await UserGold.updateOne(
      { employeeId: employeeId, lastMonthGold: { $gte: goldAmount } },
      { $inc: { lastMonthGold: -goldAmount } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ success: false, message: '余额不足或并发冲突' });
    }

    await withdrawRecord.save();

    const remainingGold = userGold.lastMonthGold - goldAmount;

    res.json({
      success: true,
      message: '提现申请提交成功',
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
        remainingGold: remainingGold
      }
    });
  } catch (error) {
    console.error('提交提现申请错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取提现开关状态
let withdrawStatusCache = null;
let withdrawStatusCacheTime = 0;
const WITHDRAW_STATUS_CACHE_TTL = 60000;

router.get('/status', async (req, res) => {
  try {
    if (withdrawStatusCache && (Date.now() - withdrawStatusCacheTime) < WITHDRAW_STATUS_CACHE_TTL) {
      return res.json({ success: true, data: withdrawStatusCache });
    }

    const config = await SystemConfig.findOne({ key: 'withdraw_enabled' });
    const data = config?.value || { enabled: true, message: '提现功能已开启' };

    withdrawStatusCache = data;
    withdrawStatusCacheTime = Date.now();

    res.json({ success: true, data });
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

    // 检查余额是否足够
    const userGold = await UserGold.findOne({ employeeId: employeeId });
    if (!userGold || userGold.lastMonthGold < goldAmount) {
      return res.status(400).json({ success: false, message: '余额不足' });
    }

    // 创建提现记录（待处理状态）
    const withdrawRecord = new WithdrawRecord({
      userId: employeeId,
      employeeId: employeeId,
      amount,
      goldAmount,
      alipayAccount,
      alipayName,
      status: 0,
      statusText: '待处理',
      createTime: new Date(),
      type: 'employee'
    });

    // 原子操作：检查并扣除金币（防止并发导致负数）
    const result = await UserGold.updateOne(
      { employeeId: employeeId, lastMonthGold: { $gte: goldAmount } },
      { $inc: { lastMonthGold: -goldAmount } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ success: false, message: '余额不足或并发冲突' });
    }

    await withdrawRecord.save();

    const remainingGold = userGold.lastMonthGold - goldAmount;

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
        remainingGold: remainingGold
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
    
    // 根据提类型处理返还
    if (record.type === 'admin') {
      // 管理员提现：返还提成
      const admin = await Admin.findOne({ username: record.userId });
      if (admin) {
        await Admin.findByIdAndUpdate(
          admin._id,
          { $inc: { commission: record.amount } }
        );
      }
    } else {
      // 员工提现：返还金币（包括type为undefined的旧记录）
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

// 管理员提现接口（团队长、组长等）
router.post('/admin/submit', authMiddleware, async (req, res) => {
  try {
    const { amount, alipayAccount, alipayName, employeeId, lastMonthCommission } = req.body;
    const adminId = req.user.id;
    
    if (!amount || !alipayAccount || !alipayName || !employeeId || lastMonthCommission === undefined) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 检查提现开关
    const config = await SystemConfig.findOne({ key: 'withdraw_enabled' });
    let withdrawEnabled = true;
    
    if (config) {
      // 处理两种情况：config.value是布尔值或对象
      if (typeof config.value === 'boolean') {
        withdrawEnabled = config.value;
      } else if (typeof config.value === 'object' && config.value !== null) {
        withdrawEnabled = config.value.enabled !== false;
      }
    }
    
    if (!withdrawEnabled) {
      return res.status(400).json({ success: false, message: '提现功能已关闭' });
    }
    
    // 查询管理员信息
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ success: false, message: '管理员不存在' });
    }
    
    // 检查是否是本月第一次提现，如果commission为0则用lastMonthCommission初始化
    let availableBalance = admin.commission;
    if (availableBalance === 0) {
      // 使用UTC时间计算本月开始，避免时区问题
      const nowUTC = new Date();
      const monthStartUTC = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), 1));
      
      const thisMonthWithdrawals = await WithdrawRecord.countDocuments({
        userId: admin.username,
        type: 'admin',
        createTime: { $gte: monthStartUTC }
      });
      
      if (thisMonthWithdrawals === 0) {
        // 本月第一次提现，用lastMonthCommission初始化
        availableBalance = lastMonthCommission;
      }
    }
    
    // 检查余额
    if (availableBalance < amount) {
      return res.status(400).json({ success: false, message: '余额不足' });
    }
    
    // 扣除提成（原子操作）
    await Admin.findByIdAndUpdate(
      adminId,
      { $set: { commission: availableBalance - amount } }
    );
    
    // 创建提现记录（直接标记为待处理）
    const withdrawRecord = new WithdrawRecord({
      userId: admin.username, // 使用管理员用户名作为userId
      employeeId: employeeId, // 使用前端传入的员工号
      amount,
      goldAmount: 0, // 管理员不需要金币
      alipayAccount,
      alipayName,
      status: 0,
      statusText: '待处理',
      createTime: new Date(),
      type: 'admin' // 标记为管理员提现
    });
    
    await withdrawRecord.save();
    
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
        remainingCommission: parseFloat((availableBalance - amount).toFixed(2))
      }
    });
  } catch (error) {
    console.error('管理员提现错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;