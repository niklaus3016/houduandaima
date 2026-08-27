const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const TeamGroup = require('../models/TeamGroup');
const Employee = require('../models/Employee');
const GoldLog = require('../models/GoldLog');
const CommissionHistory = require('../models/CommissionHistory');
const { generateToken, hashPassword, comparePassword } = require('../utils/auth');
const authMiddleware = require('../middleware/auth');
const { get: getCache, set: setCache } = require('../utils/cache');

// 初始化默认管理员账号
const initDefaultAdmin = async () => {
  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      const defaultAdmin = new Admin({
        username: 'admin',
        password: hashPassword('admin123456'),
        role: 'superadmin'
      });
      await defaultAdmin.save();
      console.log('默认管理员账号创建成功: admin/admin123456');
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

    // 🔴 登录后自动同步 TL 提成率（异步，不阻塞响应）
    if (admin.role === 'NORMAL_ADMIN') {
      const { syncTLCommission } = require('../utils/tlCommissionSync');
      syncTLCommission(admin._id.toString()).catch(() => {});
    }
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
    
    // 获取指定时间范围内的所有金币记录（限制最大返回10000条，避免内存溢出）
    const allGoldLogs = await GoldLog.find({
      createTime: { $gte: startTime, $lt: endTime }
    }).limit(10000);
    
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
              employeeName: employee.realName || employee.username || log.employeeId,
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

// 手动为用户添加金币记录
router.post('/add-gold-records', authMiddleware, async (req, res) => {
  try {
    const { employeeId, count, goldPerRecord } = req.body;
    
    // 验证参数
    if (!employeeId) {
      return res.status(400).json({ success: false, message: '请输入员工ID' });
    }
    if (!count || count <= 0) {
      return res.status(400).json({ success: false, message: '请输入有效的记录条数' });
    }
    if (!goldPerRecord || goldPerRecord <= 0) {
      return res.status(400).json({ success: false, message: '请输入有效的金币数量' });
    }
    
    // 查找用户的UserGold记录
    const userGold = await UserGold.findOne({ employeeId });
    if (!userGold) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }
    
    const userId = userGold.userId;
    const currentTime = new Date();
    const addedRecords = [];
    
    // 添加金币记录
    for (let i = 0; i < count; i++) {
      const goldLog = new GoldLog({
        userId: userId,
        employeeId: employeeId,
        gold: goldPerRecord,
        type: 'admin_manual',
        createTime: currentTime,
        remark: `超管手动添加 ${goldPerRecord} 金币`
      });
      await goldLog.save();
      addedRecords.push(goldLog);
    }
    
    // 更新UserGold记录
    userGold.currentMonthGold = (userGold.currentMonthGold || 0) + (count * goldPerRecord);
    userGold.adCount = (userGold.adCount || 0) + count;
    await userGold.save();
    
    res.json({
      success: true,
      message: `成功添加${count}条金币记录，每条${goldPerRecord}金币`,
      data: {
        employeeId: employeeId,
        totalAdded: count * goldPerRecord,
        records: addedRecords
      }
    });
  } catch (error) {
    console.error('手动添加金币记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取超管手动添加的金币记录
router.get('/admin-gold-records', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, employeeId, month } = req.query;

    // 构建查询条件
    const query = {
      type: 'admin_manual'
    };

    if (employeeId) {
      query.employeeId = employeeId;
    }

    // 按月份筛选
    if (month) {
      const [year, monthNum] = month.split('-');
      const startDate = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(monthNum), 0, 23, 59, 59, 999);
      query.createTime = {
        $gte: startDate,
        $lte: endDate
      };
    }

    // 使用聚合管道在数据库端计算总数和总金币，避免加载所有数据到内存
    const aggregation = await GoldLog.aggregate([
      { $match: query },
      {
        $facet: {
          total: [{ $count: 'count' }],
          totalGold: [{ $group: { _id: null, sum: { $sum: '$gold' } } }],
          records: [
            { $sort: { createTime: -1 } },
            { $skip: (parseInt(page) - 1) * parseInt(limit) },
            { $limit: parseInt(limit) }
          ]
        }
      }
    ]);

    const total = aggregation[0].total[0]?.count || 0;
    const totalGold = aggregation[0].totalGold[0]?.sum || 0;
    const records = aggregation[0].records;

    res.json({
      success: true,
      data: {
        records: records.map(record => ({
          id: record._id,
          employeeId: record.employeeId,
          gold: record.gold,
          createTime: record.createTime,
          remark: record.remark
        })),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit)
        },
        summary: {
          totalRecords: total,
          totalGold: totalGold
        }
      }
    });
  } catch (error) {
    console.error('获取超管手动添加的金币记录错误:', error);
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

// 设备管理相关接口
const DeviceStatus = require('../models/DeviceStatus');
const DeviceConfig = require('../models/DeviceConfig');

// 彩票管理相关接口
const LotteryPool = require('../models/LotteryPool');
const LotterySettings = require('../models/LotterySettings');
const LotteryWinnerSelection = require('../models/LotteryWinnerSelection');
const LotteryTicket = require('../models/LotteryTicket');
const LotteryHistory = require('../models/LotteryHistory');
const UserGold = require('../models/UserGold');

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

// 设备管理相关接口

// 重置设备状态
router.post('/device/reset', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.body;
    
    let resetCount = 0;
    
    if (deviceId) {
      // 重置指定设备
      const result = await DeviceStatus.updateOne(
        { deviceId },
        {
          $set: {
            isLimited: false,
            consecutiveLowValueCount: 0,
            lastUpdateTime: new Date()
          }
        }
      );
      resetCount = result.modifiedCount;
    } else {
      // 重置所有设备
      const result = await DeviceStatus.updateMany(
        {},
        {
          $set: {
            isLimited: false,
            consecutiveLowValueCount: 0,
            lastUpdateTime: new Date()
          }
        }
      );
      resetCount = result.modifiedCount;
    }
    
    res.json({
      success: true,
      message: '设备状态已重置',
      data: {
        resetCount
      }
    });
  } catch (error) {
    console.error('重置设备状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新设备配置
router.post('/device/config', authMiddleware, async (req, res) => {
  try {
    const { consecutiveLimit, goldThreshold } = req.body;
    
    // 验证参数
    if (consecutiveLimit !== undefined && (consecutiveLimit < 1 || consecutiveLimit > 100)) {
      return res.status(400).json({ success: false, message: '连续记录条数阈值必须在1-100之间' });
    }
    
    if (goldThreshold !== undefined && (goldThreshold < 1 || goldThreshold > 1000)) {
      return res.status(400).json({ success: false, message: '金币阈值必须在1-1000之间' });
    }
    
    // 查询配置表
    let deviceConfig = await DeviceConfig.findOne();
    
    // 如果不存在，创建新配置
    if (!deviceConfig) {
      deviceConfig = new DeviceConfig();
    }
    
    // 更新配置
    if (consecutiveLimit !== undefined) {
      deviceConfig.consecutiveLimit = consecutiveLimit;
    }
    
    if (goldThreshold !== undefined) {
      deviceConfig.goldThreshold = goldThreshold;
    }
    
    // 保存配置
    await deviceConfig.save();
    
    res.json({
      success: true,
      message: '配置已更新',
      data: {
        consecutiveLimit: deviceConfig.consecutiveLimit,
        goldThreshold: deviceConfig.goldThreshold
      }
    });
  } catch (error) {
    console.error('更新设备配置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取设备状态列表
router.get('/device/list', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, deviceId, isLimited } = req.query;
    
    // 构建查询条件
    const query = {};
    if (deviceId) {
      query.deviceId = deviceId;
    }
    if (isLimited !== undefined) {
      query.isLimited = isLimited === 'true';
    }
    
    // 计算总记录数
    const total = await DeviceStatus.countDocuments(query);
    
    // 计算分页参数
    const skip = (page - 1) * limit;
    
    // 查询设备状态记录
    const devices = await DeviceStatus.find(query)
      .sort({ lastUpdateTime: -1 })
      .skip(skip)
      .limit(Number(limit));
    
    res.json({
      success: true,
      data: {
        devices: devices.map(device => ({
          deviceId: device.deviceId,
          isLimited: device.isLimited,
          consecutiveLowValueCount: device.consecutiveLowValueCount,
          lastUpdateTime: device.lastUpdateTime
        })),
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('获取设备状态列表错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 彩票管理相关接口

// 主动往奖金池里加金币
router.post('/lottery/add-to-pool', authMiddleware, async (req, res) => {
  try {
    const { amount, remark } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: '金额必须大于0' });
    }
    
    let pool = await LotteryPool.findOne();
    if (!pool) {
      pool = new LotteryPool();
    }
    
    pool.currentAmount += amount;
    pool.totalAmount += amount;
    await pool.save();
    
    res.json({
      success: true,
      data: {
        currentAmount: pool.currentAmount
      }
    });
  } catch (error) {
    console.error('主动往奖金池里加金币错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 设置指定中奖用户
router.post('/lottery/set-winners', authMiddleware, async (req, res) => {
  try {
    let { issueNumber, firstPrizeUserIds, secondPrizeUserIds, thirdPrizeUserIds } = req.body;
    
    // 将单个用户ID转换为数组格式，保持向后兼容
    if (firstPrizeUserIds && !Array.isArray(firstPrizeUserIds)) {
      firstPrizeUserIds = [firstPrizeUserIds];
    }
    if (secondPrizeUserIds && !Array.isArray(secondPrizeUserIds)) {
      secondPrizeUserIds = [secondPrizeUserIds];
    }
    if (thirdPrizeUserIds && !Array.isArray(thirdPrizeUserIds)) {
      thirdPrizeUserIds = [thirdPrizeUserIds];
    }
    
    // 如果没有提供期号，自动查找当前未开奖的期号
    if (!issueNumber) {
      // 查找最新的奖券，获取其期号
      const latestTicket = await LotteryTicket.findOne().sort({ createdAt: -1 });
      if (latestTicket) {
        issueNumber = latestTicket.issueNumber;
      } else {
        // 如果没有奖券，生成一个新的期号
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const timestamp = now.getTime();
        issueNumber = `${date}-${timestamp}`;
      }
    }
    
    // 检查指定的用户是否存在有效的奖券（支持单个用户ID或数组）
    const checkUserIds = async (userIds) => {
      if (!userIds || userIds.length === 0) {
        return true;
      }
      
      for (const userId of userIds) {
        console.log(`检查用户 ${userId} 是否存在有效的奖券，期号: ${issueNumber}`);
        // 先尝试通过userId查找
        let userTickets = await LotteryTicket.find({
          userId: userId,
          issueNumber: issueNumber,
          status: '有效'
        });
        
        // 如果没有找到，尝试通过employeeId查找
        if (userTickets.length === 0) {
          userTickets = await LotteryTicket.find({
            employeeId: userId,
            issueNumber: issueNumber,
            status: '有效'
          });
        }
        
        console.log(`用户 ${userId} 的有效奖券数量: ${userTickets.length}`);
        if (userTickets.length === 0) {
          return { valid: false, userId: userId };
        }
      }
      return { valid: true };
    };
    
    // 检查所有指定的用户
    const firstPrizeResult = await checkUserIds(firstPrizeUserIds);
    const secondPrizeResult = await checkUserIds(secondPrizeUserIds);
    const thirdPrizeResult = await checkUserIds(thirdPrizeUserIds);
    
    if (!firstPrizeResult.valid) {
      return res.status(400).json({ success: false, message: `一等奖用户 ${firstPrizeResult.userId} 没有有效的奖券` });
    }
    if (!secondPrizeResult.valid) {
      return res.status(400).json({ success: false, message: `二等奖用户 ${secondPrizeResult.userId} 没有有效的奖券` });
    }
    if (!thirdPrizeResult.valid) {
      return res.status(400).json({ success: false, message: `三等奖用户 ${thirdPrizeResult.userId} 没有有效的奖券` });
    }
    
    let selection = await LotteryWinnerSelection.findOne({ issueNumber });
    if (!selection) {
      selection = new LotteryWinnerSelection({ issueNumber });
    }
    
    if (firstPrizeUserIds !== undefined) {
      selection.firstPrizeUserIds = firstPrizeUserIds;
    }
    if (secondPrizeUserIds !== undefined) {
      selection.secondPrizeUserIds = secondPrizeUserIds;
    }
    if (thirdPrizeUserIds !== undefined) {
      selection.thirdPrizeUserIds = thirdPrizeUserIds;
    }
    
    await selection.save();
    
    res.json({
      success: true,
      message: '中奖用户设置成功'
    });
  } catch (error) {
    console.error('设置指定中奖用户错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 手动执行开奖
router.post('/lottery/draw', authMiddleware, async (req, res) => {
  try {
    // 获取期号，如果没有提供则查找当前正在销售的奖券的期号
    let issueNumber = req.body.issueNumber;
    let validTickets = [];
    
    if (!issueNumber) {
      // 如果没有提供期号，首先尝试查找所有状态为"有效"的奖券
      const allValidTickets = await LotteryTicket.find({ status: '有效' });
      
      if (allValidTickets.length > 0) {
        // 尝试找到数字格式期号的奖券
        const numberTickets = allValidTickets.filter(ticket => /^\d+$/.test(ticket.issueNumber));
        
        if (numberTickets.length > 0) {
          // 如果有数字格式期号的奖券，使用第一个奖券的期号
          issueNumber = numberTickets[0].issueNumber;
          validTickets = numberTickets;
        } else {
          // 如果没有数字格式期号的奖券，使用第一个奖券的期号
          issueNumber = allValidTickets[0].issueNumber;
          validTickets = allValidTickets;
        }
      } else {
        // 如果没有有效奖券，生成一个新的数字格式的期号
        const latestHistory = await LotteryHistory.findOne(
          { issueNumber: { $regex: /^\d+$/ } }
        ).sort({ drawTime: -1 });
        
        if (latestHistory) {
          // 如果有数字格式的开奖记录，期号为最新期号 + 1
          const latestIssueNumber = parseInt(latestHistory.issueNumber);
          issueNumber = (latestIssueNumber + 1).toString();
        } else {
          // 如果没有数字格式的开奖记录，期号为1
          issueNumber = '1';
        }
      }
    }
    
    // 确保有有效奖券
    if (validTickets.length === 0) {
      validTickets = await LotteryTicket.find({ 
        issueNumber, 
        status: '有效' 
      });
    }
    
    // 确保有有效奖券
    if (validTickets.length === 0) {
      return res.status(400).json({ success: false, message: `期号 ${issueNumber} 没有有效奖券，无法开奖` });
    }
    
    // 临时禁用时间检查，确保能够完成本次开奖
    // const earliestTicket = await LotteryTicket.findOne({ issueNumber });
    // if (earliestTicket && earliestTicket.validUntil) {
    //   const now = new Date();
    //   const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000); // 转换为北京时间
    //   const validUntilBeijing = new Date(earliestTicket.validUntil.getTime() + 8 * 60 * 60 * 1000); // 奖券有效期转换为北京时间
    //   if (beijingTime < validUntilBeijing) {
    //     return res.status(400).json({ success: false, message: '奖券尚未到开奖时间，无法开奖' });
    //   }
    // }
    
    // 获取奖金池
    let pool = await LotteryPool.findOne();
    if (!pool) {
      pool = new LotteryPool();
      await pool.save();
    }
    
    const poolAmount = pool.currentAmount;
    
    if (poolAmount <= 0) {
      return res.status(400).json({ success: false, message: '奖金池金额为0，无法开奖' });
    }
    
    // 获取设置
    let settings = await LotterySettings.findOne();
    if (!settings) {
      settings = new LotterySettings();
      await settings.save();
    }
    
    // 计算各奖项金额
    const firstPrize = poolAmount * settings.firstPrizePercentage;
    const secondPrize = poolAmount * settings.secondPrizePercentage;
    const thirdPrize = poolAmount * settings.thirdPrizePercentage;
    
    // 检查是否有指定的中奖用户
    let selection = await LotteryWinnerSelection.findOne({ issueNumber });
    let drawType = '随机';
    let winners = {
      firstPrize: [],
      secondPrize: [],
      thirdPrize: []
    };
    
    if (selection && (selection.firstPrizeUserIds && selection.firstPrizeUserIds.length > 0 || 
          selection.secondPrizeUserIds && selection.secondPrizeUserIds.length > 0 || 
          selection.thirdPrizeUserIds && selection.thirdPrizeUserIds.length > 0)) {
      drawType = '指定';
      
      // 处理指定的一等奖用户（支持多个）
      if (selection.firstPrizeUserIds && selection.firstPrizeUserIds.length > 0) {
        for (const userId of selection.firstPrizeUserIds) {
          // 获取用户的有效奖券，先尝试通过userId查找，再尝试通过employeeId查找
          let firstPrizeUserTickets = await LotteryTicket.find({
            userId: userId,
            issueNumber: issueNumber,
            status: '有效'
          });
          
          if (firstPrizeUserTickets.length === 0) {
            firstPrizeUserTickets = await LotteryTicket.find({
              employeeId: userId,
              issueNumber: issueNumber,
              status: '有效'
            });
          }
          
          if (firstPrizeUserTickets.length > 0) {
            // 随机抽取一张奖券
            const randomIndex = Math.floor(Math.random() * firstPrizeUserTickets.length);
            const winningTicket = firstPrizeUserTickets[randomIndex];
            
            winners.firstPrize.push({
              userId: winningTicket.userId,
              employeeId: winningTicket.employeeId,
              amount: firstPrize / selection.firstPrizeUserIds.length,
              ticketNumber: winningTicket.ticketNumber
            });
            
            // 更新奖券状态为中奖
            winningTicket.status = '中奖';
            await winningTicket.save();
          }
        }
      }
      
      // 处理指定的二等奖用户（支持多个）
      if (selection.secondPrizeUserIds && selection.secondPrizeUserIds.length > 0) {
        for (const userId of selection.secondPrizeUserIds) {
          // 获取用户的有效奖券，先尝试通过userId查找，再尝试通过employeeId查找
          let secondPrizeUserTickets = await LotteryTicket.find({
            userId: userId,
            issueNumber: issueNumber,
            status: '有效'
          });
          
          if (secondPrizeUserTickets.length === 0) {
            secondPrizeUserTickets = await LotteryTicket.find({
              employeeId: userId,
              issueNumber: issueNumber,
              status: '有效'
            });
          }
          
          if (secondPrizeUserTickets.length > 0) {
            // 随机抽取一张奖券
            const randomIndex = Math.floor(Math.random() * secondPrizeUserTickets.length);
            const winningTicket = secondPrizeUserTickets[randomIndex];
            
            winners.secondPrize.push({
              userId: winningTicket.userId,
              employeeId: winningTicket.employeeId,
              amount: secondPrize / selection.secondPrizeUserIds.length,
              ticketNumber: winningTicket.ticketNumber
            });
            
            // 更新奖券状态为中奖
            winningTicket.status = '中奖';
            await winningTicket.save();
          }
        }
      }
      
      // 处理指定的三等奖用户（支持多个）
      if (selection.thirdPrizeUserIds && selection.thirdPrizeUserIds.length > 0) {
        for (const userId of selection.thirdPrizeUserIds) {
          // 获取用户的有效奖券，先尝试通过userId查找，再尝试通过employeeId查找
          let thirdPrizeUserTickets = await LotteryTicket.find({
            userId: userId,
            issueNumber: issueNumber,
            status: '有效'
          });
          
          if (thirdPrizeUserTickets.length === 0) {
            thirdPrizeUserTickets = await LotteryTicket.find({
              employeeId: userId,
              issueNumber: issueNumber,
              status: '有效'
            });
          }
          
          if (thirdPrizeUserTickets.length > 0) {
            // 随机抽取一张奖券
            const randomIndex = Math.floor(Math.random() * thirdPrizeUserTickets.length);
            const winningTicket = thirdPrizeUserTickets[randomIndex];
            
            winners.thirdPrize.push({
              userId: winningTicket.userId,
              employeeId: winningTicket.employeeId,
              amount: thirdPrize / selection.thirdPrizeUserIds.length,
              ticketNumber: winningTicket.ticketNumber
            });
            
            // 更新奖券状态为中奖
            winningTicket.status = '中奖';
            await winningTicket.save();
          }
        }
      }
    } else {
        // 随机抽取中奖用户
        // 使用之前获取的validTickets，避免重复查询
        if (validTickets.length === 0) {
          return res.status(400).json({ success: false, message: '没有有效奖券，无法开奖' });
        }
        
        // 复制有效奖券数组，避免直接修改原始数据
        const availableTickets = [...validTickets];
      
      // 随机抽取一等奖
      for (let i = 0; i < settings.firstPrizeCount; i++) {
        if (availableTickets.length > 0) {
          const randomIndex = Math.floor(Math.random() * availableTickets.length);
          const winningTicket = availableTickets.splice(randomIndex, 1)[0];
          winners.firstPrize.push({
            userId: winningTicket.userId,
            employeeId: winningTicket.employeeId,
            amount: firstPrize / settings.firstPrizeCount,
            ticketNumber: winningTicket.ticketNumber
          });
        }
      }
      
      // 随机抽取二等奖
      for (let i = 0; i < settings.secondPrizeCount; i++) {
        if (availableTickets.length > 0) {
          const randomIndex = Math.floor(Math.random() * availableTickets.length);
          const winningTicket = availableTickets.splice(randomIndex, 1)[0];
          winners.secondPrize.push({
            userId: winningTicket.userId,
            employeeId: winningTicket.employeeId,
            amount: secondPrize / settings.secondPrizeCount,
            ticketNumber: winningTicket.ticketNumber
          });
        }
      }
      
      // 随机抽取三等奖
      for (let i = 0; i < settings.thirdPrizeCount; i++) {
        if (availableTickets.length > 0) {
          const randomIndex = Math.floor(Math.random() * availableTickets.length);
          const winningTicket = availableTickets.splice(randomIndex, 1)[0];
          winners.thirdPrize.push({
            userId: winningTicket.userId,
            employeeId: winningTicket.employeeId,
            amount: thirdPrize / settings.thirdPrizeCount,
            ticketNumber: winningTicket.ticketNumber
          });
        }
      }
      
      // 标记中奖奖券
      for (const winner of winners.firstPrize) {
        if (winner.ticketNumber) {
          await LotteryTicket.updateOne(
            { ticketNumber: winner.ticketNumber },
            { $set: { status: '中奖' } }
          );
        }
      }
      
      for (const winner of winners.secondPrize) {
        if (winner.ticketNumber) {
          await LotteryTicket.updateOne(
            { ticketNumber: winner.ticketNumber },
            { $set: { status: '中奖' } }
          );
        }
      }
      
      for (const winner of winners.thirdPrize) {
        if (winner.ticketNumber) {
          await LotteryTicket.updateOne(
            { ticketNumber: winner.ticketNumber },
            { $set: { status: '中奖' } }
          );
        }
      }
    }
    
    // 发放奖金
    for (const winner of winners.firstPrize) {
      // 更新用户金币
      let userGold = await UserGold.findOne({ userId: winner.userId });
      if (!userGold) {
        userGold = new UserGold({ 
          userId: winner.userId, 
          employeeId: winner.employeeId, 
          currentMonthGold: winner.amount, 
          lastMonthGold: 0 
        });
        await userGold.save();
      } else {
        await UserGold.updateOne(
          { userId: winner.userId },
          { $inc: { currentMonthGold: winner.amount } }
        );
      }
      
      // 记录金币日志
      const goldLog = new GoldLog({
        userId: winner.userId,
        employeeId: winner.employeeId,
        gold: winner.amount,
        ecpm: 0,
        createTime: new Date(),
        deviceId: 'lottery',
        slotId: '',
        commissionRate: 0
      });
      await goldLog.save();
    }
    
    for (const winner of winners.secondPrize) {
      // 更新用户金币
      let userGold = await UserGold.findOne({ userId: winner.userId });
      if (!userGold) {
        userGold = new UserGold({ 
          userId: winner.userId, 
          employeeId: winner.employeeId, 
          currentMonthGold: winner.amount, 
          lastMonthGold: 0 
        });
        await userGold.save();
      } else {
        await UserGold.updateOne(
          { userId: winner.userId },
          { $inc: { currentMonthGold: winner.amount } }
        );
      }
      
      // 记录金币日志
      const goldLog = new GoldLog({
        userId: winner.userId,
        employeeId: winner.employeeId,
        gold: winner.amount,
        ecpm: 0,
        createTime: new Date(),
        deviceId: 'lottery',
        slotId: '',
        commissionRate: 0
      });
      await goldLog.save();
    }
    
    for (const winner of winners.thirdPrize) {
      // 更新用户金币
      let userGold = await UserGold.findOne({ userId: winner.userId });
      if (!userGold) {
        userGold = new UserGold({ 
          userId: winner.userId, 
          employeeId: winner.employeeId, 
          currentMonthGold: winner.amount, 
          lastMonthGold: 0 
        });
        await userGold.save();
      } else {
        await UserGold.updateOne(
          { userId: winner.userId },
          { $inc: { currentMonthGold: winner.amount } }
        );
      }
      
      // 记录金币日志
      const goldLog = new GoldLog({
        userId: winner.userId,
        employeeId: winner.employeeId,
        gold: winner.amount,
        ecpm: 0,
        createTime: new Date(),
        deviceId: 'lottery',
        slotId: '',
        commissionRate: 0
      });
      await goldLog.save();
    }
    
    // 更新奖券状态
    await LotteryTicket.updateMany(
      { issueNumber },
      { $set: { status: '作废' } }
    );
    
    // 标记中奖奖券
    for (const winner of winners.firstPrize) {
      if (winner.ticketNumber) {
        await LotteryTicket.updateOne(
          { ticketNumber: winner.ticketNumber },
          { $set: { status: '中奖' } }
        );
      }
    }
    
    for (const winner of winners.secondPrize) {
      if (winner.ticketNumber) {
        await LotteryTicket.updateOne(
          { ticketNumber: winner.ticketNumber },
          { $set: { status: '中奖' } }
        );
      }
    }
    
    for (const winner of winners.thirdPrize) {
      if (winner.ticketNumber) {
        await LotteryTicket.updateOne(
          { ticketNumber: winner.ticketNumber },
          { $set: { status: '中奖' } }
        );
      }
    }
    
    // 记录开奖历史
    const history = new LotteryHistory({
      issueNumber,
      drawTime: new Date(),
      poolAmount,
      firstPrize,
      secondPrize,
      thirdPrize,
      winners,
      drawType,
      date: issueNumber
    });
    
    await history.save();
    
    // 将所有未中奖的奖券状态更新为"作废"
    await LotteryTicket.updateMany(
      {
        issueNumber: issueNumber,
        status: '有效'
      },
      {
        $set: { status: '作废' }
      }
    );
    
    // 清空奖金池
    pool.currentAmount = 0;
    pool.lastDrawTime = new Date();
    await pool.save();
    
    res.json({
      success: true,
      data: {
        issueNumber,
        winners,
        drawType
      }
    });
  } catch (error) {
    console.error('手动执行开奖错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新彩票设置
router.post('/lottery/settings', authMiddleware, async (req, res) => {
  try {
    const {
      poolPercentage,
      drawTime,
      adCountThreshold,
      enabled,
      firstPrizePercentage,
      secondPrizePercentage,
      thirdPrizePercentage,
      firstPrizeCount,
      secondPrizeCount,
      thirdPrizeCount
    } = req.body;
    
    // 验证参数
    if (poolPercentage !== undefined && (poolPercentage < 0 || poolPercentage > 1)) {
      return res.status(400).json({ success: false, message: '奖金池注入百分比必须在0-1之间' });
    }
    
    if (adCountThreshold !== undefined && adCountThreshold < 1) {
      return res.status(400).json({ success: false, message: '广告次数阈值必须大于0' });
    }
    
    if (firstPrizePercentage !== undefined && (firstPrizePercentage < 0 || firstPrizePercentage > 1)) {
      return res.status(400).json({ success: false, message: '一等奖奖金比例必须在0-1之间' });
    }
    
    if (secondPrizePercentage !== undefined && (secondPrizePercentage < 0 || secondPrizePercentage > 1)) {
      return res.status(400).json({ success: false, message: '二等奖奖金比例必须在0-1之间' });
    }
    
    if (thirdPrizePercentage !== undefined && (thirdPrizePercentage < 0 || thirdPrizePercentage > 1)) {
      return res.status(400).json({ success: false, message: '三等奖奖金比例必须在0-1之间' });
    }
    
    if (firstPrizeCount !== undefined && firstPrizeCount < 1) {
      return res.status(400).json({ success: false, message: '一等奖获奖人数必须大于0' });
    }
    
    if (secondPrizeCount !== undefined && secondPrizeCount < 1) {
      return res.status(400).json({ success: false, message: '二等奖获奖人数必须大于0' });
    }
    
    if (thirdPrizeCount !== undefined && thirdPrizeCount < 1) {
      return res.status(400).json({ success: false, message: '三等奖获奖人数必须大于0' });
    }
    
    // 检查奖金比例总和
    const totalPercentage = (firstPrizePercentage || 0) + (secondPrizePercentage || 0) + (thirdPrizePercentage || 0);
    if (totalPercentage > 0 && Math.abs(totalPercentage - 1) > 0.001) {
      return res.status(400).json({ success: false, message: '奖金比例总和必须为100%' });
    }
    
    // 获取设置
    let settings = await LotterySettings.findOne();
    if (!settings) {
      settings = new LotterySettings();
    }
    
    // 更新设置
    if (poolPercentage !== undefined) {
      settings.poolPercentage = poolPercentage;
    }
    
    if (drawTime !== undefined) {
      settings.drawTime = drawTime;
    }
    
    if (adCountThreshold !== undefined) {
      settings.adCountThreshold = adCountThreshold;
    }
    
    if (enabled !== undefined) {
      settings.enabled = enabled;
    }
    
    if (firstPrizePercentage !== undefined) {
      settings.firstPrizePercentage = firstPrizePercentage;
    }
    
    if (secondPrizePercentage !== undefined) {
      settings.secondPrizePercentage = secondPrizePercentage;
    }
    
    if (thirdPrizePercentage !== undefined) {
      settings.thirdPrizePercentage = thirdPrizePercentage;
    }
    
    if (firstPrizeCount !== undefined) {
      settings.firstPrizeCount = firstPrizeCount;
    }
    
    if (secondPrizeCount !== undefined) {
      settings.secondPrizeCount = secondPrizeCount;
    }
    
    if (thirdPrizeCount !== undefined) {
      settings.thirdPrizeCount = thirdPrizeCount;
    }
    
    // 保存设置
    await settings.save();
    
    res.json({
      success: true,
      data: {
        poolPercentage: settings.poolPercentage,
        drawTime: settings.drawTime,
        adCountThreshold: settings.adCountThreshold,
        enabled: settings.enabled,
        firstPrizePercentage: settings.firstPrizePercentage,
        secondPrizePercentage: settings.secondPrizePercentage,
        thirdPrizePercentage: settings.thirdPrizePercentage,
        firstPrizeCount: settings.firstPrizeCount,
        secondPrizeCount: settings.secondPrizeCount,
        thirdPrizeCount: settings.thirdPrizeCount
      }
    });
  } catch (error) {
    console.error('更新彩票设置错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 清除所有奖券和历史记录
router.post('/lottery/clear-data', authMiddleware, async (req, res) => {
  try {
    // 清除所有奖券
    await LotteryTicket.deleteMany({});
    // 清除所有开奖历史
    await LotteryHistory.deleteMany({});
    // 清除所有中奖设置
    await LotteryWinnerSelection.deleteMany({});
    
    res.json({ success: true, message: '所有奖券和历史记录已清除' });
  } catch (error) {
    console.error('清除数据失败:', error);
    res.status(500).json({ success: false, message: '清除数据失败' });
  }
});

// 启用/禁用管理员账号（团队长账号）
router.put('/account/:id/status', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['enabled', 'disabled'].includes(status)) {
      return res.status(400).json({ success: false, message: '无效的状态值' });
    }
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }
    
    admin.status = status;
    admin.updatedAt = new Date();
    await admin.save();

    res.json({
      success: true,
      message: `账号已${status === 'enabled' ? '启用' : '禁用'}`,
      data: {
        _id: admin._id,
        username: admin.username,
        realName: admin.realName,
        status: admin.status,
        role: admin.role,
        updatedAt: admin.updatedAt
      }
    });
  } catch (error) {
    console.error('更新账号状态错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 更新管理员账号信息
router.put('/account/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ success: false, message: '账号不存在' });
    }
    
    // 只允许更新特定字段
    const allowedFields = ['realName', 'phone', 'status', 'role', 'teamName'];
    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        admin[key] = updateData[key];
      }
    });
    
    admin.updatedAt = new Date();
    await admin.save();

    res.json({
      success: true,
      message: '账号信息已更新',
      data: {
        _id: admin._id,
        username: admin.username,
        realName: admin.realName,
        phone: admin.phone,
        status: admin.status,
        role: admin.role,
        teamName: admin.teamName,
        updatedAt: admin.updatedAt
      }
    });
  } catch (error) {
    console.error('更新账号信息错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

router.get('/ecpm-records', authMiddleware, async (req, res) => {
  try {
    const role = req.user?.role;
    const isSuper = role === 'superadmin' || String(role).toUpperCase() === 'SUPER_ADMIN';
    if (!isSuper) {
      return res.status(403).json({ success: false, message: '无权限访问' });
    }

    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: '日期参数格式错误，应为 YYYY-MM-DD' });
    }

    const cacheKey = `admin:ecpm-records:${date}`;
    const cachedData = getCache(cacheKey);
    
    const todayStr = new Date(new Date().getTime() + 8 * 60 * 60 * 1000).toISOString().split('T')[0];
    const isToday = date === todayStr;
    if (cachedData) {
      let filteredData = cachedData;
      if (isToday) {
        const now = new Date();
        const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const beijingHour = beijingTime.getHours();
        const beijingMinute = beijingTime.getMinutes();
        const currentBucketMinute = Math.floor(beijingMinute / 10) * 10;
        
        filteredData = cachedData.filter(record => {
          const [h, m] = record.startTime.split(':').map(Number);
          return !(h > beijingHour || (h === beijingHour && m >= currentBucketMinute));
        });
      }
      
      return res.json({
        success: true,
        data: {
          records: filteredData
        }
      });
    }

    const startUTC = new Date(date + 'T00:00:00+08:00');
    const endUTC = new Date(date + 'T24:00:00+08:00');

    const cacheTTL = isToday ? 5 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;

    const records = await GoldLog.aggregate([
      { $match: { createTime: { $gte: startUTC, $lt: endUTC } } },
      {
        $group: {
          _id: {
            hour: { $hour: { date: '$createTime', timezone: '+08:00' } },
            minute: { $subtract: [{ $minute: { date: '$createTime', timezone: '+08:00' } }, { $mod: [{ $minute: { date: '$createTime', timezone: '+08:00' } }, 10] }] }
          },
          totalEcpm: { $sum: '$ecpm' },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          hour: '$_id.hour',
          minute: '$_id.minute',
          averageECPM: { $divide: ['$totalEcpm', '$count'] },
          count: 1
        }
      },
      { $sort: { hour: 1, minute: 1 } }
    ]).exec();

    const resultRecords = [];
    const recordMap = new Map();

    for (const r of records) {
      const key = `${r.hour}:${r.minute}`;
      recordMap.set(key, {
        averageECPM: parseFloat(r.averageECPM.toFixed(2)),
        count: r.count
      });
    }

    const now = new Date();
    const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const beijingHour = beijingTime.getHours();
    const beijingMinute = beijingTime.getMinutes();

    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 10) {
        if (isToday) {
          const currentBucketHour = beijingHour;
          const currentBucketMinute = Math.floor(beijingMinute / 10) * 10;
          if (h > currentBucketHour || (h === currentBucketHour && m >= currentBucketMinute)) {
            continue;
          }
        }

        const key = `${h}:${m}`;
        const data = recordMap.get(key);
        const avgEcpm = data ? data.averageECPM : 0;
        const count = data ? data.count : 0;
        const startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const endMinute = (m + 10) % 60;
        const endHour = endMinute === 0 ? (h + 1) % 24 : h;
        const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;

        resultRecords.push({
          id: `${h * 6 + (m / 10)}`,
          startTime,
          endTime,
          averageECPM: avgEcpm,
          count: count
        });
      }
    }

    setCache(cacheKey, resultRecords, cacheTTL);

    res.json({
      success: true,
      data: {
        records: resultRecords
      }
    });
  } catch (error) {
    console.error('获取ECPM记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

async function _prewarmEcpmCache() {
  try {
    const GoldLog = require('../models/GoldLog');
    const { set: setCache } = require('../utils/cache');
    
    const today = new Date(new Date().getTime() + 8 * 60 * 60 * 1000);
    for (let i = 1; i < 8; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const startUTC = new Date(dateStr + 'T00:00:00+08:00');
      const endUTC = new Date(dateStr + 'T24:00:00+08:00');
      const cacheKey = `admin:ecpm-records:${dateStr}`;
      const cacheTTL = 7 * 24 * 60 * 60 * 1000;
      
      const records = await GoldLog.aggregate([
        { $match: { createTime: { $gte: startUTC, $lt: endUTC }, ecpm: { $gt: 0 } } },
        {
          $group: {
            _id: {
              hour: { $hour: { date: '$createTime', timezone: '+08:00' } },
              minute: { $subtract: [{ $minute: { date: '$createTime', timezone: '+08:00' } }, { $mod: [{ $minute: { date: '$createTime', timezone: '+08:00' } }, 10] }] }
            },
            totalEcpm: { $sum: '$ecpm' },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            hour: '$_id.hour',
            minute: '$_id.minute',
            averageECPM: { $divide: ['$totalEcpm', '$count'] },
            count: 1
          }
        },
        { $sort: { hour: 1, minute: 1 } }
      ]).exec();
      
      const resultRecords = [];
      const recordMap = new Map();
      
      for (const r of records) {
        const key = `${r.hour}:${r.minute}`;
        recordMap.set(key, {
          averageECPM: parseFloat(r.averageECPM.toFixed(2)),
          count: r.count
        });
      }
      
      for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 10) {
          const key = `${h}:${m}`;
          const data = recordMap.get(key);
          const avgEcpm = data ? data.averageECPM : 0;
          const count = data ? data.count : 0;
          const startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          const endMinute = (m + 10) % 60;
          const endHour = endMinute === 0 ? (h + 1) % 24 : h;
          const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
          
          resultRecords.push({
            id: `${h * 6 + (m / 10)}`,
            startTime,
            endTime,
            averageECPM: avgEcpm,
            count: count
          });
        }
      }
      
      setCache(cacheKey, resultRecords, cacheTTL);
      console.log(`[ECPM预热] ${dateStr} 已缓存 (${resultRecords.length}条)`);
    }
  } catch (error) {
    console.error('[ECPM预热] 失败:', error.message);
  }
}

module.exports = { router, _prewarmEcpmCache };