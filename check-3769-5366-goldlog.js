const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const users = ['3769', '5366'];

    for (const empId of users) {
      console.log(`\n=== 员工 ${empId} 的28888金币记录 ===`);
      const logs = await GoldLog.find({
        employeeId: empId,
        gold: 28888,
        type: 'weekly_bonus'
      }).sort({ createTime: -1 });

      logs.forEach((log, i) => {
        console.log(`${i+1}. createTime=${log.createTime.toISOString()}, gold=${log.gold}, type=${log.type}`);
      });
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });