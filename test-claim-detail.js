const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

// 连接数据库
mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查询用户2222的所有领取记录（不过滤周）
    const claims = await WeeklyBonusClaim.find({
      employeeId: '2222'
    }).sort({ createdAt: -1 });

    console.log('\n=== 用户2222的所有领取记录 ===');
    console.log('记录数:', claims.length);
    claims.forEach((claim, index) => {
      console.log(`\n记录 ${index + 1}:`);
      console.log('  _id:', claim._id);
      console.log('  week:', claim.week);
      console.log('  userId:', claim.userId);
      console.log('  employeeId:', claim.employeeId);
      console.log('  createdAt:', claim.createdAt);
      console.log('  updatedAt:', claim.updatedAt);
    });

    // 检查第16周的数据
    console.log('\n=== 检查第16周数据 ===');
    const week16Claims = await WeeklyBonusClaim.find({ week: '2026-16' });
    console.log('第16周总记录数:', week16Claims.length);
    if (week16Claims.length > 0) {
      week16Claims.forEach((claim, index) => {
        console.log(`记录 ${index + 1}: employeeId=${claim.employeeId}, userId=${claim.userId}, createdAt=${claim.createdAt}`);
      });
    }

    // 关闭连接
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });