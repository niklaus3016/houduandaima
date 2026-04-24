const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');
const UserGold = require('./models/UserGold');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const deductAmount = 28888;

    console.log('\n=== 删除3769的重复WeeklyBonusClaim ===');
    // 3769: 删除4月18日17:37那条（保留4月15日那条）
    const claim3769 = await WeeklyBonusClaim.findOne({
      employeeId: '3769',
      week: '2026-15',
      claimedAt: { $gte: new Date('2026-04-18T17:00:00.000Z') }
    });
    if (claim3769) {
      console.log(`删除3769: _id=${claim3769._id}, claimedAt=${claim3769.claimedAt.toISOString()}`);
      await WeeklyBonusClaim.deleteOne({ _id: claim3769._id });
    }

    console.log('\n=== 删除3236的重复WeeklyBonusClaim ===');
    // 3236: 删除4月18日17:36那条（保留4月18日16:43那条）
    const claim3236 = await WeeklyBonusClaim.findOne({
      employeeId: '3236',
      week: '2026-15',
      claimedAt: { $gte: new Date('2026-04-18T17:00:00.000Z') }
    });
    if (claim3236) {
      console.log(`删除3236: _id=${claim3236._id}, claimedAt=${claim3236.claimedAt.toISOString()}`);
      await WeeklyBonusClaim.deleteOne({ _id: claim3236._id });
    }

    console.log('\n=== 删除8886的重复WeeklyBonusClaim ===');
    // 8886: 删除4月18日17:37那条（保留4月18日16:49那条）
    const claim8886 = await WeeklyBonusClaim.findOne({
      employeeId: '8886',
      week: '2026-15',
      claimedAt: { $gte: new Date('2026-04-18T17:00:00.000Z') }
    });
    if (claim8886) {
      console.log(`删除8886: _id=${claim8886._id}, claimedAt=${claim8886.claimedAt.toISOString()}`);
      await WeeklyBonusClaim.deleteOne({ _id: claim8886._id });
    }

    console.log('\n=== 扣除8886和3236的金币 ===');

    // 扣除3236金币
    const ug3236 = await UserGold.findOne({ employeeId: '3236' });
    if (ug3236) {
      console.log(`3236扣除前: ${ug3236.currentMonthGold.toFixed(2)}`);
      ug3236.currentMonthGold -= deductAmount;
      await ug3236.save();
      console.log(`3236扣除后: ${ug3236.currentMonthGold.toFixed(2)}`);
    }

    // 扣除8886金币
    const ug8886 = await UserGold.findOne({ employeeId: '8886' });
    if (ug8886) {
      console.log(`8886扣除前: ${ug8886.currentMonthGold.toFixed(2)}`);
      ug8886.currentMonthGold -= deductAmount;
      await ug8886.save();
      console.log(`8886扣除后: ${ug8886.currentMonthGold.toFixed(2)}`);
    }

    console.log('\n=== 删除3236和8886的GoldLog多余28888记录 ===');

    // 删除3236今日多余的28888记录
    const goldLog3236 = await GoldLog.findOne({
      employeeId: '3236',
      gold: 28888,
      type: 'weekly_bonus',
      createTime: { $gte: new Date('2026-04-18T17:00:00.000Z') }
    });
    if (goldLog3236) {
      console.log(`删除3236 GoldLog: _id=${goldLog3236._id}, createTime=${goldLog3236.createTime.toISOString()}`);
      await GoldLog.deleteOne({ _id: goldLog3236._id });
    }

    // 删除8886今日多余的28888记录
    const goldLog8886 = await GoldLog.findOne({
      employeeId: '8886',
      gold: 28888,
      type: 'weekly_bonus',
      createTime: { $gte: new Date('2026-04-18T17:00:00.000Z') }
    });
    if (goldLog8886) {
      console.log(`删除8886 GoldLog: _id=${goldLog8886._id}, createTime=${goldLog8886.createTime.toISOString()}`);
      await GoldLog.deleteOne({ _id: goldLog8886._id });
    }

    console.log('\n\n=== 验证结果 ===');

    // 验证3769
    const claims3769 = await WeeklyBonusClaim.find({ employeeId: '3769', week: '2026-15' });
    console.log(`3769: 第15周领取记录数=${claims3769.length}`);

    // 验证3236
    const claims3236 = await WeeklyBonusClaim.find({ employeeId: '3236', week: '2026-15' });
    const goldLog3236Count = await GoldLog.countDocuments({ employeeId: '3236', gold: 28888, type: 'weekly_bonus' });
    const ug3236Final = await UserGold.findOne({ employeeId: '3236' });
    console.log(`3236: 第15周领取记录数=${claims3236.length}, 28888记录数=${goldLog3236Count}, currentMonthGold=${ug3236Final.currentMonthGold.toFixed(2)}`);

    // 验证8886
    const claims8886 = await WeeklyBonusClaim.find({ employeeId: '8886', week: '2026-15' });
    const goldLog8886Count = await GoldLog.countDocuments({ employeeId: '8886', gold: 28888, type: 'weekly_bonus' });
    const ug8886Final = await UserGold.findOne({ employeeId: '8886' });
    console.log(`8886: 第15周领取记录数=${claims8886.length}, 28888记录数=${goldLog8886Count}, currentMonthGold=${ug8886Final.currentMonthGold.toFixed(2)}`);

    mongoose.disconnect();
    console.log('\n操作完成');
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });