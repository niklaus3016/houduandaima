const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const users = ['3236', '4860', '5555', '6205', '8886'];

    for (const empId of users) {
      console.log(`\n=== 检查用户 ${empId} ===`);
      
      const claims = await WeeklyBonusClaim.find({ employeeId: empId }).sort({ week: 1 });
      console.log(`领取记录数: ${claims.length}`);
      
      for (const claim of claims) {
        const goldLog = await GoldLog.findOne({
          userId: claim.userId,
          employeeId: claim.employeeId,
          gold: claim.bonusGold,
          type: 'weekly_bonus'
        });
        
        if (!goldLog) {
          console.log(`❌ 缺少GoldLog记录: ${empId} - 第${claim.week}周 ${claim.bonusGold}金币`);
          
          // 补记录
          await new GoldLog({
            userId: claim.userId,
            employeeId: claim.employeeId,
            gold: claim.bonusGold,
            type: 'weekly_bonus',
            createTime: claim.claimedAt || new Date()
          }).save();
          console.log(`✅ 已补GoldLog记录`);
        } else {
          console.log(`✅ 已有GoldLog记录: ${empId} - 第${claim.week}周 ${claim.bonusGold}金币`);
        }
      }
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });