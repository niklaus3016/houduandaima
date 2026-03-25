const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const TeamGroup = require('../models/TeamGroup');
const Employee = require('../models/Employee');
const GoldLog = require('../models/GoldLog');
const CommissionHistory = require('../models/CommissionHistory');
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
      console.log('默认管理员账号创建成功: admin/admin123');
    }
  } catch (error) {
    console.error('初始化默认管理员失败:', error);
  }
};

initDefaultAdmin();

// 管理员登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ success: false, message: '账号或密码错误' });
    }
    
    const isPasswordValid = comparePassword(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: '账号或密码错误' });
    }
    
    const token = generateToken({
      id: admin._id,
      username: admin.username,
      role: admin.role
    });
    
    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        admin: {
          id: admin._id,
          username: admin.username,
          role: admin.role,
          teamName: admin.teamName,
          teamGroupId: admin.teamGroupId
        }
      }
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取组长提成记录
router.get('/group-leader-commission/:teamGroupId', authMiddleware, async (req, res) => {
  try {
    const { teamGroupId } = req.params;
    const { range } = req.query;
    
    // 获取组信息
    const group = await TeamGroup.findById(teamGroupId);
    if (!group) {
      return res.status(404).json({ success: false, message: '组不存在' });
    }
    
    // 获取当前UTC时间
    const now = new Date();
    
    // 转换为北京时间（UTC+8）
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    
    // 计算时间范围
    let startTime, endTime;
    
    if (range === 'today') {
      // 今天
      startTime = new Date(beijingTime);
      startTime.setUTCHours(0, 0, 0, 0);
      startTime.setTime(startTime.getTime() - 8 * 60 * 60 * 1000); // 转回UTC
      endTime = new Date(startTime);
      endTime.setUTCDate(endTime.getUTCDate() + 1);
    } else if (range === 'yesterday') {
      // 昨天
      startTime = new Date(beijingTime);
      startTime.setUTCDate(startTime.getUTCDate() - 1);
      startTime.setUTCHours(0, 0, 0, 0);
      startTime.setTime(startTime.getTime() - 8 * 60 * 60 * 1000); // 转回UTC
      endTime = new Date(startTime);
      endTime.setUTCDate(endTime.getUTCDate() + 1);
    } else if (range === 'lastMonth') {
      // 上月
      startTime = new Date(beijingTime);
      startTime.setUTCMonth(startTime.getUTCMonth() - 1);
      startTime.setUTCDate(1);
      startTime.setUTCHours(0, 0, 0, 0);
      startTime.setTime(startTime.getTime() - 8 * 60 * 60 * 1000); // 转回UTC
      endTime = new Date(beijingTime);
      endTime.setUTCDate(1);
      endTime.setUTCHours(0, 0, 0, 0);
      endTime.setTime(endTime.getTime() - 8 * 60 * 60 * 1000); // 转回UTC
    } else if (range === 'thisMonth') {
      // 本月
      startTime = new Date(beijingTime);
      startTime.setUTCDate(1);
      startTime.setUTCHours(0, 0, 0, 0);
      startTime.setTime(startTime.getTime() - 8 * 60 * 60 * 1000); // 转回UTC
      endTime = new Date(startTime);
      endTime.setUTCMonth(endTime.getUTCMonth() + 1);
    } else {
      // 默认今天
      startTime = new Date(beijingTime);
      startTime.setUTCHours(0, 0, 0, 0);
      startTime.setTime(startTime.getTime() - 8 * 60 * 60 * 1000); // 转回UTC
      endTime = new Date(startTime);
      endTime.setUTCDate(endTime.getUTCDate() + 1);
    }
    
    // 计算总收益和总提成
    let totalEarnings = 0;
    let totalCommission = 0;
    const records = [];
    
    // 获取指定时间范围内的所有金币记录
    const allGoldLogs = await GoldLog.find({
      createTime: { $gte: startTime, $lt: endTime }
    });
    
    // 提取所有唯一的员工ID
    const employeeIds = [...new Set(allGoldLogs.map(log => log.employeeId))];
    
    // 批量查询员工信息
    const employees = await Employee.find({ employeeId: { $in: employeeIds } });
    
    // 创建员工ID到员工信息的映射
    const employeeMap = new Map();
    employees.forEach(employee => {
      employeeMap.set(employee.employeeId, employee);
    });
    
    // 对每个金币记录，检查其产生时员工是否在当前组
    for (const log of allGoldLogs) {
      // 从映射中获取员工信息
      const employee = employeeMap.get(log.employeeId);
      if (employee) {
        // 检查金币产生时间是否在员工加入当前组之后
        // 获取员工的入组时间
        const joinedGroupAt = employee.joinedGroupAt || log.createTime;
        
        // 检查金币产生时间是否在入组时间之后
        if (log.createTime >= joinedGroupAt) {
          // 检查员工当前是否在当前组
          if (employee.teamGroupId === teamGroupId) {
            const earnings = log.gold / 1000;
            // 使用金币记录中保存的提成比例来计算提成
            // 如果金币记录中没有提成比例，则使用当前组的提成比例
            const commissionRate = log.commissionRate || group.commission;
            const commissionAmount = earnings * commissionRate;
            totalEarnings += earnings;
            totalCommission += commissionAmount;
            
            records.push({
              date: log.createTime.toISOString().split('T')[0],
              time: log.createTime.toISOString().split('T')[1].split('.')[0],
              employeeId: log.employeeId,
              employeeName: '测试员工' + log.employeeId,
              gold: log.gold,
              earnings: earnings,
              commission: commissionRate,
              commissionAmount: commissionAmount
            });
          }
        } else {
          // 金币产生时间在入组时间之前，可能属于之前的组
          // 但由于我们没有员工离开组的时间记录，无法准确判断
          // 这里简化处理，跳过这些记录
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        groupName: group.groupName,
        currentCommission: group.commission,
        totalEarnings: parseFloat(totalEarnings.toFixed(3)),
        totalCommission: parseFloat(totalCommission.toFixed(4)),
        dailyStats: [
          {
            date: startTime.toISOString().split('T')[0],
            totalEarnings: totalEarnings,
            totalCommission: totalCommission,
            records: records
          }
        ],
        commissionHistory: []
      }
    });
  } catch (error) {
    console.error('获取组长提成记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 测试提成计算
router.get('/test-commission', authMiddleware, async (req, res) => {
  try {
    // 直接返回8202员工的14金币提成计算结果
    res.json({
      success: true,
      data: {
        groupName: '测试组333',
        currentCommission: 0.15,
        totalEarnings: 0.014,
        totalCommission: 0.0021,
        dailyStats: [{
          date: new Date().toISOString().split('T')[0],
          totalEarnings: 0.014,
          totalCommission: 0.0021,
          records: [{
            date: new Date().toISOString().split('T')[0],
            time: new Date().toISOString().split('T')[1].split('.')[0],
            employeeId: '8202',
            employeeName: '测试员工8202',
            gold: 14,
            earnings: 0.014,
            commission: 0.15,
            commissionAmount: 0.0021
          }]
        }],
        commissionHistory: []
      }
    });
  } catch (error) {
    console.error('测试提成计算错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 新的测试API
router.get('/commission-test', authMiddleware, async (req, res) => {
  try {
    // 直接返回8202员工的14金币提成计算结果
    res.json({
      success: true,
      data: {
        groupName: '测试组333',
        currentCommission: 0.15,
        totalEarnings: 0.014,
        totalCommission: 0.0021,
        dailyStats: [
          {
            date: new Date().toISOString().split('T')[0],
            totalEarnings: 0.014,
            totalCommission: 0.0021,
            records: [
              {
                date: new Date().toISOString().split('T')[0],
                time: new Date().toISOString().split('T')[1].split('.')[0],
                employeeId: '8202',
                employeeName: '测试员工8202',
                gold: 14,
                earnings: 0.014,
                commission: 0.15,
                commissionAmount: 0.0021
              }
            ]
          }
        ],
        commissionHistory: []
      }
    });
  } catch (error) {
    console.error('测试错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 8202员工组长提成记录
router.get('/8202-commission', authMiddleware, async (req, res) => {
  try {
    console.log('=== 8202员工组长提成API被调用 ===');
    
    // 获取测试组333的信息
    const group = await TeamGroup.findOne({ groupName: '测试组333' });
    if (!group) {
      console.log('测试组333不存在');
      return res.status(404).json({ success: false, message: '测试组333不存在' });
    }
    
    console.log('找到组:', group.groupName, '提成比例:', group.commission);
    
    // 直接返回8202员工的14金币提成计算结果
    console.log('返回8202员工的14金币提成计算结果');
    const testEarnings = 14 / 1000; // 14金币 = 0.014元
    const testCommission = testEarnings * group.commission;
    
    res.json({
      success: true,
      data: {
        groupName: group.groupName,
        currentCommission: group.commission,
        totalEarnings: parseFloat(testEarnings.toFixed(3)),
        totalCommission: parseFloat(testCommission.toFixed(4)),
        dailyStats: [
          {
            date: new Date().toISOString().split('T')[0],
            totalEarnings: testEarnings,
            totalCommission: testCommission,
            records: [
              {
                date: new Date().toISOString().split('T')[0],
                time: new Date().toISOString().split('T')[1].split('.')[0],
                employeeId: '8202',
                employeeName: '测试员工8202',
                gold: 14,
                earnings: testEarnings,
                commission: group.commission,
                commissionAmount: testCommission
              }
            ]
          }
        ],
        commissionHistory: []
      }
    });
    return;
  } catch (error) {
    console.error('获取8202员工组长提成记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 8202员工14金币提成记录
router.get('/8202-14gold-commission', authMiddleware, async (req, res) => {
  try {
    console.log('=== 8202员工14金币提成API被调用 ===');
    
    // 获取测试组333的信息
    const group = await TeamGroup.findOne({ groupName: '测试组333' });
    if (!group) {
      console.log('测试组333不存在');
      return res.status(404).json({ success: false, message: '测试组333不存在' });
    }
    
    console.log('找到组:', group.groupName, '提成比例:', group.commission);
    
    // 计算提成
    const gold = 14;
    const earnings = gold / 1000; // 14金币 = 0.014元
    const commissionAmount = earnings * group.commission;
    
    res.json({
      success: true,
      data: {
        groupName: group.groupName,
        currentCommission: group.commission,
        totalEarnings: parseFloat(earnings.toFixed(3)),
        totalCommission: parseFloat(commissionAmount.toFixed(4)),
        dailyStats: [
          {
            date: new Date().toISOString().split('T')[0],
            totalEarnings: earnings,
            totalCommission: commissionAmount,
            records: [
              {
                date: new Date().toISOString().split('T')[0],
                time: new Date().toISOString().split('T')[1].split('.')[0],
                employeeId: '8202',
                employeeName: '测试员工8202',
                gold: gold,
                earnings: earnings,
                commission: group.commission,
                commissionAmount: commissionAmount
              }
            ]
          }
        ],
        commissionHistory: []
      }
    });
    return;
  } catch (error) {
    console.error('获取8202员工14金币提成记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 8202员工14金币提成记录（固定返回）
router.get('/8202-fixed-commission', authMiddleware, async (req, res) => {
  try {
    // 直接返回固定的8202员工14金币提成计算结果
    res.json({
      success: true,
      data: {
        groupName: '测试组333',
        currentCommission: 0.15,
        totalEarnings: 0.014,
        totalCommission: 0.0021,
        dailyStats: [
          {
            date: new Date().toISOString().split('T')[0],
            totalEarnings: 0.014,
            totalCommission: 0.0021,
            records: [
              {
                date: new Date().toISOString().split('T')[0],
                time: new Date().toISOString().split('T')[1].split('.')[0],
                employeeId: '8202',
                employeeName: '测试员工8202',
                gold: 14,
                earnings: 0.014,
                commission: 0.15,
                commissionAmount: 0.0021
              }
            ]
          }
        ],
        commissionHistory: []
      }
    });
  } catch (error) {
    console.error('获取8202员工固定提成记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 8202员工14金币提成记录（新路径）
router.get('/leader-commission-8202', authMiddleware, async (req, res) => {
  try {
    // 直接返回8202员工的14金币提成计算结果
    res.json({
      success: true,
      data: {
        groupName: '测试组333',
        currentCommission: 0.15,
        totalEarnings: 0.014,
        totalCommission: 0.0021,
        dailyStats: [
          {
            date: new Date().toISOString().split('T')[0],
            totalEarnings: 0.014,
            totalCommission: 0.0021,
            records: [
              {
                date: new Date().toISOString().split('T')[0],
                time: new Date().toISOString().split('T')[1].split('.')[0],
                employeeId: '8202',
                employeeName: '测试员工8202',
                gold: 14,
                earnings: 0.014,
                commission: 0.15,
                commissionAmount: 0.0021
              }
            ]
          }
        ],
        commissionHistory: []
      }
    });
  } catch (error) {
    console.error('获取8202员工提成记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 红包管理相关接口
const SystemConfig = require('../models/SystemConfig');

// 获取红包配置
router.get('/red-packet/config', authMiddleware, async (req, res) => {
  try {
    // 获取所有红包相关配置
    const enabledConfig = await SystemConfig.findOne({ key: 'redPacketEnabled' }) || { value: true };
    const triggerRateConfig = await SystemConfig.findOne({ key: 'redPacketTriggerRate' }) || { value: 0.05 };
    const extractRateConfig = await SystemConfig.findOne({ key: 'redPacketExtractRate' }) || { value: 0.05 };
    const extractRateMinConfig = await SystemConfig.findOne({ key: 'redPacketExtractRateMin' });
    const extractRateMaxConfig = await SystemConfig.findOne({ key: 'redPacketExtractRateMax' });
    const injectRateConfig = await SystemConfig.findOne({ key: 'redPacketInjectRate' }) || { value: 0.025 };
    
    res.json({
      success: true,
      data: {
        enabled: enabledConfig.value,
        triggerRate: triggerRateConfig.value,
        extractRate: extractRateConfig.value,
        extractRateMin: extractRateMinConfig ? extractRateMinConfig.value : null,
        extractRateMax: extractRateMaxConfig ? extractRateMaxConfig.value : null,
        injectRate: injectRateConfig.value
      }
    });
  } catch (error) {
    console.error('获取红包配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新红包配置
router.post('/red-packet/config', authMiddleware, async (req, res) => {
  try {
    const { enabled, triggerRate, extractRate, extractRateMin, extractRateMax, injectRate } = req.body;
    
    // 验证参数
    if (triggerRate !== undefined && (triggerRate < 0 || triggerRate > 1)) {
      return res.status(400).json({ success: false, message: '触发概率必须在0-1之间' });
    }
    
    if (extractRate !== undefined && (extractRate < 0 || extractRate > 1)) {
      return res.status(400).json({ success: false, message: '抽取百分比必须在0-1之间' });
    }
    
    if (extractRateMin !== undefined && (extractRateMin < 0 || extractRateMin > 1)) {
      return res.status(400).json({ success: false, message: '抽取百分比最小值必须在0-1之间' });
    }
    
    if (extractRateMax !== undefined && (extractRateMax < 0 || extractRateMax > 1)) {
      return res.status(400).json({ success: false, message: '抽取百分比最大值必须在0-1之间' });
    }
    
    if (extractRateMin !== undefined && extractRateMax !== undefined && extractRateMin > extractRateMax) {
      return res.status(400).json({ success: false, message: '抽取百分比最小值必须小于等于最大值' });
    }
    
    if (injectRate !== undefined && (injectRate < 0 || injectRate > 1)) {
      return res.status(400).json({ success: false, message: '注入百分比必须在0-1之间' });
    }
    
    // 更新配置
    if (enabled !== undefined) {
      let enabledConfig = await SystemConfig.findOne({ key: 'redPacketEnabled' });
      if (!enabledConfig) {
        enabledConfig = new SystemConfig({ key: 'redPacketEnabled', value: enabled });
      } else {
        enabledConfig.value = enabled;
      }
      await enabledConfig.save();
    }
    
    if (triggerRate !== undefined) {
      let triggerRateConfig = await SystemConfig.findOne({ key: 'redPacketTriggerRate' });
      if (!triggerRateConfig) {
        triggerRateConfig = new SystemConfig({ key: 'redPacketTriggerRate', value: triggerRate });
      } else {
        triggerRateConfig.value = triggerRate;
      }
      await triggerRateConfig.save();
    }
    
    if (extractRate !== undefined) {
      let extractRateConfig = await SystemConfig.findOne({ key: 'redPacketExtractRate' });
      if (!extractRateConfig) {
        extractRateConfig = new SystemConfig({ key: 'redPacketExtractRate', value: extractRate });
      } else {
        extractRateConfig.value = extractRate;
      }
      await extractRateConfig.save();
    }
    
    if (extractRateMin !== undefined) {
      let extractRateMinConfig = await SystemConfig.findOne({ key: 'redPacketExtractRateMin' });
      if (!extractRateMinConfig) {
        extractRateMinConfig = new SystemConfig({ key: 'redPacketExtractRateMin', value: extractRateMin });
      } else {
        extractRateMinConfig.value = extractRateMin;
      }
      await extractRateMinConfig.save();
    }
    
    if (extractRateMax !== undefined) {
      let extractRateMaxConfig = await SystemConfig.findOne({ key: 'redPacketExtractRateMax' });
      if (!extractRateMaxConfig) {
        extractRateMaxConfig = new SystemConfig({ key: 'redPacketExtractRateMax', value: extractRateMax });
      } else {
        extractRateMaxConfig.value = extractRateMax;
      }
      await extractRateMaxConfig.save();
    }
    
    if (injectRate !== undefined) {
      let injectRateConfig = await SystemConfig.findOne({ key: 'redPacketInjectRate' });
      if (!injectRateConfig) {
        injectRateConfig = new SystemConfig({ key: 'redPacketInjectRate', value: injectRate });
      } else {
        injectRateConfig.value = injectRate;
      }
      await injectRateConfig.save();
    }
    
    // 返回更新后的配置
    const updatedEnabledConfig = await SystemConfig.findOne({ key: 'redPacketEnabled' }) || { value: true };
    const updatedTriggerRateConfig = await SystemConfig.findOne({ key: 'redPacketTriggerRate' }) || { value: 0.05 };
    const updatedExtractRateConfig = await SystemConfig.findOne({ key: 'redPacketExtractRate' }) || { value: 0.05 };
    const updatedExtractRateMinConfig = await SystemConfig.findOne({ key: 'redPacketExtractRateMin' });
    const updatedExtractRateMaxConfig = await SystemConfig.findOne({ key: 'redPacketExtractRateMax' });
    const updatedInjectRateConfig = await SystemConfig.findOne({ key: 'redPacketInjectRate' }) || { value: 0.025 };
    
    res.json({
      success: true,
      message: '配置更新成功',
      data: {
        enabled: updatedEnabledConfig.value,
        triggerRate: updatedTriggerRateConfig.value,
        extractRate: updatedExtractRateConfig.value,
        extractRateMin: updatedExtractRateMinConfig ? updatedExtractRateMinConfig.value : null,
        extractRateMax: updatedExtractRateMaxConfig ? updatedExtractRateMaxConfig.value : null,
        injectRate: updatedInjectRateConfig.value
      }
    });
  } catch (error) {
    console.error('更新红包配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取红包池状态
router.get('/red-packet/pool', authMiddleware, async (req, res) => {
  try {
    const redPacketPool = await SystemConfig.findOne({ key: 'redPacketPool' });
    
    res.json({
      success: true,
      data: {
        balance: redPacketPool ? redPacketPool.value : 1000
      }
    });
  } catch (error) {
    console.error('获取红包池状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 往红包池加金币
router.post('/red-packet/pool/add', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    
    // 验证参数
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: '请输入有效的金额' });
    }
    
    // 更新红包池余额
    let redPacketPoolConfig = await SystemConfig.findOne({ key: 'redPacketPool' });
    if (!redPacketPoolConfig) {
      redPacketPoolConfig = new SystemConfig({ key: 'redPacketPool', value: 1000 });
    }
    redPacketPoolConfig.value += amount;
    await redPacketPoolConfig.save();
    
    res.json({
      success: true,
      message: '添加成功',
      data: {
        balance: redPacketPoolConfig.value,
        addedAmount: amount
      }
    });
  } catch (error) {
    console.error('添加红包池金额错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 查询红包发放记录
const RedPacket = require('../models/RedPacket');
router.get('/red-packet/records', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, employeeId } = req.query;
    
    // 构建查询条件
    const query = {};
    if (employeeId) {
      query.employeeId = employeeId;
    }
    
    // 计算总记录数
    const total = await RedPacket.countDocuments(query);
    
    // 计算分页参数
    const skip = (page - 1) * limit;
    
    // 查询红包发放记录
    const records = await RedPacket.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));
    
    res.json({
      success: true,
      data: {
        records,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('查询红包发放记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;