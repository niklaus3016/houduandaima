const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  // 查询修复前的数据
  const before = await UserGold.findOne({ employeeId: '8886' });
  console.log('修复前:', before);
  
  // 返还第一次提现被拒绝的金币
  await UserGold.updateOne(
    { employeeId: '8886' },
    { $inc: { lastMonthGold: 457762.4267809306 } }
  );
  
  // 查询修复后的数据
  const after = await UserGold.findOne({ employeeId: '8886' });
  console.log('修复后:', after);
  
  await mongoose.connection.close();
});