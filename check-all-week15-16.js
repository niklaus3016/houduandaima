const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查询第15周所有记录
    const claims15 = await WeeklyBonusClaim.find({ week: '2026-15' }).sort({ employeeId: 1 });
    console.log('\n=== 第15周领取记录 (共', claims15.length, '条) ===');
    claims15.forEach(c => {
      console.log(`员工 ${c.employeeId}: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt.toISOString()}`);
    });

    // 查询第16周所有记录
    const claims16 = await WeeklyBonusClaim.find({ week: '2026-16' }).sort({ employeeId: 1 });
    console.log('\n=== 第16周领取记录 (共', claims16.length, '条) ===');
    claims16.forEach(c => {
      console.log(`员工 ${c.employeeId}: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt.toISOString()}`);
    });

    // 找出同时有两周记录的用户
    const allEmployees = [...new Set([...claims15.map(c => c.employeeId), ...claims16.map(c => c.employeeId)])];
    console.log('\n=== 同时有两周记录的用户 ===');
    const dupUsers = allEmployees.filter(empId => {
      return claims15.some(c => c.employeeId === empId) && claims16.some(c => c.employeeId === empId);
    });
    console.log('用户数:', dupUsers.length);
    dupUsers.forEach(empId => {
      const c15 = claims15.find(c => c.employeeId === empId);
      const c16 = claims16.find(c => c.employeeId === empId);
      console.log(`员工 ${empId}: 第15周=${c15.claimedAt.toISOString()}, 第16周=${c16.claimedAt.toISOString()}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });