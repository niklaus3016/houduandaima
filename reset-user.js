const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');
const DailyBonusClaim = require('./models/DailyBonusClaim');
const GoldLog = require('./models/GoldLog');

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
    
    // 3. 设置本月累计金币为20000
    await UserGold.updateOne(
      { userId },
      { $set: { currentMonthGold: 20000 } }
    );
    console.log('✅ 已设置本月金币为20000');
    
    // 4. 删除今日所有金币记录
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    await GoldLog.deleteMany({
      userId: userId,
      createTime: { $gte: todayStart, $lte: todayEnd }
    });
    console.log('✅ 已删除今日金币记录');
    
    // 5. 添加今日金币记录（10000金币）
    await GoldLog.create({
      userId: userId,
      employeeId: employeeId,
      gold: 5000,
      ecpm: 1000,
      createTime: new Date()
    });
    
    await GoldLog.create({
      userId: userId,
      employeeId: employeeId,
      gold: 5000,
      ecpm: 1000,
      createTime: new Date()
    });
    console.log('✅ 已添加今日金币记录（10000金币）');
    
    // 6. 查询更新后的状态
    const user = await UserGold.findOne({ userId });
    const todayGoldLogs = await GoldLog.find({
      userId: userId,
      createTime: { $gte: todayStart, $lte: todayEnd }
    });
    const todayGold = todayGoldLogs.reduce((sum, log) => sum + log.gold, 0);
    
    console.log('\n📊 更新后的状态：');
    console.log('  本月金币:', user.currentMonthGold);
    console.log('  今日金币:', todayGold);
    console.log('  最后领取日期:', user.lastClaimedBonusDate || '无');
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });
