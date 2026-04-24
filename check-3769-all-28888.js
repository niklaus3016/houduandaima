const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const empId = '3769';

    // 所有28888金币记录
    const logs = await GoldLog.find({
      employeeId: empId,
      gold: 28888,
      type: 'weekly_bonus'
    }).sort({ createTime: -1 });

    console.log(`\n=== 员工 ${empId} 所有28888金币记录 ===`);
    console.log(`记录数: ${logs.length}`);
    logs.forEach((log, i) => {
      console.log(`${i+1}. createTime=${log.createTime.toISOString()}, gold=${log.gold}`);
    });

    // 检查UserGold
    const UserGold = require('./models/UserGold');
    const ug = await UserGold.findOne({ employeeId: empId });
    console.log(`\ncurrentMonthGold: ${ug.currentMonthGold.toFixed(2)}`);

    // 统计4月18日16点后的金币总额
    const apr18Start = new Date('2026-04-18T16:00:00.000Z');
    const result = await GoldLog.aggregate([
      { $match: { employeeId: empId, createTime: { $gte: apr18Start } } },
      { $group: { _id: null, total: { $sum: '$gold' } } }
    ]);
    console.log(`4月18日16点后金币总额: ${result[0]?.total?.toFixed(2) || 0}`);

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });