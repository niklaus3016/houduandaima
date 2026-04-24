const mongoose = require('mongoose');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查找用户2222的第16周领取记录
    const claim = await WeeklyBonusClaim.findOne({
      employeeId: '2222',
      week: '2026-16'
    });

    if (claim) {
      console.log('\n找到错误的领取记录:');
      console.log('_id:', claim._id);
      console.log('week:', claim.week);
      console.log('claimedAt:', claim.claimedAt);

      // 修改为正确的周数
      claim.week = '2026-15';
      await claim.save();

      console.log('\n已修正为 week: 2026-15');

      // 验证
      const updated = await WeeklyBonusClaim.findOne({ employeeId: '2222', week: '2026-15' });
      console.log('\n验证 - 查询 week=2026-15:');
      console.log('找到:', updated ? '是' : '否');
    } else {
      console.log('未找到第16周的领取记录');
    }

    // 再次查询所有领取记录
    const allClaims = await WeeklyBonusClaim.find({ employeeId: '2222' });
    console.log('\n=== 用户2222的所有领取记录 ===');
    allClaims.forEach((c, i) => {
      console.log(`${i+1}. week: ${c.week}, claimedAt: ${c.claimedAt}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });