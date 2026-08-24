// 修复抽奖接口查询逻辑
const express = require('express');
const router = express.Router();
const WelfareWallet = require('../models/WelfareWallet');
const WelfareLotteryRecord = require('../models/WelfareLotteryRecord');
const WelfarePrize = require('../models/WelfarePrize');
const authMiddleware = require('../middleware/auth');

// 修复后的抽奖接口
router.post('/welfare/lottery/claim', authMiddleware, async (req, res) => {
  try {
    const { userId, employeeId: bodyEmployeeId } = req.body;
    const employeeId = bodyEmployeeId || req.user.username;

    if (!employeeId) {
      return res.status(400).json({ success: false, message: '员工号不能为空' });
    }

    let wallet;
    if (userId && userId.trim()) {
      wallet = await WelfareWallet.findOne({ userId, employeeId });
    }
    if (!wallet) {
      wallet = await WelfareWallet.findOne({ employeeId });
    }
    if (!wallet) {
      return res.status(400).json({ success: false, message: '用户钱包不存在' });
    }

    // 检查抽奖机会
    if (wallet.chances <= 0) {
      return res.status(400).json({ success: false, message: '抽奖机会不足' });
    }

    // 从数据库获取奖品数据
    const prizes = await WelfarePrize.find();

    // 计算总概率
    const totalProbability = prizes.reduce((sum, prize) => sum + prize.probability, 0);

    // 生成随机数
    const random = Math.random() * totalProbability;

    // 确定中奖结果
    let currentProbability = 0;
    let winningPrize = null;

    for (const prize of prizes) {
      currentProbability += prize.probability;
      if (random <= currentProbability) {
        winningPrize = prize;
        break;
      }
    }

    // 扣除抽奖机会
    wallet.chances -= 1;

    // 如果中奖是现金，增加余额
    if (winningPrize.type === 'cash' && winningPrize.value > 0) {
      wallet.balance += winningPrize.value;
    }

    // 保存钱包更新
    await wallet.save();

    // 记录抽奖结果
    const lotteryRecord = new WelfareLotteryRecord({
      userId,
      employeeId,
      prizeId: winningPrize.id,
      prizeName: winningPrize.name,
      prizeValue: winningPrize.value,
      prizeType: winningPrize.type
    });
    await lotteryRecord.save();

    res.json({
      success: true,
      data: {
        result: {
          id: winningPrize.id,
          name: winningPrize.name,
          value: winningPrize.value,
          type: winningPrize.type
        }
      }
    });
  } catch (error) {
    console.error('抽奖错误:', error);
    res.status(500).json({ success: false, message: '抽奖失败' });
  }
});

module.exports = router;