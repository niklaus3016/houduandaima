const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 5个重复领取的用户
    const dupUsers = ['3236', '4860', '5555', '6205', '8886'];

    console.log('\n=== 5个重复领取用户当前金币 ===');
    console.log('员工ID | 当前currentMonthGold | bonusGold(28888) | 差额');

    for (const empId of dupUsers) {
      const ug = await UserGold.findOne({ employeeId: empId });
      if (ug) {
        const expected = 855991.89; // 假设这是之前的值
        console.log(`${empId} | ${ug.currentMonthGold.toFixed(2)} | 28888 | 差额=${(ug.currentMonthGold - expected + 28888).toFixed(2)}`);
      }
    }

    // 查询所有用户金币余额
    console.log('\n\n=== 当前金币余额前20名 ===');
    const allUsers = await UserGold.find({}).sort({ currentMonthGold: -1 }).limit(20);
    console.log('排名 | 员工ID | currentMonthGold');
    allUsers.forEach((u, i) => {
      console.log(`${i+1} | ${u.employeeId} | ${u.currentMonthGold.toFixed(2)}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });