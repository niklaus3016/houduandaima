const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];

    // 今日开始时间（北京时间4月19日00:00:00）
    const todayStartUTC = new Date('2026-04-19T00:00:00.000Z');

    console.log('\n=== 5个用户今日金币收益（4月19日）===');
    console.log('查询时间范围: 2026-04-19T00:00:00.000Z 至今');

    for (const empId of dupUsers) {
      // 查询今日金币总和
      const result = await GoldLog.aggregate([
        {
          $match: {
            employeeId: empId,
            createTime: { $gte: todayStartUTC }
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
      console.log(`  今日金币总额: ${totalGold.toFixed(2)}`);
      console.log(`  今日记录数: ${count}`);
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });