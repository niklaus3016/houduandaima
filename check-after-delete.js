const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];

    // 北京时间今日0点
    const now = new Date();
    const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const beijingTodayStart = new Date(beijingNow);
    beijingTodayStart.setHours(0, 0, 0, 0);
    const todayStartUTC = new Date(beijingTodayStart.getTime() - 8 * 60 * 60 * 1000);

    console.log('当前北京时间:', beijingNow.toISOString());
    console.log('今日开始时间:', todayStartUTC.toISOString());

    console.log('\n=== 删除后今日金币收益 ===');

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

      console.log(`员工 ${empId}: 今日金币=${totalGold.toFixed(2)}, 记录数=${count}`);

      // 也查一下是否还有28888的记录
      const bonusToday = await GoldLog.findOne({
        employeeId: empId,
        gold: 28888,
        type: 'weekly_bonus',
        createTime: { $gte: todayStartUTC }
      });

      if (bonusToday) {
        console.log(`  -> 今日有28888记录: createTime=${bonusToday.createTime.toISOString()}`);
      } else {
        console.log(`  -> 今日无28888记录`);
      }
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });