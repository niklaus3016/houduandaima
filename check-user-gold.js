const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 查询2222和7777本月累计金币 ===');
  
  // 计算本月时间范围（北京时间）
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  
  const firstDayOfMonthBeijing = new Date(beijingNow);
  firstDayOfMonthBeijing.setUTCDate(1);
  firstDayOfMonthBeijing.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(firstDayOfMonthBeijing.getTime() - 8 * 60 * 60 * 1000);
  
  const endDate = now;
  
  console.log('时间范围:', startDate, '至', endDate);
  
  // 查询2222的金币
  const user2222 = await GoldLog.aggregate([
    { $match: { employeeId: '2222', createTime: { $gte: startDate, $lt: endDate } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
  ]);
  
  // 查询7777的金币
  const user7777 = await GoldLog.aggregate([
    { $match: { employeeId: '7777', createTime: { $gte: startDate, $lt: endDate } } },
    { $group: { _id: null, totalGold: { $sum: '$gold' }, count: { $sum: 1 } } }
  ]);
  
  console.log('\n2222:');
  console.log('  金币数量:', user2222[0] ? user2222[0].totalGold : 0);
  console.log('  广告次数:', user2222[0] ? user2222[0].count : 0);
  
  console.log('\n7777:');
  console.log('  金币数量:', user7777[0] ? user7777[0].totalGold : 0);
  console.log('  广告次数:', user7777[0] ? user7777[0].count : 0);
  
  mongoose.disconnect();
});