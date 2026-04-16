const mongoose = require('mongoose');
const WelfarePrize = require('./models/WelfarePrize');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function updatePrizes() {
  try {
    // 连接数据库
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');
    
    // 新的奖品数据
    const newPrizes = [
      { id: '1', name: '1克黄金', value: 500, type: 'gold', probability: 2 },
      { id: '2', name: '1.68元', value: 1.68, type: 'cash', probability: 25 },
      { id: '3', name: '88.8元', value: 88.8, type: 'cash', probability: 5 },
      { id: '4', name: '6.88元', value: 6.88, type: 'cash', probability: 20 },
      { id: '5', name: '千元手机', value: 1000, type: 'phone', probability: 1 },
      { id: '6', name: '16.8元', value: 16.8, type: 'cash', probability: 15 },
      { id: '7', name: '66.8元', value: 66.8, type: 'cash', probability: 10 },
      { id: '8', name: '再接再厉', value: 0, type: 'encourage', probability: 22 }
    ];
    
    // 删除所有现有奖品
    await WelfarePrize.deleteMany({});
    console.log('已删除所有现有奖品');
    
    // 插入新的奖品数据
    await WelfarePrize.insertMany(newPrizes);
    console.log('奖品数据更新成功');
    
    // 验证更新结果
    const prizes = await WelfarePrize.find().sort({ id: 1 });
    console.log('\n更新后的奖品列表:');
    prizes.forEach(prize => {
      console.log(`${prize.id}. ${prize.name}: ${prize.value}元 (${prize.probability}%)`);
    });
    
    // 计算总概率
    const totalProbability = prizes.reduce((sum, prize) => sum + prize.probability, 0);
    console.log(`\n总概率: ${totalProbability}%`);
    
    process.exit(0);
  } catch (error) {
    console.error('更新奖品数据错误:', error);
    process.exit(1);
  }
}

updatePrizes();
