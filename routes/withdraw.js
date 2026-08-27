const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const WithdrawRecord = require('../models/WithdrawRecord');
const SystemConfig = require('../models/SystemConfig');
const Admin = require('../models/Admin');
const Employee = require('../models/Employee');
const authMiddleware = require('../middleware/auth');
const { clear } = require('../utils/cache');

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

    // 通过后清理相关缓存，确保 availableBalance 实时正确
    if (record.type === 'admin') {
      const admin = await Admin.findOne({ username: record.userId });
      if (admin) {
        try {
          // ✅ 修复：key 必须与 dashboard.js L2474 的 `team_leader_commission_${_id}` 完全一致
          // 旧代码误写成 `team_leader_commission_v2_${adminId}_${adminId}`，导致缓存清不掉
          clear(`team_leader_commission_${admin._id}`);
          clear(`group-leader-commission-stats-v2-${admin._id}`);
          clear(`super_dividend_summary_admin_`);
        } catch (e) {
          console.warn('[withdraw/approve] 清除缓存失败:', e.message || e);
        }
      }
    }
    
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
        // 清理管理员相关的缓存（与 submit 保持一致）
        try {
          // ✅ 修复：key 必须与 dashboard.js L2474 的 `team_leader_commission_${_id}` 完全一致
          // 旧代码误写成 `team_leader_commission_v2_${admin._id}_${admin._id}`，导致缓存清不掉
          clear(`team_leader_commission_${admin._id}`);
          clear(`group-leader-commission-stats-v2-${admin._id}`);
          clear(`super_dividend_summary_admin_`);
        } catch (e) {
          console.warn('[withdraw/reject] 清除缓存失败:', e.message || e);
        }
      }
    } else {
      // 员工提现：返还金币（包括type为undefined的旧记录）
      if (record.employeeId) {
        await UserGold.updateOne(
          { employeeId: record.employeeId },
          { $inc: { lastMonthGold: record.goldAmount } }
        );
      }
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

// 管理员提现接口（团队长、组长、高管等）
router.post('/admin/submit', authMiddleware, async (req, res) => {
  try {
    const { amount, alipayAccount, alipayName, employeeId } = req.body;
    const adminId = req.user.id;
    
    if (!amount || !alipayAccount || !alipayName || !employeeId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 检查提现开关
    const config = await SystemConfig.findOne({ key: 'withdraw_enabled' });
    let withdrawEnabled = true;
    
    if (config) {
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
    
    // 计算本月时间范围（北京时间）
    // 现在是8月，用户提现的是上月（7月）的收益，所以要扣减本月（8月）已发起的提现
    const now = new Date();
    const bjNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const curYear = bjNow.getUTCFullYear();
    const curMonth = bjNow.getUTCMonth() + 1; // 1-based
    
    let currentMonthStart, currentMonthEnd;
    if (curMonth === 12) {
      currentMonthStart = new Date(Date.UTC(curYear, 11, 1)); // 12月1日
      currentMonthEnd = new Date(Date.UTC(curYear + 1, 0, 1)); // 1月1日
    } else {
      currentMonthStart = new Date(Date.UTC(curYear, curMonth - 1, 1)); // 本月1日
      currentMonthEnd = new Date(Date.UTC(curYear, curMonth, 1)); // 下月1日
    }
    
    // 计算本月已提现金额（待处理 + 已通过，排除已拒绝）
    let currentMonthWithdrawn = 0;
    try {
      const wdAgg = await WithdrawRecord.aggregate([
        { $match: { 
          userId: admin.username, 
          type: 'admin', 
          status: { $in: [0, 1] },
          createTime: { $gte: currentMonthStart, $lt: currentMonthEnd }
        } },
        { $group: { _id: null, sumAmount: { $sum: '$amount' } } }
      ]).exec();
      currentMonthWithdrawn = +(wdAgg?.[0]?.sumAmount || 0);
    } catch (e) {
      console.warn('[withdraw/admin/submit] 算本月已提现金额时警告：', e.message || e);
    }

    // 获取管理员角色
    const role = String(admin.role || '').toUpperCase();
    const isAdminManager = role === 'ADMIN_MANAGER';
    const isSuperAdmin = role === 'SUPER_ADMIN';
    const isTlOrGl = role === 'NORMAL_ADMIN' || role === 'GROUP_LEADER';
    
    let availableBalance;
    const dashboard = require('./dashboard');
    
    if (isAdminManager || isSuperAdmin) {
      // 高管/超管：使用动态计算的 dividendTotal
      const scopeTeamIds = admin.managedTeamIds || [];
      const kpi = await dashboard.computeSuperKpi('lastMonth', scopeTeamIds);
      availableBalance = Math.max(0, kpi.dividendTotal - currentMonthWithdrawn);
    } else if (isTlOrGl) {
      // TL/GL：使用动态计算的 lastMonth teamCommission
      const scopeKind = role === 'GROUP_LEADER' ? 'GL' : 'TL';
      const scope = { kind: scopeKind, adminId: String(admin._id) };
      if (role === 'GROUP_LEADER' && admin.teamGroupId) {
        scope.teamGroupId = admin.teamGroupId;
      }
      const kpi = await dashboard.computeNewKpi(scope, 'lastMonth');
      availableBalance = Math.max(0, (kpi.teamCommission || 0) - currentMonthWithdrawn);
    } else {
      // 其他角色：使用 Admin.commission 字段（兼容）
      availableBalance = Math.max(0, (+admin.commission || 0) - currentMonthWithdrawn);
    }

    // 检查余额是否充足（修复浮点精度：先四舍五入到2位再比较，
    // 避免 availableBalance=1099.9099999 时提交 1099.91 误判余额不足）
    const availableBalanceRounded = +availableBalance.toFixed(2);
    if (amount > availableBalanceRounded) {
      return res.status(400).json({
        success: false,
        message: `余额不足，可提现金额: ${availableBalanceRounded.toFixed(2)}`
      });
    }
    
    // 创建提现记录（直接标记为待处理）
    const withdrawRecord = new WithdrawRecord({
      userId: admin.username,
      employeeId: employeeId,
      amount,
      goldAmount: 0,
      alipayAccount,
      alipayName,
      status: 0,
      statusText: '待处理',
      createTime: new Date(),
      type: 'admin'
    });
    
    await withdrawRecord.save();
    
    // 不再扣减 Admin.commission 字段
    // availableBalance 已改为动态计算：上月收益 - 待处理提现
    // Admin.commission 字段现在专门用于存储分成比例，不再用于可提现余额
    
    try {
      // ✅ 修复：key 必须与 dashboard.js L2474 的 `team_leader_commission_${_id}` 完全一致
      // 旧代码误写成 `team_leader_commission_v2_${adminId}_${adminId}`，导致缓存清不掉
      clear(`team_leader_commission_${adminId}`);
      clear(`group-leader-commission-stats-v2-${adminId}`);
      clear(`super_dividend_summary_admin_`);
    } catch (e) {
      console.warn('[withdraw/admin/submit] 清除缓存失败:', e.message || e);
    }
    
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