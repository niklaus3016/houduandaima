const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const UserGold = require('./models/UserGold');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const empId = '3236';

    console.log('\n=== 检查3236的WeeklyBonusClaim记录 ===');
    const claims = await WeeklyBonusClaim.find({ employeeId: empId }).sort({ week: 1 });
    console.log(`领取记录数: ${claims.length}`);
    claims.forEach(c => {
      console.log(`第${c.week}周: bonusGold=${c.bonusGold}, userId=${c.userId}, employeeId=${c.employeeId}`);
    });

    if (claims.length > 0) {
      const claim = claims[0];
      console.log('\n=== 检查对应的UserGold ===');
      const userGold = await UserGold.findOne({ employeeId: empId });
      if (userGold) {
        console.log(`userId: ${userGold.userId}`);
        console.log(`currentMonthGold: ${userGold.currentMonthGold.toFixed(2)}`);

        console.log('\n=== 检查GoldLog中是否有userId对应的记录 ===');
        const logs = await GoldLog.find({
          userId: userGold.userId,
          gold: 28888
        }).sort({ createTime: -1 });
        console.log(`找到${logs.length}条28888金币记录`);
        logs.forEach(log => {
          console.log(`createTime: ${log.createTime.toISOString()}, gold: ${log.gold}, type: ${log.type}, employeeId: ${log.employeeId}`);
        });
      }
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });