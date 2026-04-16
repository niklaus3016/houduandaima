const express = require('express');
const router = express.Router();
const WelfareWallet = require('../models/WelfareWallet');
const WelfareLotteryRecord = require('../models/WelfareLotteryRecord');
const WelfareWithdraw = require('../models/WelfareWithdraw');
const WelfarePrize = require('../models/WelfarePrize');
const authMiddleware = require('../middleware/auth');
const financeMiddleware = require('../middleware/finance');

// 初始化奖品数据
async function initPrizes() {
  try {
    const count = await WelfarePrize.countDocuments();
    if (count === 0) {
      const prizes = [
        { id: '1', name: '1克黄金', value: 500, type: 'gold', probability: 2 },
        { id: '2', name: '1.68元', value: 1.68, type: 'cash', probability: 25 },
        { id: '3', name: '88.8元', value: 88.8, type: 'cash', probability: 5 },
        { id: '4', name: '6.88元', value: 6.88, type: 'cash', probability: 20 },
        { id: '5', name: '千元手机', value: 1000, type: 'phone', probability: 1 },
        { id: '6', name: '16.8元', value: 16.8, type: 'cash', probability: 15 },
        { id: '7', name: '66.8元', value: 66.8, type: 'cash', probability: 10 },
        { id: '8', name: '再接再厉', value: 0, type: 'encourage', probability: 22 }
      ];
      await WelfarePrize.insertMany(prizes);
      console.log('奖品数据初始化成功');
    }
  } catch (error) {
    console.error('初始化奖品数据错误:', error);
  }
}

// 调用初始化函数
initPrizes();

// 1. 获取福利抽奖信息
router.get('/welfare/lottery/info', authMiddleware, async (req, res) => {
  try {
    const { userId, employeeId } = req.query;
    
    if (!employeeId) {
      return res.status(400).json({ success: false, message: '员工号不能为空' });
    }
    
    let wallet = await WelfareWallet.findOne({ employeeId });
    if (!wallet) {
      // 如果用户钱包不存在，创建一个新的
      wallet = new WelfareWallet({
        userId: userId || '',
        employeeId,
        balance: 0,
        chances: 3 // 初始3次抽奖机会
      });
      await wallet.save();
    }
    
    res.json({
      success: true,
      data: {
        balance: wallet.balance,
        chances: wallet.chances
      }
    });
  } catch (error) {
    console.error('获取福利抽奖信息错误:', error);
    res.status(500).json({ success: false, message: '获取信息失败' });
  }
});

// 2. 获取福利抽奖奖品列表
router.get('/welfare/lottery/prizes', async (req, res) => {
  try {
    const prizes = await WelfarePrize.find().sort({ id: 1 });
    
    const formattedPrizes = prizes.map(prize => ({
      id: prize.id,
      name: prize.name,
      value: prize.value,
      type: prize.type,
      probability: prize.probability
    }));
    
    res.json({
      success: true,
      data: {
        prizes: formattedPrizes
      }
    });
  } catch (error) {
    console.error('获取奖品列表错误:', error);
    res.status(500).json({ success: false, message: '获取奖品列表失败' });
  }
});

// 3. 领取福利抽奖
router.post('/welfare/lottery/claim', authMiddleware, async (req, res) => {
  try {
    const { userId, employeeId } = req.body;
    
    if (!userId || !employeeId) {
      return res.status(400).json({ success: false, message: '用户ID和员工号不能为空' });
    }
    
    // 获取用户钱包
    let wallet = await WelfareWallet.findOne({ userId, employeeId });
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

// 4. 获取福利抽奖记录
router.get('/welfare/lottery/records', authMiddleware, async (req, res) => {
  try {
    const { userId, employeeId } = req.query;
    
    if (!employeeId) {
      return res.status(400).json({ success: false, message: '员工号不能为空' });
    }
    
    const records = await WelfareLotteryRecord.find({ employeeId })
      .sort({ createdAt: -1 });
    
    const formattedRecords = records.map(record => ({
      id: record._id.toString(),
      time: record.createdAt,
      name: record.prizeName,
      value: record.prizeValue,
      type: record.prizeType
    }));
    
    res.json({
      success: true,
      data: {
        records: formattedRecords
      }
    });
  } catch (error) {
    console.error('获取抽奖记录错误:', error);
    res.status(500).json({ success: false, message: '获取记录失败' });
  }
});

// 5. 福利钱包提现
router.post('/welfare/withdraw', authMiddleware, async (req, res) => {
  try {
    const { userId, employeeId, amount, alipayAccount, alipayName } = req.body;
    
    if (!userId || !employeeId || !amount || !alipayAccount || !alipayName) {
      return res.status(400).json({ success: false, message: '参数不能为空' });
    }
    
    // 检查金额
    if (amount <= 0) {
      return res.status(400).json({ success: false, message: '提现金额必须大于0' });
    }
    
    // 获取用户钱包
    const wallet = await WelfareWallet.findOne({ userId, employeeId });
    if (!wallet) {
      return res.status(400).json({ success: false, message: '用户钱包不存在' });
    }
    
    // 检查余额
    if (wallet.balance < amount) {
      return res.status(400).json({ success: false, message: '余额不足' });
    }
    
    // 扣除余额
    wallet.balance -= amount;
    await wallet.save();
    
    // 创建提现记录
    const withdrawRecord = new WelfareWithdraw({
      userId,
      employeeId,
      amount,
      alipayAccount,
      alipayName,
      status: 'processing'
    });
    await withdrawRecord.save();
    
    res.json({
      success: true,
      message: '提现申请已提交，等待处理',
      data: {
        success: true
      }
    });
  } catch (error) {
    console.error('提现错误:', error);
    res.status(500).json({ success: false, message: '提现失败' });
  }
});

// 6. 获取福利钱包余额
router.get('/welfare/wallet/balance', authMiddleware, async (req, res) => {
  try {
    const { userId, employeeId } = req.query;
    
    if (!employeeId) {
      return res.status(400).json({ success: false, message: '员工号不能为空' });
    }
    
    let wallet = await WelfareWallet.findOne({ employeeId });
    if (!wallet) {
      // 如果用户钱包不存在，创建一个新的
      wallet = new WelfareWallet({
        userId: userId || '',
        employeeId,
        balance: 0,
        chances: 3
      });
      await wallet.save();
    }
    
    res.json({
      success: true,
      data: {
        balance: wallet.balance
      }
    });
  } catch (error) {
    console.error('获取余额错误:', error);
    res.status(500).json({ success: false, message: '获取余额失败' });
  }
});

// 7. 获取提现记录
router.get('/welfare/withdraw/records', authMiddleware, async (req, res) => {
  try {
    const { userId, employeeId } = req.query;
    
    if (!employeeId) {
      return res.status(400).json({ success: false, message: '员工号不能为空' });
    }
    
    const records = await WelfareWithdraw.find({ employeeId })
      .sort({ createdAt: -1 });
    
    const statusMap = {
      processing: { text: '处理中', color: 'text-blue-400' },
      completed: { text: '已到账', color: 'text-green-400' },
      failed: { text: '失败', color: 'text-red-400' }
    };
    
    const formattedRecords = records.map(record => ({
      id: record._id.toString(),
      time: record.createdAt,
      amount: record.amount,
      status: record.status,
      statusText: statusMap[record.status].text,
      statusColor: statusMap[record.status].color
    }));
    
    res.json({
      success: true,
      data: {
        records: formattedRecords
      }
    });
  } catch (error) {
    console.error('获取提现记录错误:', error);
    res.status(500).json({ success: false, message: '获取提现记录失败' });
  }
});

// 8. 绑定支付宝信息
router.post('/welfare/bind-alipay', authMiddleware, async (req, res) => {
  try {
    const { userId, employeeId, alipayName, alipayAccount } = req.body;
    
    if (!userId || !employeeId || !alipayName || !alipayAccount) {
      return res.status(400).json({ success: false, message: '参数不能为空' });
    }
    
    // 查找或创建用户钱包
    let wallet = await WelfareWallet.findOne({ userId, employeeId });
    if (!wallet) {
      wallet = new WelfareWallet({
        userId,
        employeeId,
        balance: 0,
        chances: 3
      });
    }
    
    // 更新支付宝信息
    wallet.alipayName = alipayName;
    wallet.alipayAccount = alipayAccount;
    wallet.updatedAt = new Date();
    await wallet.save();
    
    res.json({
      success: true,
      message: '绑定成功',
      data: {
        alipayName,
        alipayAccount
      }
    });
  } catch (error) {
    console.error('绑定支付宝错误:', error);
    res.status(500).json({ success: false, message: '绑定失败' });
  }
});

// 9. 获取绑定的支付宝信息
router.get('/welfare/get-alipay', authMiddleware, async (req, res) => {
  try {
    const { userId, employeeId } = req.query;
    
    if (!employeeId) {
      return res.status(400).json({ success: false, message: '员工号不能为空' });
    }
    
    // 从用户钱包中获取支付宝信息
    const wallet = await WelfareWallet.findOne({ employeeId });
    
    if (!wallet) {
      return res.status(400).json({ success: false, message: '用户钱包不存在' });
    }
    
    res.json({
      success: true,
      data: {
        alipayName: wallet.alipayName || '',
        alipayAccount: wallet.alipayAccount || ''
      }
    });
  } catch (error) {
    console.error('获取支付宝信息错误:', error);
    res.status(500).json({ success: false, message: '获取支付宝信息失败' });
  }
});

// 10. 超管调整奖品概率
router.post('/welfare/admin/update-prize', financeMiddleware, async (req, res) => {
  try {
    const { id, probability } = req.body;
    
    if (!id || probability === undefined) {
      return res.status(400).json({ success: false, message: '奖品ID和概率不能为空' });
    }
    
    // 检查概率是否在合理范围内
    if (probability < 0 || probability > 100) {
      return res.status(400).json({ success: false, message: '概率必须在0-100之间' });
    }
    
    // 更新奖品概率
    const prize = await WelfarePrize.findOneAndUpdate(
      { id },
      { probability, updatedAt: new Date() },
      { new: true }
    );
    
    if (!prize) {
      return res.status(400).json({ success: false, message: '奖品不存在' });
    }
    
    res.json({
      success: true,
      message: '奖品概率更新成功',
      data: {
        id: prize.id,
        name: prize.name,
        probability: prize.probability
      }
    });
  } catch (error) {
    console.error('更新奖品概率错误:', error);
    res.status(500).json({ success: false, message: '更新奖品概率失败' });
  }
});

// 11. 超管获取所有奖品列表（用于管理）
router.get('/welfare/admin/prizes', financeMiddleware, async (req, res) => {
  try {
    const prizes = await WelfarePrize.find().sort({ id: 1 });
    
    const formattedPrizes = prizes.map(prize => ({
      id: prize.id,
      name: prize.name,
      value: prize.value,
      type: prize.type,
      probability: prize.probability
    }));
    
    res.json({
      success: true,
      data: {
        prizes: formattedPrizes
      }
    });
  } catch (error) {
    console.error('获取奖品列表错误:', error);
    res.status(500).json({ success: false, message: '获取奖品列表失败' });
  }
});

// 12. 超管获取待处理的提现申请列表
router.get('/welfare/admin/withdraw/list', financeMiddleware, async (req, res) => {
  try {
    const withdrawals = await WelfareWithdraw.find({ status: 'processing' })
      .sort({ createdAt: -1 });
    
    const formattedWithdrawals = withdrawals.map(withdrawal => ({
      id: withdrawal._id.toString(),
      userId: withdrawal.userId,
      employeeId: withdrawal.employeeId,
      amount: withdrawal.amount,
      alipayAccount: withdrawal.alipayAccount,
      alipayName: withdrawal.alipayName,
      time: withdrawal.createdAt,
      status: withdrawal.status
    }));
    
    res.json({
      success: true,
      data: {
        withdrawals: formattedWithdrawals
      }
    });
  } catch (error) {
    console.error('获取待处理提现列表错误:', error);
    res.status(500).json({ success: false, message: '获取提现列表失败' });
  }
});

// 13. 超管处理提现申请
router.post('/welfare/admin/withdraw/process', financeMiddleware, async (req, res) => {
  try {
    const { id, status } = req.body;
    
    if (!id || !status) {
      return res.status(400).json({ success: false, message: '提现申请ID和处理状态不能为空' });
    }
    
    // 检查状态是否合法
    if (!['completed', 'failed'].includes(status)) {
      return res.status(400).json({ success: false, message: '处理状态必须是completed或failed' });
    }
    
    // 更新提现状态
    const withdrawal = await WelfareWithdraw.findByIdAndUpdate(
      id,
      { status, updatedAt: new Date() },
      { new: true }
    );
    
    if (!withdrawal) {
      return res.status(400).json({ success: false, message: '提现申请不存在' });
    }
    
    // 如果处理失败，恢复用户余额
    if (status === 'failed') {
      const wallet = await WelfareWallet.findOne({
        userId: withdrawal.userId,
        employeeId: withdrawal.employeeId
      });
      
      if (wallet) {
        wallet.balance += withdrawal.amount;
        await wallet.save();
      }
    }
    
    res.json({
      success: true,
      message: '提现申请处理成功',
      data: {
        id: withdrawal._id.toString(),
        status: withdrawal.status
      }
    });
  } catch (error) {
    console.error('处理提现申请错误:', error);
    res.status(500).json({ success: false, message: '处理提现申请失败' });
  }
});

// 14. 超管获取所有提现记录
router.get('/welfare/admin/withdraw/records', financeMiddleware, async (req, res) => {
  try {
    const withdrawals = await WelfareWithdraw.find()
      .sort({ createdAt: -1 });
    
    const statusMap = {
      processing: { text: '处理中', color: 'text-blue-400' },
      completed: { text: '已到账', color: 'text-green-400' },
      failed: { text: '失败', color: 'text-red-400' }
    };
    
    const formattedWithdrawals = withdrawals.map(withdrawal => ({
      id: withdrawal._id.toString(),
      userId: withdrawal.userId,
      employeeId: withdrawal.employeeId,
      amount: withdrawal.amount,
      alipayAccount: withdrawal.alipayAccount,
      alipayName: withdrawal.alipayName,
      time: withdrawal.createdAt,
      status: withdrawal.status,
      statusText: statusMap[withdrawal.status].text,
      statusColor: statusMap[withdrawal.status].color
    }));
    
    res.json({
      success: true,
      data: {
        withdrawals: formattedWithdrawals
      }
    });
  } catch (error) {
    console.error('获取提现记录错误:', error);
    res.status(500).json({ success: false, message: '获取提现记录失败' });
  }
});

module.exports = router;
