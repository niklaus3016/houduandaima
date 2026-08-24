const mongoose = require('mongoose');

async function testLottery() {
  try {
    await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017');
    console.log('Connected to MongoDB');
    
    // 定义模型
    const WelfareWallet = mongoose.model('WelfareWallet', {
      userId: String,
      employeeId: String,
      balance: Number,
      chances: Number,
      todayAdCount: Number,
      lastAwardedThresholdIndex: Number,
      countDate: String
    });
    
    const WelfarePrize = mongoose.model('WelfarePrize', {
      id: String,
      name: String,
      value: Number,
      type: String,
      probability: Number
    });
    
    // 获取今天日期（北京时间）
    const now = new Date();
    const offset = 8 * 60 * 60 * 1000;
    const beijingTime = new Date(now.getTime() + offset);
    const todayStr = beijingTime.toISOString().split('T')[0];
    
    // 创建或更新钱包
    let wallet = await WelfareWallet.findOne({ employeeId: '8202' });
    if (!wallet) {
      wallet = new WelfareWallet({
        userId: 'test_8202',
        employeeId: '8202',
        balance: 0,
        chances: 3,
        todayAdCount: 0,
        lastAwardedThresholdIndex: -1,
        countDate: todayStr
      });
    } else {
      wallet.chances = 3;
    }
    await wallet.save();
    console.log('钱包创建/更新成功:', wallet);
    
    // 测试3次抽奖
    const prizes = await WelfarePrize.find();
    const totalProbability = prizes.reduce((sum, p) => sum + p.probability, 0);
    
    console.log('\n=== 开始抽奖测试 ===');
    for (let i = 1; i <= 3; i++) {
      const random = Math.random() * totalProbability;
      let currentProbability = 0;
      let winningPrize = null;
      
      for (const prize of prizes) {
        currentProbability += prize.probability;
        if (random <= currentProbability) {
          winningPrize = prize;
          break;
        }
      }
      
      wallet.chances -= 1;
      if (winningPrize.type === 'cash' && winningPrize.value > 0) {
        wallet.balance += winningPrize.value;
      }
      await wallet.save();
      
      console.log(`第${i}次抽奖: ${winningPrize.name} (价值: ${winningPrize.value}元) - 剩余机会: ${wallet.chances}, 余额: ${wallet.balance.toFixed(2)}元`);
    }
    
    await mongoose.disconnect();
    console.log('\n测试完成！');
  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  }
}

testLottery();