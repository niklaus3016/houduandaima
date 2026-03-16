const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 设置6666本月累计金币 ===');
  
  // 计算本月时间范围（北京时间）
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  const firstDayOfMonthBeijing = new Date(beijingNow);
  firstDayOfMonthBeijing.setUTCDate(1);
  firstDayOfMonthBeijing.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(firstDayOfMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  const endDate = now;
  
  console.log('时间范围:', startDate, '至', endDate);
  
  // 目标金币数
  const targetGold = 716;
  
  // 1. 删除6666的所有本月记录
  console.log('删除6666的本月记录...');
  const deleted = await GoldLog.deleteMany({ 
    employeeId: '6666', 
    createTime: { $gte: startDate, $lt: endDate } 
  });
  
  console.log('已删除', deleted.deletedCount, '条记录');
  
  // 2. 创建新记录
  console.log('创建新记录...');
  
  // 创建一条记录，金币数为716
  const newLog = new GoldLog({
    userId: '6666', // 假设userId也是6666
    employeeId: '6666',
    ecpm: 1432, // 随机ECPM值
    gold: targetGold,
    slotId: '19188426', // 广告位ID
    createTime: new Date() // 当前时间
  });
  
  await newLog.save();
  console.log('已创建新记录');
  
  // 3. 验证结果
  console.log('\n=== 验证结果 ===');
  
  const finalResult = await GoldLog.aggregate([
    { $match: { employeeId: '6666', createTime: { $gte: startDate, $lt: endDate } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  console.log('6666本月累计金币:', finalResult[0] ? finalResult[0].totalGold : 0);
  
  mongoose.disconnect();
});