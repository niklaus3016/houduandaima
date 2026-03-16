const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');
const DailyBonusClaim = require('./models/DailyBonusClaim');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const today = '2026-03-02';
    const userId = 'test123';
    const employeeId = '8202';
    
    // 1. 重置用户的领取状态
    await UserGold.updateOne(
      { userId },
      { $set: { lastClaimedBonusDate: '' } }
    );
    console.log('✅ 已重置用户领取状态');
    
    // 2. 删除领取记录
    await DailyBonusClaim.deleteOne({ userId, date: today });
    console.log('✅ 已删除领取记录');
    
    // 3. 扣除之前发放的额外金币（5000）
    await UserGold.updateOne(
      { userId },
      { $inc: { currentMonthGold: -5000 } }
    );
    console.log('✅ 已扣除额外金币');
    
    // 4. 查询更新后的状态
    const user = await UserGold.findOne({ userId });
    console.log('\n📊 更新后的状态：');
    console.log('  本月金币:', user.currentMonthGold);
    console.log('  最后领取日期:', user.lastClaimedBonusDate || '无');
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });
