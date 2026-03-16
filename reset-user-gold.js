const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 修改2222和7777本月累计金币 ===');
  
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
  const target2222 = 4539;
  const target7777 = 0;
  
  // 1. 处理2222
  console.log('\n处理2222:');
  const logs2222 = await GoldLog.find({ 
    employeeId: '2222', 
    createTime: { $gte: startDate, $lt: endDate } 
  }).sort({ createTime: -1 });
  
  console.log('当前记录数:', logs2222.length);
  
  let currentGold2222 = 0;
  for (const log of logs2222) {
    currentGold2222 += log.gold;
  }
  console.log('当前金币:', currentGold2222);
  console.log('目标金币:', target2222);
  
  if (currentGold2222 > target2222) {
    console.log('需要删除多余的金币...');
    let deletedGold = 0;
    let deletedCount = 0;
    
    for (const log of logs2222) {
      if (currentGold2222 - deletedGold <= target2222) {
        break;
      }
      
      deletedGold += log.gold;
      deletedCount++;
      await log.deleteOne();
    }
    
    console.log('已删除', deletedCount, '条记录，删除金币', deletedGold);
  }
  
  // 2. 处理7777
  console.log('\n处理7777:');
  const logs7777 = await GoldLog.find({ 
    employeeId: '7777', 
    createTime: { $gte: startDate, $lt: endDate } 
  });
  
  console.log('当前记录数:', logs7777.length);
  
  if (logs7777.length > 0) {
    console.log('删除所有记录...');
    for (const log of logs7777) {
      await log.deleteOne();
    }
    console.log('已删除', logs7777.length, '条记录');
  }
  
  // 3. 验证结果
  console.log('\n=== 验证结果 ===');
  
  const final2222 = await GoldLog.aggregate([
    { $match: { employeeId: '2222', createTime: { $gte: startDate, $lt: endDate } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  const final7777 = await GoldLog.aggregate([
    { $match: { employeeId: '7777', createTime: { $gte: startDate, $lt: endDate } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' } } }
  ]);
  
  console.log('2222最终金币:', final2222[0] ? final2222[0].totalGold : 0);
  console.log('7777最终金币:', final7777[0] ? final7777[0].totalGold : 0);
  
  mongoose.disconnect();
});