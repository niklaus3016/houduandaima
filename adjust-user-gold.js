const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 微调2222的金币数 ===');
  
  // 计算本月时间范围（北京时间）
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  const firstDayOfMonthBeijing = new Date(beijingNow);
  firstDayOfMonthBeijing.setUTCDate(1);
  firstDayOfMonthBeijing.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(firstDayOfMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  const endDate = now;
  
  // 目标金币数
  const target2222 = 4539;
  
  // 检查当前金币
  const current2222 = await GoldLog.aggregate([
    { $match: { employeeId: '2222', createTime: { $gte: startDate, $lt: endDate } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  const currentGold = current2222[0] ? current2222[0].totalGold : 0;
  console.log('当前金币:', currentGold);
  console.log('目标金币:', target2222);
  
  if (currentGold !== target2222) {
    // 获取所有记录
    const logs = await GoldLog.find({ 
      employeeId: '2222', 
      createTime: { $gte: startDate, $lt: endDate } 
    }).sort({ createTime: -1 });
    
    console.log('剩余记录数:', logs.length);
    
    if (logs.length > 0) {
      // 计算需要调整的金币数
      const adjustment = target2222 - currentGold;
      console.log('需要调整:', adjustment);
      
      // 调整最新的记录
      const lastLog = logs[0];
      console.log('调整前:', lastLog.gold);
      lastLog.gold = lastLog.gold + adjustment;
      console.log('调整后:', lastLog.gold);
      
      await lastLog.save();
      console.log('已调整记录');
    }
  }
  
  // 验证结果
  const final2222 = await GoldLog.aggregate([
    { $match: { employeeId: '2222', createTime: { $gte: startDate, $lt: endDate } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  console.log('\n最终结果:');
  console.log('2222最终金币:', final2222[0] ? final2222[0].totalGold : 0);
  
  mongoose.disconnect();
});