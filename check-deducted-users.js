const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查询所有UserGold记录，按currentMonthGold排序
    const userGolds = await UserGold.find({})
      .sort({ currentMonthGold: -1 })
      .limit(30);

    console.log('\n=== 前30个用户的金币余额 ===');
    console.log('员工ID | currentMonthGold | lastMonthGold');

    for (const ug of userGolds) {
      console.log(`${ug.employeeId} | ${ug.currentMonthGold.toFixed(2)} | ${ug.lastMonthGold.toFixed(2)}`);
    }

    // 检查5个重复领取的用户当前金币
    console.log('\n\n=== 重复领取用户当前金币 ===');
    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];

    for (const empId of dupUsers) {
      const ug = await UserGold.findOne({ employeeId: empId });
      const claim15 = await WeeklyBonusClaim.findOne({ employeeId: empId, week: '2026-15' });
      const claim16 = await WeeklyBonusClaim.findOne({ employeeId: empId, week: '2026-16' });

      console.log(`\n员工 ${empId}:`);
      console.log(`  currentMonthGold: ${ug ? ug.currentMonthGold.toFixed(2) : 'N/A'}`);
      console.log(`  第15周领取: ${claim15 ? claim15.bonusGold : '无'}`);
      console.log(`  第16周领取: ${claim16 ? claim16.bonusGold : '无'}`);
      console.log(`  应扣金币: ${claim16 ? claim16.bonusGold : 0}`);
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });