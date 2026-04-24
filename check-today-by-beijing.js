const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 当前服务器时间
    const now = new Date();
    console.log('当前服务器时间:', now.toISOString());

    // 北京时间
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    console.log('当前北京时间:', beijingNow.toISOString());

    // 今日北京时间0点
    const beijingTodayStart = new Date(beijingNow);
    beijingTodayStart.setHours(0, 0, 0, 0);
    const todayStartUTC = new Date(beijingTodayStart.getTime() - 8 * 60 * 60 * 1000);

    console.log('\n今日开始时间（UTC）:', todayStartUTC.toISOString());
    console.log('今日开始时间（北京时间）:', beijingTodayStart.toISOString());

    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];

    console.log('\n=== 5个用户今日金币收益（基于北京时间）===');

    for (const empId of dupUsers) {
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