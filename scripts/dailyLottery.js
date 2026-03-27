const mongoose = require('mongoose');
const SystemConfig = require('../models/SystemConfig');
const LotteryTicket = require('../models/LotteryTicket');
const LotteryHistory = require('../models/LotteryHistory');

// 获取北京时间
function getBeijingTime() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 检查是否到达北京时间凌晨1:30
function isTimeToRun() {
  const beijingTime = getBeijingTime();
  return beijingTime.getHours() === 1 && beijingTime.getMinutes() === 30;
}

// 连接MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 检查是否到达开奖时间
    if (isTimeToRun()) {
      await runLottery();
    } else {
      const beijingTime = getBeijingTime();
      console.log(`当前北京时间: ${beijingTime.toISOString()}`);
      console.log('未到开奖时间，退出');
      process.exit(0);
    }
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });

async function runLottery() {
  try {
    // 获取今天的日期（北京时间）
    const today = getBeijingTime();
    const dateStr = today.toISOString().split('T')[0];
    
    // 检查今天是否已经开奖
    const existingHistory = await LotteryHistory.findOne({ date: dateStr });
    if (existingHistory) {
      console.log('今天已经开奖');
      process.exit(0);
    }
    
    // 获取抽奖池余额
    let lotteryPoolConfig = await SystemConfig.findOne({ key: 'lotteryPool' });
    if (!lotteryPoolConfig) {
      lotteryPoolConfig = new SystemConfig({ key: 'lotteryPool', value: 88888 });
      await lotteryPoolConfig.save();
    }
    
    const poolAmount = lotteryPoolConfig.value;
    
    // 获取所有未开奖的奖券
    const tickets = await LotteryTicket.find({ status: 0 });
    
    if (tickets.length === 0) {
      console.log('没有未开奖的奖券');
      process.exit(0);
    }
    
    // 随机抽取中奖奖券
    const winnerIndex = Math.floor(Math.random() * tickets.length);
    const winningTicket = tickets[winnerIndex];
    
    // 分配奖金
    const winnerAmount = poolAmount;
    
    // 更新奖券状态
    winningTicket.status = 1; // 已中奖
    await winningTicket.save();
    
    // 更新其他奖券状态
    for (let i = 0; i < tickets.length; i++) {
      if (i !== winnerIndex) {
        tickets[i].status = 2; // 未中奖
        await tickets[i].save();
      }
    }
    
    // 记录开奖历史
    const lotteryHistory = new LotteryHistory({
      date: dateStr,
      poolAmount,
      winners: [
        {
          employeeId: winningTicket.employeeId,
          ticketNumber: winningTicket.ticketNumber,
          amount: winnerAmount
        }
      ]
    });
    await lotteryHistory.save();
    
    // 重置抽奖池余额
    lotteryPoolConfig.value = 0; // 重置为0，等待后续金币发放时再积累
    await lotteryPoolConfig.save();
    
    console.log('开奖成功');
    console.log(`中奖员工: ${winningTicket.employeeId}`);
    console.log(`中奖奖券: ${winningTicket.ticketNumber}`);
    console.log(`中奖金额: ${winnerAmount}`);
    
    process.exit(0);
  } catch (error) {
    console.error('开奖失败:', error);
    process.exit(1);
  }
}