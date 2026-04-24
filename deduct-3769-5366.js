const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');
const UserGold = require('./models/UserGold');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const dupUsers = ['3769', '5366'];
    const deductAmount = 28888;
    const targetDate = new Date('2026-04-18T17:33:00.000Z'); // 4月18日附近

    console.log('\n=== 对3769和5366执行扣除操作 ===');

    for (const empId of dupUsers) {
      console.log(`\n--- 处理员工 ${empId} ---`);

      // 1. 找到4月18日的WeeklyBonusClaim记录并删除
      const claim = await WeeklyBonusClaim.findOne({
        employeeId: empId,
        week: '2026-16',
        claimedAt: { $gte: new Date('2026-04-18T00:00:00.000Z') }
      });

      if (claim) {
        console.log(`找到WeeklyBonusClaim记录: _id=${claim._id}, claimedAt=${claim.claimedAt.toISOString()}`);
        await WeeklyBonusClaim.deleteOne({ _id: claim._id });
        console.log('已删除WeeklyBonusClaim记录');
      } else {
        console.log('未找到4月18日的WeeklyBonusClaim记录');
      }

      // 2. 从UserGold扣除28888金币
      const userGold = await UserGold.findOne({ employeeId: empId });
      if (userGold) {
        console.log(`扣除前 currentMonthGold: ${userGold.currentMonthGold.toFixed(2)}`);
        userGold.currentMonthGold -= deductAmount;
        await userGold.save();
        console.log(`扣除后 currentMonthGold: ${userGold.currentMonthGold.toFixed(2)}`);
      } else {
        console.log('未找到UserGold记录');
      }

      // 3. 删除GoldLog中4月18日的28888金币记录
      const goldLog = await GoldLog.findOne({
        employeeId: empId,
        gold: 28888,
        type: 'weekly_bonus',
        createTime: { $gte: new Date('2026-04-18T16:00:00.000Z') } // 北京时间4月18日0点
      });

      if (goldLog) {
        console.log(`找到GoldLog记录: _id=${goldLog._id}, createTime=${goldLog.createTime.toISOString()}`);
        await GoldLog.deleteOne({ _id: goldLog._id });
        console.log('已删除GoldLog记录');
      } else {
        console.log('未找到4月18日的GoldLog记录');
      }
    }

    console.log('\n\n=== 验证结果 ===');

    for (const empId of dupUsers) {
      // WeeklyBonusClaim剩余记录
      const claims = await WeeklyBonusClaim.find({ employeeId: empId, week: '2026-16' });
      console.log(`员工 ${empId}: 第16周领取记录数=${claims.length}`);

      // UserGold
      const ug = await UserGold.findOne({ employeeId: empId });
      console.log(`员工 ${empId}: currentMonthGold=${ug.currentMonthGold.toFixed(2)}`);

      // GoldLog 28888记录
      const goldCount = await GoldLog.countDocuments({
        employeeId: empId,
        gold: 28888,
        type: 'weekly_bonus'
      });
      console.log(`员工 ${empId}: 28888金币记录数=${goldCount}`);
    }

    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });