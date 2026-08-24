const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const UserGold = require('../models/UserGold');
const UserActivity = require('../models/UserActivity');
const { generateToken } = require('../utils/auth');
const { getBeijingStartOfDay } = require('../utils/date');

// 生成4位随机员工号
function generateEmployeeId() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// 校验员工号登录
router.post('/check', async (req, res) => {
  try {
    const { employeeId, deviceId, packageName } = req.body;
    
    if (!employeeId || employeeId.length !== 4) {
      return res.status(400).json({ success: false, message: '请输入4位员工号' });
    }
    
    const employee = await Employee.findOne({ 
      employeeId, 
      $or: [{ status: 1 }, { status: 'enabled' }] 
    });
    
    if (!employee) {
      return res.status(401).json({ success: false, message: '员工号不存在或已禁用' });
    }
    
    // 设备数校验（CSJ/快手/优量汇系统，按系统+包名独立统计，百度系统不校验）
    // 默认 limit=0 表示不允许登录该系统，需超管在后台开启
    const DEVICE_SYSTEMS = {
      'csj_': { platform: 'csj', limitField: 'csjDeviceLimit', name: 'CSJ' },
      'ks_':  { platform: 'ks',  limitField: 'ksDeviceLimit',  name: '快手' },
      'ylh_': { platform: 'ylh', limitField: 'ylhDeviceLimit', name: '优量汇' }
    };

    let matchedSystem = null;
    let realDeviceId = deviceId;
    if (deviceId) {
      for (const [prefix, config] of Object.entries(DEVICE_SYSTEMS)) {
        if (deviceId.startsWith(prefix)) {
          matchedSystem = config;
          realDeviceId = deviceId.slice(prefix.length);
          break;
        }
      }
    }

    if (matchedSystem) {
      const { platform, limitField, name } = matchedSystem;
      // 应用标识：由前端传入包名，未传则默认 'default'（兼容旧版本）
      const appId = packageName || 'default';
      // 兜底：如果 ks/ylh 对应字段未设置（<=0），统一使用 csjDeviceLimit 的值
      // 确保超管只在前端填 csjDeviceLimit 一个值时三系统同步生效
      let deviceLimit = employee[limitField] || 0;
      if (deviceLimit <= 0 && (limitField === 'ksDeviceLimit' || limitField === 'ylhDeviceLimit')) {
        deviceLimit = employee.csjDeviceLimit || 0;
      }

      // 0 表示未授权登录该系统
      if (deviceLimit <= 0) {
        return res.status(403).json({
          success: false,
          message: `您暂无${name}系统登录权限，请联系管理员开通`,
          code: 'LOGIN_NOT_AUTHORIZED'
        });
      }

      // 统计当天北京时间的该系统唯一设备数（按应用独立）
      const startOfToday = getBeijingStartOfDay();
      const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

      // 先检查当前设备+应用是否已登录过（同一设备+同一应用可重复登录）
      const existingDevice = await UserActivity.findOne({
        employeeId,
        deviceId: realDeviceId,
        platform,
        csjAppId: appId,
        createTime: { $gte: startOfToday, $lt: endOfToday }
      });

      if (!existingDevice) {
        // 当前设备+当前应用 未登录过，统计今日该应用的唯一设备数
        const deviceCountResult = await UserActivity.aggregate([
          {
            $match: {
              employeeId,
              platform,
              csjAppId: appId,
              createTime: { $gte: startOfToday, $lt: endOfToday }
            }
          },
          { $group: { _id: '$deviceId' } },
          { $count: 'total' }
        ]);

        const todayDeviceCount = deviceCountResult[0]?.total || 0;

        if (todayDeviceCount >= deviceLimit) {
          return res.status(403).json({
            success: false,
            message: `今日设备数已达上限（${deviceLimit}台），请明天再来或联系管理员`,
            code: 'DEVICE_LIMIT_EXCEEDED'
          });
        }

        // 记录新设备登录
        await UserActivity.create({
          userId: employee._id.toString(),
          employeeId,
          ip: req.ip || 'unknown',
          deviceId: realDeviceId,
          platform,
          csjAppId: appId,
          createTime: new Date()
        });
      }
    }
    
    // 查找该员工的用户金币记录，获取userId
    // 优先查找employeeId匹配且userId以user_开头的记录（系统生成的正式用户）
    let userGold = await UserGold.findOne({ 
      employeeId,
      userId: { $regex: `^user_${employeeId}_` }
    }).sort({ createdAt: -1 });
    
    // 如果没有找到系统生成的用户，再查找任何匹配employeeId的记录
    if (!userGold) {
      userGold = await UserGold.findOne({ employeeId }).sort({ createdAt: -1 });
    }
    
    // 如果没有用户记录，创建一个新的userId
    let userId;
    if (!userGold) {
      // 使用employeeId作为userId的基础，创建新用户
      userId = `user_${employeeId}_${Date.now()}`;
      userGold = new UserGold({
        userId,
        employeeId,
        currentMonthGold: 0,
        lastMonthGold: 0
      });
      await userGold.save();
    } else {
      userId = userGold.userId;
    }
    
    // 生成token
    const token = generateToken({
      id: employee._id,
      username: employeeId,
      role: employee.role || 'EMPLOYEE'
    });
    
    res.json({ 
      success: true, 
      message: '登录成功', 
      data: {
        ...employee.toObject(),
        userId: userId
      },
      token: token
    });
  } catch (error) {
    console.error('登录校验错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 管理员添加员工
router.post('/add', async (req, res) => {
  try {
    const { name, phone, area } = req.body;
    
    if (!name || !phone || !area) {
      return res.status(400).json({ success: false, message: '请填写完整信息' });
    }
    
    // 生成唯一员工号
    let employeeId;
    let isUnique = false;
    
    while (!isUnique) {
      employeeId = generateEmployeeId();
      const existingEmployee = await Employee.findOne({ employeeId });
      if (!existingEmployee) {
        isUnique = true;
      }
    }
    
    const newEmployee = new Employee({
      employeeId,
      name,
      phone,
      area,
      status: 1
    });
    
    await newEmployee.save();
    
    // 自动创建UserGold记录，确保新员工出现在统计接口中
    const userId = `user_${employeeId}_${Date.now()}`;
    const newUserGold = new UserGold({
      userId,
      employeeId,
      currentMonthGold: 0,
      lastMonthGold: 0
    });
    await newUserGold.save();
    
    res.json({ 
      success: true, 
      message: '员工添加成功', 
      data: {
        ...newEmployee.toObject(),
        userId: userId
      }
    });
  } catch (error) {
    console.error('添加员工错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 发放金币接口
router.post('/reward-gold', async (req, res) => {
  try {
    const { userId, employeeId, ecpm, slotId, deviceId } = req.body;
    
    if (!userId || !employeeId || !ecpm || !deviceId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    let platform = '';
    // 优先根据 deviceId 前缀识别系统
    if (deviceId && deviceId.startsWith('csj_')) {
      platform = 'csj';
    } else if (deviceId && deviceId.startsWith('ks_')) {
      platform = 'ks';
    } else if (deviceId && deviceId.startsWith('ylh_')) {
      platform = 'ylh';
    } else if (slotId && /^10\d{6,10}$/.test(slotId)) {
      // 兼容旧逻辑：slotId 以 10 开头（8-12位）识别为 csj
      platform = 'csj';
    }
    
    // 穿山甲（csj）固定分成比例 40%（硬编码，不走 SystemConfig.commissionRate）
    // 其他平台（百度/快手/优量汇等）仍按 SystemConfig.commissionRate，默认兜底 50%
    // 若后续需要调整穿山甲分成比例，改此处常量 CSJ_FIXED_COMMISSION_RATE 即可
    const CSJ_FIXED_COMMISSION_RATE = 0.4;
    let commissionRate;
    if (platform === 'csj') {
      commissionRate = CSJ_FIXED_COMMISSION_RATE;
    } else {
      commissionRate = 0.5;
      try {
        const SystemConfig = require('../models/SystemConfig');
        const config = await SystemConfig.findOne({ key: 'commissionRate' });
        if (config) {
          commissionRate = config.value;
        }
      } catch (err) {
        console.error('查询系统配置错误:', err);
        // 即使查询失败，也使用默认值
      }
    }
    
    // 计算金币（ECPM * 分成比例）
    const gold = ecpm * commissionRate;
    
    // 获取彩票设置
    let settings = null;
    try {
      const LotterySettings = require('../models/LotterySettings');
      settings = await LotterySettings.findOne();
      if (!settings) {
        settings = new LotterySettings();
        await settings.save();
      }
    } catch (err) {
      console.error('获取彩票设置错误:', err);
    }
    
    // 更新用户金币和广告次数
    let userGold = await UserGold.findOne({ userId });
    let shouldGenerateTicket = false;
    
    if (!userGold) {
      // 如果用户不存在，创建新记录
      userGold = new UserGold({
        userId,
        employeeId,
        currentMonthGold: gold,
        lastMonthGold: 0,
        adCount: 1
      });
      shouldGenerateTicket = settings && 1 >= settings.adCountThreshold;
    } else {
      const newAdCount = userGold.adCount + 1;
      shouldGenerateTicket = settings && newAdCount >= settings.adCountThreshold;
      
      if (shouldGenerateTicket) {
        await UserGold.updateOne(
          { userId },
          { $inc: { currentMonthGold: gold }, $set: { adCount: 0 } }
        );
        userGold.currentMonthGold += gold;
        userGold.adCount = 0;
      } else {
        await UserGold.updateOne(
          { userId },
          { $inc: { currentMonthGold: gold, adCount: 1 } }
        );
        userGold.currentMonthGold += gold;
        userGold.adCount = newAdCount;
      }
    }
    
    // 检查是否达到广告次数阈值，生成奖券
    let ticketNumber = null;
    let issueNumber = null;
    try {
      const LotteryTicket = require('../models/LotteryTicket');
      
      // 获取彩票设置（已经获取过了
      
      // 检查是否达到广告次数阈值
      if (shouldGenerateTicket) {
        // 生成期号
        const LotteryHistory = require('../models/LotteryHistory');
        const latestHistory = await LotteryHistory.findOne(
          { issueNumber: { $regex: /^\d+$/ } }
        ).sort({ drawTime: -1 });
        
        if (latestHistory) {
          const latestIssueNumber = parseInt(latestHistory.issueNumber);
          issueNumber = (latestIssueNumber + 1).toString();
        } else {
          issueNumber = '1';
        }
        
        // 生成6位随机数字奖券号码
        function generateTicketNumber() {
          return Math.floor(100000 + Math.random() * 900000).toString();
        }
        
        ticketNumber = generateTicketNumber();
        
        // 计算有效期（下一次开奖时间）
        const validUntil = new Date();
        const [hours, minutes] = settings.drawTime.split(':').map(Number);
        validUntil.setHours(hours, minutes, 0, 0);
        
        // 如果当前时间已经过了今天的开奖时间，则设置为明天的开奖时间
        if (validUntil <= new Date()) {
          validUntil.setDate(validUntil.getDate() + 1);
        }
        
        // 创建奖券
        const ticket = new LotteryTicket({
          userId,
          employeeId,
          ticketNumber,
          status: '有效',
          issueNumber,
          validUntil
        });
        
        await ticket.save();
      }
    } catch (err) {
      console.error('生成奖券错误:', err);
      // 即使生成奖券失败，也继续发放金币
    }
    
    if (!userGold._id || userGold.isNew) {
      await userGold.save();
    }
    
    // 记录金币日志
    const GoldLog = require('../models/GoldLog');
    let groupCommissionRate = 0;
    
    // 尝试查询员工所在组的提成比例
    try {
      const TeamGroup = require('../models/TeamGroup');
      
      const employee = await Employee.findOne({ employeeId });
      if (employee && employee.teamGroupId) {
        const group = await TeamGroup.findById(employee.teamGroupId);
        if (group) {
          groupCommissionRate = group.commission;
        }
      }
    } catch (err) {
      console.error('查询员工和组信息错误:', err);
      // 即使查询失败，也继续发放金币
    }
    
    const goldLog = new GoldLog({
      userId,
      employeeId,
      deviceId,
      ecpm,
      gold,
      slotId: slotId || '',
      platform: platform || '',
      commissionRate: groupCommissionRate,
      createTime: new Date()
    });
    
    await goldLog.save();
    
    // 计算并添加配置比例到红包池
    const SystemConfig = require('../models/SystemConfig');
    const injectRateConfig = await SystemConfig.findOne({ key: 'redPacketInjectRate' }) || { value: 0.025 };
    const poolAmount = gold * injectRateConfig.value;
    
    // 更新红包池
    let redPacketPoolConfig = await SystemConfig.findOne({ key: 'redPacketPool' });
    if (!redPacketPoolConfig) {
      redPacketPoolConfig = new SystemConfig({ key: 'redPacketPool', value: 1000 });
    }
    redPacketPoolConfig.value += poolAmount;
    await redPacketPoolConfig.save();
    
    // 计算并添加到奖金池
    const LotterySettings = require('../models/LotterySettings');
    settings = await LotterySettings.findOne();
    if (!settings) {
      settings = new LotterySettings();
      await settings.save();
    }
    const lotteryAmount = gold * settings.poolPercentage;
    
    // 更新奖金池
    const LotteryPool = require('../models/LotteryPool');
    let lotteryPool = await LotteryPool.findOne();
    if (!lotteryPool) {
      lotteryPool = new LotteryPool();
    }
    lotteryPool.currentAmount += lotteryAmount;
    lotteryPool.totalAmount += lotteryAmount;
    await lotteryPool.save();
    
    // 红包触发逻辑
    let hasRedPacket = false;
    let redPacketAmount = 0;
    
    // 获取红包配置
    const enabledConfig = await SystemConfig.findOne({ key: 'redPacketEnabled' }) || { value: true };
    const triggerRateConfig = await SystemConfig.findOne({ key: 'redPacketTriggerRate' }) || { value: 0.05 };
    const extractRateConfig = await SystemConfig.findOne({ key: 'redPacketExtractRate' }) || { value: 0.05 };
    const extractRateMinConfig = await SystemConfig.findOne({ key: 'redPacketExtractRateMin' });
    const extractRateMaxConfig = await SystemConfig.findOne({ key: 'redPacketExtractRateMax' });
    
    // 检查红包是否启用
    if (enabledConfig.value) {
      // 根据配置的触发概率
      if (Math.random() < triggerRateConfig.value) {
        // 从红包池抽取配置的百分比金额
        const currentBalance = redPacketPoolConfig.value;
        if (currentBalance > 0) {
          // 计算提取率
          let extractRate;
          if (extractRateMinConfig && extractRateMaxConfig) {
            // 使用范围随机
            const min = extractRateMinConfig.value;
            const max = extractRateMaxConfig.value;
            extractRate = min + Math.random() * (max - min);
          } else {
            // 使用固定值
            extractRate = extractRateConfig.value;
          }
          
          redPacketAmount = Math.floor(currentBalance * extractRate);
          
          // 确保红包金额至少为1
          if (redPacketAmount < 1 && currentBalance >= 1) {
            redPacketAmount = 1;
          }
          
          // 更新红包池余额
          redPacketPoolConfig.value -= redPacketAmount;
          await redPacketPoolConfig.save();
          
          // 记录红包发放
          const RedPacket = require('../models/RedPacket');
          const redPacket = new RedPacket({
            userId,
            employeeId,
            amount: redPacketAmount,
            poolBalanceAfter: redPacketPoolConfig.value
          });
          await redPacket.save();
          
          hasRedPacket = true;
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        gold,
        currentMonthGold: userGold.currentMonthGold,
        hasRedPacket,
        redPacketAmount,
        ticketNumber,
        issueNumber
      }
    });
  } catch (error) {
    console.error('发金币错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 拆红包确认接口
router.post('/red-packet/claim', async (req, res) => {
  try {
    const { userId, employeeId, redPacketAmount } = req.body;
    
    if (!userId || !employeeId || !redPacketAmount || redPacketAmount <= 0) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    // 更新用户金币
    let userGold = await UserGold.findOne({ userId });
    
    if (!userGold) {
      // 如果用户不存在，创建新记录
      userGold = new UserGold({
        userId,
        employeeId,
        currentMonthGold: redPacketAmount,
        lastMonthGold: 0
      });
      await userGold.save();
    } else {
      // 更新当月金币
      await UserGold.updateOne(
        { userId },
        { $inc: { currentMonthGold: redPacketAmount } }
      );
    }
    
    // 记录金币日志
    const GoldLog = require('../models/GoldLog');
    const goldLog = new GoldLog({
      userId,
      employeeId,
      deviceId: 'red_packet',
      ecpm: 0,
      gold: redPacketAmount,
      slotId: '',
      commissionRate: 0,
      createTime: new Date()
    });
    
    await goldLog.save();
    
    res.json({
      success: true,
      message: '红包领取成功',
      data: {
        gold: redPacketAmount,
        currentMonthGold: userGold.currentMonthGold
      }
    });
  } catch (error) {
    console.error('拆红包错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;