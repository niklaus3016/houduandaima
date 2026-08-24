const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const AdRewardRecord = require('../models/AdRewardRecord');
const UserGold = require('../models/UserGold');
const GoldLog = require('../models/GoldLog');
const SystemConfig = require('../models/SystemConfig');

router.use(express.urlencoded({ extended: true }));

const CALLBACK_KEY = process.env.GROMORE_CALLBACK_KEY || 'f75fd222550b0222a50835b4f33b4746';
const TIMESTAMP_EXPIRE_MS = 5 * 60 * 1000;

// GroMore 回调固定分成比例 40%（不走 SystemConfig.commissionRate）
// 仅影响 platform='csj'（GroMore 服务端回调）的金币计算，不影响百度/ks 等前端上报的金币
const GROMORE_FIXED_COMMISSION_RATE = 0.4;

function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

function verifySign(params, key) {
  const sign = params.sign;
  const sortedKeys = Object.keys(params).filter(k => k !== 'sign').sort();
  
  let str = '';
  for (const k of sortedKeys) {
    const v = params[k];
    if (v !== undefined && v !== null) {
      if (str) str += '&';
      str += `${k}=${v}`;
    }
  }
  str += `&key=${key}`;
  
  const computedSign = md5(str);
  return computedSign === sign;
}

router.post('/gromore/rewardNotify', async (req, res) => {
  try {
    const params = req.body;
    
    const trans_id = params.trans_id;
    const user_id = params.user_id;
    const sign = params.sign;
    const ecpm = parseInt(params.ecpm) || 0;
    const rit_id = params.rit_id;
    const slot_id = params.slot_id;
    const adn = params.adn;
    const reward_amount = parseInt(params.reward_amount) || 1;
    const reward_name = params.reward_name;
    const extra = params.extra;
    const timestamp = parseInt(params.timestamp) || 0;

    if (!trans_id || !user_id || !sign) {
      console.warn('[GroMore回调] 参数缺失:', { trans_id, user_id });
      return res.send('fail');
    }

    if (!verifySign(params, CALLBACK_KEY)) {
      console.warn('[GroMore回调] 签名验证失败:', trans_id);
      return res.send('fail');
    }

    const now = Date.now();
    if (timestamp && (now - timestamp) > TIMESTAMP_EXPIRE_MS) {
      console.warn('[GroMore回调] 时间戳过期:', trans_id, now - timestamp);
      return res.send('fail');
    }

    const existingRecord = await AdRewardRecord.findOne({ trans_id });
    if (existingRecord) {
      console.info('[GroMore回调] 订单已处理:', trans_id);
      return res.send('success');
    }

    let employeeId = '';
    let deviceId = '';
    
    try {
      if (extra) {
        const extraObj = typeof extra === 'string' ? JSON.parse(extra) : extra;
        employeeId = extraObj.employeeId || '';
        deviceId = extraObj.deviceId || '';
      }
    } catch (e) {
      console.warn('[GroMore回调] 解析extra失败:', e.message);
    }

    let isAwarded = 0;
    let reason = '';

    try {
      if (!employeeId) {
        const userGold = await UserGold.findOne({ userId: user_id }).select('employeeId').lean();
        if (userGold) {
          employeeId = userGold.employeeId;
        }
      }

      if (!employeeId) {
        reason = '无法找到employeeId';
        console.warn('[GroMore回调] 无法找到employeeId:', user_id);
      } else {
        // GroMore 回调固定按 40% 分成（硬编码，不走 SystemConfig.commissionRate）
        // 若后续需要调整，改顶部常量 GROMORE_FIXED_COMMISSION_RATE
        const rate = GROMORE_FIXED_COMMISSION_RATE;
        
        const gold = ecpm * rate;

        let userGold = await UserGold.findOne({ userId: user_id });
        if (!userGold) {
          userGold = new UserGold({
            userId: user_id,
            employeeId: employeeId,
            currentMonthGold: gold,
            lastMonthGold: 0,
            adCount: 1
          });
          await userGold.save();
        } else {
          await UserGold.updateOne(
            { userId: user_id },
            { $inc: { currentMonthGold: gold, adCount: 1 } }
          );
          userGold.currentMonthGold += gold;
          userGold.adCount += 1;
        }

        const goldLog = new GoldLog({
          userId: user_id,
          employeeId: employeeId,
          deviceId: deviceId,
          ecpm: ecpm,
          gold: gold,
          slotId: slot_id || '',
          platform: 'csj',
          createTime: new Date()
        });
        await goldLog.save();

        const injectRate = await SystemConfig.findOne({ key: 'redPacketInjectRate' }).lean();
        const rateVal = injectRate?.value !== undefined ? injectRate.value : 0.025;
        const redPacketAmount = gold * rateVal;
        
        await SystemConfig.findOneAndUpdate(
          { key: 'redPacketPool' },
          { $inc: { value: redPacketAmount }, $setOnInsert: { key: 'redPacketPool' } },
          { upsert: true }
        );

        isAwarded = 1;
        reason = '正常发奖';
        console.info('[GroMore回调] 发奖成功:', { user_id, employeeId, ecpm, gold });
      }
    } catch (e) {
      reason = '发奖失败: ' + e.message;
      console.error('[GroMore回调] 发奖异常:', { trans_id, user_id, error: e.message });
    }

    await AdRewardRecord.create({
      trans_id,
      user_id,
      employeeId,
      slot_id: slot_id || '',
      rit_id: rit_id || '',
      adn: adn || '',
      ecpm: ecpm || 0,
      reward_amount: reward_amount || 1,
      reward_name: reward_name || '金币',
      extra: extra || '',
      is_awarded: isAwarded,
      reason
    });

    return res.send('success');
  } catch (error) {
    console.error('[GroMore回调] 处理异常:', error.message);
    return res.send('fail');
  }
});

module.exports = router;