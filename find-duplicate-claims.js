const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');
const UserGold = require('./models/UserGold');
const Employee = require('./models/Employee');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查询所有第16周的领取记录
    const claim16Records = await WeeklyBonusClaim.find({ week: '2026-16' })
      .sort({ employeeId: 1 });

    console.log('\n=== 所有第16周领取记录 ===');
    console.log('总记录数:', claim16Records.length);

    if (claim16Records.length === 0) {
      console.log('没有第16周的领取记录');
      mongoose.disconnect();
      return;
    }

    const affectedUsers = [];

    for (const claim of claim16Records) {
      console.log(`\n员工ID: ${claim.employeeId}`);
      console.log(`  userId: ${claim.userId}`);
      console.log(`  week: ${claim.week}`);
      console.log(`  bonusGold: ${claim.bonusGold}`);
      console.log(`  claimedAt: ${claim.claimedAt}`);

      // 查询UserGold记录
      const userGold = await UserGold.findOne({ userId: claim.userId });
      if (userGold) {
        console.log(`  当前currentMonthGold: ${userGold.currentMonthGold}`);
        console.log(`  当前lastMonthGold: ${userGold.lastMonthGold}`);

        affectedUsers.push({
          employeeId: claim.employeeId,
          userId: claim.userId,
          bonusGold: claim.bonusGold,
          currentMonthGold: userGold.currentMonthGold,
          claimedAt: claim.claimedAt
        });
      } else {
        console.log(`  未找到UserGold记录`);
      }
    }

    console.log('\n\n=== 需要扣除金币的用户列表 ===');
    console.log('员工ID | bonusGold | currentMonthGold | 需扣除');
    console.log('------|----------|-------------------|------');
    affectedUsers.forEach(u => {
      const deduct = Math.min(u.bonusGold, u.currentMonthGold);
      console.log(`${u.employeeId} | ${u.bonusGold} | ${u.currentMonthGold} | ${deduct}`);
    });

    // 计算总扣除金币
    const totalDeduct = affectedUsers.reduce((sum, u) => {
      return sum + Math.min(u.bonusGold, u.currentMonthGold);
    }, 0);
    console.log('\n总扣除金币:', totalDeduct);

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });