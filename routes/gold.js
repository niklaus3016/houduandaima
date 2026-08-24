const express = require('express');
const router = express.Router();
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const GoldDeduction = require('../models/GoldDeduction');
const SystemConfig = require('../models/SystemConfig');
const authMiddleware = require('../middleware/auth');
const { getBeijingDate } = require('../utils/date');

// 系统配置缓存
const configCache = {
  commissionRate: { value: 0.5, expiry: 0 },
  redPacketInjectRate: { value: 0.025, expiry: 0 },
  poolPercentage: { value: 0.1, expiry: 0 }
};
const CONFIG_CACHE_TTL = 10000; // 10秒缓存（commissionRate一天变几十次，需要及时更新）

// LotterySettings 缓存
let lotterySettingsCache = null;
let lotterySettingsCacheTime = 0;
const LOTTERY_SETTINGS_CACHE_TTL = 60000; // 60秒

// WelfareSettings 缓存
let welfareSettingsCache = null;
let welfareSettingsCacheTime = 0;
const WELFARE_SETTINGS_CACHE_TTL = 60000; // 60秒

// 员工组别提成缓存
const employeeGroupCache = new Map();
const EMPLOYEE_GROUP_CACHE_TTL = 60000; // 60秒

function cleanExpiredEmployeeCache() {
  const now = Date.now();
  for (const [key, value] of employeeGroupCache.entries()) {
    if (now - value.time >= EMPLOYEE_GROUP_CACHE_TTL) {
      employeeGroupCache.delete(key);
    }
  }
}

function getEmployeeGroupCache(employeeId) {
  const cached = employeeGroupCache.get(employeeId);
  if (cached && (Date.now() - cached.time) < EMPLOYEE_GROUP_CACHE_TTL) {
    return cached.commission;
  }
  return null;
}

function setEmployeeGroupCache(employeeId, commission) {
  if (employeeGroupCache.size > 1000) {
    cleanExpiredEmployeeCache();
  }
  employeeGroupCache.set(employeeId, { commission, time: Date.now() });
}

async function getConfig(key) {
  const now = Date.now();
  if (configCache[key] && now < configCache[key].expiry) {
    return configCache[key].value;
  }
  
  try {
    const config = await SystemConfig.findOne({ key });
    if (config) {
      configCache[key] = { value: config.value, expiry: now + CONFIG_CACHE_TTL };
      return config.value;
    }
  } catch (err) {
    console.error(`查询系统配置 ${key} 错误:`, err);
  }
  return null;
}

// 获取福利设置（带缓存）
async function getWelfareSettings() {
  const now = Date.now();
  if (welfareSettingsCache && (now - welfareSettingsCacheTime) < WELFARE_SETTINGS_CACHE_TTL) {
    return welfareSettingsCache;
  }
  try {
    const WelfareSettings = require('../models/WelfareSettings');
    let settings = await WelfareSettings.findOne();
    if (!settings) {
      settings = new WelfareSettings();
      await settings.save();
    }
    welfareSettingsCache = settings;
    welfareSettingsCacheTime = now;
    return settings;
  } catch (err) {
    console.error('获取福利设置错误:', err);
    return null;
  }
}

// 上报ECPM发金币
router.post('/reward', async (req, res) => {
  try {
    const { userId, employeeId, ecpm, slotId, deviceId } = req.body;

    if (!userId || !employeeId || !ecpm || !deviceId) {
      return res.status(400).json({ success: false, message: '缺少必要参数' });
    }

    let platform = '';
    if (slotId && /^10\d{6,10}$/.test(slotId)) {
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
      commissionRate = await getConfig('commissionRate');
      if (commissionRate === null) commissionRate = 0.5;
    }

    // 获取彩票设置（带缓存，只查一次）
    const LotterySettings = require('../models/LotterySettings');
    let settings = null;
    if (lotterySettingsCache && (Date.now() - lotterySettingsCacheTime) < LOTTERY_SETTINGS_CACHE_TTL) {
      settings = lotterySettingsCache;
    } else {
      settings = await LotterySettings.findOne();
      if (!settings) {
        settings = new LotterySettings();
        await settings.save();
      }
      lotterySettingsCache = settings;
      lotterySettingsCacheTime = Date.now();
    }

    // 计算金币（ECPM * 分成比例）
    const gold = ecpm * commissionRate;

    // 更新用户金币和广告次数
    let userGold = await UserGold.findOne({ userId });
    let shouldGenerateTicket = false;

    if (!userGold) {
      userGold = new UserGold({
        userId,
        employeeId,
        currentMonthGold: gold,
        lastMonthGold: 0,
        adCount: 1
      });
      shouldGenerateTicket = 1 >= settings.adCountThreshold;
    } else {
      const newAdCount = userGold.adCount + 1;
      shouldGenerateTicket = newAdCount >= settings.adCountThreshold;
      
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

    if (shouldGenerateTicket) {
      try {
        const LotteryTicket = require('../models/LotteryTicket');
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

        ticketNumber = Math.floor(100000 + Math.random() * 900000).toString();

        const validUntil = new Date();
        const [hours, minutes] = settings.drawTime.split(':').map(Number);
        validUntil.setHours(hours, minutes, 0, 0);
        if (validUntil <= new Date()) {
          validUntil.setDate(validUntil.getDate() + 1);
        }

        const ticket = new LotteryTicket({
          userId,
          employeeId,
          ticketNumber,
          status: '有效',
          issueNumber,
          validUntil
        });

        await ticket.save();
      } catch (err) {
        console.error('生成奖券错误:', err);
      }
    }

    if (!userGold._id || userGold.isNew) {
      await userGold.save();
    }

    // ✅ 记录金币流水：3个分账字段（commissionRate / tlCommissionRate / parentTlCommissionRate）
    //    完全交给 GoldLog.pre('save') 钩子统一固化：
    //    - 查 Admin(groupLeaderId).commission（组长晋升后的新职级值，不依赖TeamGroup.commission老值）
    //    - 兼容 teamGroupId 存组长Admin._id的老存储（groupLeaderId fallback查询）
    //    - 平级/倒挂 上级保底2%、2级封顶、G不沾上级上级等复杂规则
    //    【禁止】在此处手动传 commissionRate/tlCommissionRate/parentTlCommissionRate，避免与固化逻辑冲突、错发漏发。
    const goldLog = new GoldLog({
      userId,
      employeeId,
      deviceId,
      ecpm,
      gold,
      slotId: slotId || '',
      platform: platform || '',
      createTime: new Date()
    });

    await goldLog.save();

    // 计算并添加到红包池（使用 upsert 原子操作）
    let injectRate = await getConfig('redPacketInjectRate');
    if (injectRate === null) injectRate = 0.025;
    const redPacketAmount = gold * injectRate;

    await SystemConfig.findOneAndUpdate(
      { key: 'redPacketPool' },
      { 
        $inc: { value: redPacketAmount },
        $setOnInsert: { key: 'redPacketPool' }
      },
      { upsert: true, new: true }
    );

    // 计算并添加到奖金池（使用 upsert 原子操作）
    const lotteryAmount = gold * settings.poolPercentage;

    const LotteryPool = require('../models/LotteryPool');
    await LotteryPool.findOneAndUpdate(
      {},
      {
        $inc: { currentAmount: lotteryAmount, totalAmount: lotteryAmount },
        $setOnInsert: {}
      },
      { upsert: true, new: true }
    );

    // ===== 福利钱包抽奖机会逻辑 =====
    try {
      const WelfareWallet = require('../models/WelfareWallet');
      
      // 获取今天的日期（北京时间）
      const now = new Date();
      const offset = 8 * 60 * 60 * 1000; // 北京时间UTC+8偏移量
      const beijingTime = new Date(now.getTime() + offset);
      const todayStr = beijingTime.toISOString().split('T')[0];
      
      // 获取福利配置（使用缓存）
      let welfareSettings = await getWelfareSettings();
      if (!welfareSettings) {
        welfareSettings = { thresholds: [] }; // 默认配置
      }
      
      // 使用 upsert 原子操作更新福利钱包（避免先查询再保存的两次数据库操作）
      const updateResult = await WelfareWallet.findOneAndUpdate(
        { userId, employeeId },
        {
          $setOnInsert: {
            userId,
            employeeId,
            balance: 0,
            chances: 0,
            todayAdCount: 0,
            lastAwardedThresholdIndex: -1,
            countDate: todayStr
          },
          $set: {
            countDate: todayStr
          },
          $inc: {
            todayAdCount: 1
          }
        },
        { upsert: true, new: true }
      );
      
      // 检查是否需要重置每日计数
      const currentAdCount = updateResult.todayAdCount;
      const lastThresholdIndex = updateResult.lastAwardedThresholdIndex;
      
      // 检查是否达到阈值，发放抽奖机会
      const thresholds = welfareSettings.thresholds || [];
      let totalNewChances = 0;
      let newThresholdIndex = lastThresholdIndex;
      
      for (let i = 0; i < thresholds.length; i++) {
        const threshold = thresholds[i];
        if (i > lastThresholdIndex && currentAdCount >= threshold.adCount) {
          totalNewChances += threshold.giveChances;
          newThresholdIndex = i;
        }
      }
      
      // 如果有新发放的抽奖机会，更新钱包
      if (totalNewChances > 0) {
        await WelfareWallet.updateOne(
          { userId, employeeId },
          { 
            $inc: { chances: totalNewChances },
            $set: { lastAwardedThresholdIndex: newThresholdIndex }
          }
        );
      }
    } catch (welfareError) {
      console.error('福利钱包处理错误:', welfareError);
    }
    // ===== 福利钱包抽奖机会逻辑结束 =====

    res.json({
      success: true,
      message: '金币发放成功',
      data: {
        gold,
        currentMonthGold: userGold.currentMonthGold,
        ticketNumber,
        issueNumber
      }
    });
  } catch (error) {
    console.error('发金币错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取金币记录
router.get('/log', async (req, res) => {
  try {
    const { userId, deviceId, employeeId, limit = 200 } = req.query;
    
    // 构建查询条件
    const query = {};
    if (userId) {
      query.userId = userId;
    }
    if (deviceId) {
      query.deviceId = deviceId;
    }
    if (employeeId) {
      query.employeeId = employeeId;
    }
    
    // 如果没有提供任何查询参数，返回错误
    if (Object.keys(query).length === 0) {
      return res.status(400).json({ success: false, message: '缺少userId、deviceId或employeeId参数' });
    }
    
    // 确保limit是有效的数字，最大限制为10000
    const limitNum = Math.min(parseInt(limit) || 200, 10000);
    
    // 获取金币记录，支持自定义 limit 参数
    const goldLogs = await GoldLog.find(query)
      .sort({ createTime: -1 })
      .limit(limitNum);
    
    res.json({ success: true, data: goldLogs, limit: limitNum });
  } catch (error) {
    console.error('获取金币记录错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 执行金币核减操作
router.post('/deduct', authMiddleware, async (req, res) => {
  try {
    const { deductionRate } = req.body;
    const operator = req.admin?.username || 'admin';
    
    if (deductionRate === undefined || deductionRate < 0 || deductionRate > 1) {
      return res.status(400).json({ success: false, message: '核减率无效，请输入0-1之间的小数' });
    }
    
    // 获取所有有上月金币的用户
    const users = await UserGold.find({ lastMonthGold: { $gt: 0 } });
    const affectedUsers = users.length;
    
    // 批量更新用户的lastMonthGold
    const bulkOps = users.map(user => ({
      updateOne: {
        filter: { _id: user._id },
        update: { $set: { lastMonthGold: Math.floor(user.lastMonthGold * (1 - deductionRate)) } }
      }
    }));
    
    if (bulkOps.length > 0) {
      await UserGold.bulkWrite(bulkOps);
    }
    
    // 记录核减操作
    const deductionRecord = new GoldDeduction({
      deductionRate,
      affectedUsers,
      operator,
      status: 'success',
      remark: `核减率${deductionRate * 100}%`
    });
    await deductionRecord.save();
    
    res.json({
      success: true,
      message: '核减成功',
      data: {
        affectedUsers,
        deductionRate
      }
    });
  } catch (error) {
    console.error('金币核减错误:', error);
    
    // 记录失败的操作
    const deductionRecord = new GoldDeduction({
      deductionRate: req.body.deductionRate || 0,
      affectedUsers: 0,
      operator: req.admin?.username || 'admin',
      status: 'failed',
      remark: error.message
    });
    await deductionRecord.save();
    
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取今日金币统计（全局）- 使用北京时间
router.get('/today-stats', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: '缺少userId参数' });
    }
    
    // 获取北京时间今日开始
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayBeijing = new Date(beijingNow);
    todayBeijing.setHours(0, 0, 0, 0);
    const todayStart = new Date(todayBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 获取北京时间昨日开始
    const yesterdayBeijing = new Date(beijingNow);
    yesterdayBeijing.setUTCDate(yesterdayBeijing.getUTCDate() - 1);
    yesterdayBeijing.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(yesterdayBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 获取北京时间今日结束（昨日结束）
    const todayEndBeijing = new Date(beijingNow);
    todayEndBeijing.setHours(0, 0, 0, 0);
    const yesterdayEnd = new Date(todayEndBeijing.getTime() - 8 * 60 * 60 * 1000);
    
    // 查询今日所有设备的金币记录（北京时间）
    const todayLogs = await GoldLog.find({
      userId,
      createTime: { $gte: todayStart }
    });
    
    // 查询昨日所有设备的金币记录（北京时间）
    const yesterdayLogs = await GoldLog.find({
      userId,
      createTime: { $gte: yesterdayStart, $lt: yesterdayEnd }
    });
    
    // 统计金币总数和记录数
    const todayCoins = todayLogs.reduce((sum, log) => sum + (log.gold || 0), 0);
    const todayRecordCount = todayLogs.length;
    const yesterdayRecordCount = yesterdayLogs.length;
    
    res.json({
      success: true,
      data: {
        todayCoins,
        todayRecordCount,
        yesterdayRecordCount
      }
    });
  } catch (error) {
    console.error('获取今日金币统计错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取核减历史记录
router.get('/deduct/history', async (req, res) => {
  try {
    const records = await GoldDeduction.find()
      .sort({ createdAt: -1 })
      .limit(50);
    
    res.json({
      success: true,
      data: records
    });
  } catch (error) {
    console.error('获取核减历史错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 超管调整用户金币
router.post('/admin/adjust', authMiddleware, async (req, res) => {
  try {
    const { employeeId, currentMonthGold, lastMonthGold, reason } = req.body;
    const operator = req.admin?.username || 'admin';
    
    if (!employeeId) {
      return res.status(400).json({ success: false, message: '缺少员工ID参数' });
    }
    
    // 查找用户金币记录
    const userGold = await UserGold.findOne({ employeeId });
    if (!userGold) {
      return res.status(404).json({ success: false, message: '用户金币记录不存在' });
    }
    
    // 记录调整前的金币数量
    const oldCurrentMonthGold = userGold.currentMonthGold;
    const oldLastMonthGold = userGold.lastMonthGold;
    
    // 调整金币
    if (currentMonthGold !== undefined) {
      userGold.currentMonthGold = currentMonthGold;
    }
    if (lastMonthGold !== undefined) {
      userGold.lastMonthGold = lastMonthGold;
    }
    
    await userGold.save();
    
    // 记录调整操作（可以根据需要创建新的模型来记录调整历史）
    console.log(`超管 ${operator} 调整用户 ${employeeId} 的金币: 本月金币从 ${oldCurrentMonthGold} 调整为 ${userGold.currentMonthGold}, 上月金币从 ${oldLastMonthGold} 调整为 ${userGold.lastMonthGold}, 原因: ${reason || '无'}`);
    
    res.json({
      success: true,
      message: '金币调整成功',
      data: {
        employeeId,
        currentMonthGold: userGold.currentMonthGold,
        lastMonthGold: userGold.lastMonthGold,
        totalGold: userGold.currentMonthGold + userGold.lastMonthGold
      }
    });
  } catch (error) {
    console.error('调整金币错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// 获取用户金币详情
router.get('/admin/user/:employeeId', authMiddleware, async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    const userGold = await UserGold.findOne({ employeeId });
    if (!userGold) {
      return res.status(404).json({ success: false, message: '用户金币记录不存在' });
    }
    
    res.json({
      success: true,
      data: {
        employeeId: userGold.employeeId,
        currentMonthGold: userGold.currentMonthGold,
        lastMonthGold: userGold.lastMonthGold,
        totalGold: userGold.currentMonthGold + userGold.lastMonthGold,
        adCount: userGold.adCount
      }
    });
  } catch (error) {
    console.error('获取用户金币详情错误:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

module.exports = router;
