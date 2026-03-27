const mongoose = require('mongoose');
const LotteryTicket = require('../models/LotteryTicket');
const LotteryHistory = require('../models/LotteryHistory');
const LotteryPool = require('../models/LotteryPool');
const LotterySettings = require('../models/LotterySettings');

// 获取北京时间
function getBeijingTime() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

// 检查是否到达北京时间22:00
function isTimeToRun() {
  const beijingTime = getBeijingTime();
  return beijingTime.getHours() === 22 && beijingTime.getMinutes() === 0;
}

// 连接MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function connectToMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');
    return true;
  } catch (err) {
    console.error('MongoDB连接失败:', err);
    return false;
  }
}

async function runLottery() {
  try {
    console.log('开始执行开奖...');
    
    // 获取当前时间（北京时间）
    const now = getBeijingTime();
    
    // 获取奖金池
    let pool = await LotteryPool.findOne();
    if (!pool) {
      pool = new LotteryPool();
      await pool.save();
    }
    
    const poolAmount = pool.currentAmount;
    
    if (poolAmount <= 0) {
      console.log('奖金池金额为0，无法开奖');
      return;
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
    
    // 获取所有有效奖券
    const validTickets = await LotteryTicket.find({ status: '有效' });
    
    if (validTickets.length === 0) {
      console.log('没有有效奖券，无法开奖');
      return;
    }
    
    // 随机抽取中奖用户
    const winners = {
      firstPrize: [],
      secondPrize: [],
      thirdPrize: []
    };
    
    // 随机抽取一等奖
    if (settings.firstPrizeCount > 0) {
      for (let i = 0; i < settings.firstPrizeCount; i++) {
        if (validTickets.length > 0) {
          const randomIndex = Math.floor(Math.random() * validTickets.length);
          const winningTicket = validTickets.splice(randomIndex, 1)[0];
          
          winners.firstPrize.push({
            userId: winningTicket.userId,
            employeeId: winningTicket.employeeId,
            amount: firstPrize,
            ticketNumber: winningTicket.ticketNumber
          });
        }
      }
    }
    
    // 随机抽取二等奖
    if (settings.secondPrizeCount > 0) {
      for (let i = 0; i < settings.secondPrizeCount; i++) {
        if (validTickets.length > 0) {
          const randomIndex = Math.floor(Math.random() * validTickets.length);
          const winningTicket = validTickets.splice(randomIndex, 1)[0];
          
          winners.secondPrize.push({
            userId: winningTicket.userId,
            employeeId: winningTicket.employeeId,
            amount: secondPrize / settings.secondPrizeCount,
            ticketNumber: winningTicket.ticketNumber
          });
        }
      }
    }
    
    // 随机抽取三等奖
    if (settings.thirdPrizeCount > 0) {
      for (let i = 0; i < settings.thirdPrizeCount; i++) {
        if (validTickets.length > 0) {
          const randomIndex = Math.floor(Math.random() * validTickets.length);
          const winningTicket = validTickets.splice(randomIndex, 1)[0];
          
          winners.thirdPrize.push({
            userId: winningTicket.userId,
            employeeId: winningTicket.employeeId,
            amount: thirdPrize / settings.thirdPrizeCount,
            ticketNumber: winningTicket.ticketNumber
          });
        }
      }
    }
    
    // 更新奖券状态为作废
    await LotteryTicket.updateMany(
      { status: '有效' },
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
      issueNumber: `${now.toISOString().split('T')[0]}-${now.getTime()}`,
      drawTime: now,
      poolAmount,
      firstPrize,
      secondPrize,
      thirdPrize,
      winners,
      drawType: '随机'
    });
    await history.save();
    
    // 重置奖金池
    pool.currentAmount = 0;
    pool.lastDrawTime = now;
    await pool.save();
    
    console.log('开奖成功');
    console.log(`奖金池金额: ${poolAmount}`);
    console.log(`一等奖: ${firstPrize} (${winners.firstPrize.length}人)`);
    console.log(`二等奖: ${secondPrize} (${winners.secondPrize.length}人)`);
    console.log(`三等奖: ${thirdPrize} (${winners.thirdPrize.length}人)`);
    console.log(`中奖人数: ${winners.firstPrize.length + winners.secondPrize.length + winners.thirdPrize.length}`);
  } catch (error) {
    console.error('开奖失败:', error);
  }
}

// 监控时间并执行开奖
async function startMonitor() {
  console.log('启动开奖监控...');
  
  // 连接MongoDB
  const connected = await connectToMongoDB();
  if (!connected) {
    console.error('无法连接到MongoDB，监控启动失败');
    return;
  }
  
  // 每分钟检查一次时间
  setInterval(async () => {
    const beijingTime = getBeijingTime();
    console.log(`当前北京时间: ${beijingTime.toISOString()}`);
    
    if (isTimeToRun()) {
      console.log('到达开奖时间，开始执行开奖...');
      await runLottery();
    }
  }, 60000); // 60秒检查一次
  
  console.log('开奖监控已启动，将在北京时间每天22:00自动执行开奖');
}

// 启动监控
startMonitor();