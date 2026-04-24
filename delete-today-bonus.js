const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];

    // 今日开始时间（北京时间4月19日00:00:00）
    const todayStartUTC = new Date('2026-04-18T16:00:00.000Z');

    console.log('\n=== 删除今日28888记录 ===');

    for (const empId of dupUsers) {
      console.log(`\n--- 员工 ${empId} ---`);

      // 查找今日的28888记录
      const bonusToday = await GoldLog.findOne({
        employeeId: empId,
        gold: 28888,
        type: 'weekly_bonus',
        createTime: { $gte: todayStartUTC }
      });

      if (bonusToday) {
        console.log(`找到今日记录: _id=${bonusToday._id}, createTime=${bonusToday.createTime.toISOString()}`);
        await GoldLog.deleteOne({ _id: bonusToday._id });
        console.log('已删除');
      } else {
        console.log('未找到今日28888记录');
      }

      // 验证WeeklyBonusClaim记录是否还在
      const claim = await WeeklyBonusClaim.findOne({
        employeeId: empId,
        week: '2026-16'
      });
      console.log(`WeeklyBonusClaim第16周记录: ${claim ? '存在' : '不存在'}`);
    }

    console.log('\n\n=== 验证删除结果 ===');

    for (const empId of dupUsers) {
      const bonusCount = await GoldLog.countDocuments({
        employeeId: empId,
        gold: 28888,
        type: 'weekly_bonus'
      });
      console.log(`员工 ${empId}: 剩余28888记录数=${bonusCount}`);
    }

    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });