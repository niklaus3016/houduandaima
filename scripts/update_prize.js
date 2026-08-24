const mongoose = require('mongoose');

async function updatePrize() {
  try {
    await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017');
    console.log('Connected to MongoDB');
    
    const WelfarePrize = mongoose.model('WelfarePrize', {
      id: String,
      name: String,
      value: Number,
      type: String,
      probability: Number
    });
    
    // 批量更新概率，确保总和为100%
    const updates = [
      { id: '1', probability: 2 },
      { id: '2', probability: 25 },
      { id: '3', probability: 5 },
      { id: '4', probability: 20 },
      { id: '5', probability: 1 },
      { id: '6', probability: 15 },
      { id: '7', probability: 10 },
      { id: '8', probability: 22 }
    ];
    
    for (const update of updates) {
      const result = await WelfarePrize.findOneAndUpdate(
        { id: update.id },
        { probability: update.probability },
        { new: true }
      );
      console.log(`更新奖品${update.id}: ${result.name} -> ${update.probability}%`);
    }
    
    // 验证总概率
    const prizes = await WelfarePrize.find();
    const total = prizes.reduce((sum, p) => sum + p.probability, 0);
    console.log(`\n总概率: ${total}%`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('修改失败:', error);
    process.exit(1);
  }
}

updatePrize();