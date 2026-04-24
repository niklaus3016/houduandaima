const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];

    // 4月18日0点到4月19日0点（北京时间）
    const apr18StartUTC = new Date('2026-04-18T00:00:00.000Z');
    const apr19StartUTC = new Date('2026-04-19T00:00:00.000Z');

    console.log('\n=== 5个用户4月18日金币收益 ===');
    console.log('查询时间范围: 2026-04-18T00:00:00.000Z 至 2026-04-19T00:00:00.000Z');

    for (const empId of dupUsers) {
      const result = await GoldLog.aggregate([
        {
          $match: {
            employeeId: empId,
            createTime: { $gte: apr18StartUTC, $lt: apr19StartUTC }
          }
        },
        {
          $group: {
            _id: null,
            totalGold: { $sum: '$gold' },
            count: { $sum: 1 }
          }
        }
      ]);

      const totalGold = result[0]?.totalGold || 0;
      const count = result[0]?.count || 0;

      console.log(`\n员工 ${empId}:`);
      console.log(`  金币总额: ${totalGold.toFixed(2)}`);
      console.log(`  记录数: ${count}`);
    }

    // 也查一下当前时间
    console.log('\n\n=== 服务器当前时间 ===');
    console.log(new Date().toISOString());

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });