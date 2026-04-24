const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const UserGold = require('./models/UserGold');
const WeeklyBonusClaim = require('./models/WeeklyBonusClaim');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const empId = '3236';

    console.log('\n=== 检查3236的28888金币记录 ===');
    const bonusLogs = await GoldLog.find({
      employeeId: empId,
      gold: 28888,
      type: 'weekly_bonus'
    }).sort({ createTime: -1 });

    console.log(`28888金币记录数: ${bonusLogs.length}`);
    bonusLogs.forEach((log, i) => {
      console.log(`${i+1}. createTime=${log.createTime.toISOString()}, gold=${log.gold}, type=${log.type}`);
    });

    console.log('\n=== 检查UserGold ===');
    const userGold = await UserGold.findOne({ employeeId: empId });
    if (userGold) {
      console.log(`currentMonthGold: ${userGold.currentMonthGold ? userGold.currentMonthGold.toFixed(2) : 'N/A'}`);
      console.log(`totalGold: ${userGold.totalGold ? userGold.totalGold.toFixed(2) : 'N/A'}`);
    } else {
      console.log('未找到UserGold记录');
    }

    console.log('\n=== 检查WeeklyBonusClaim ===');
    const claims = await WeeklyBonusClaim.find({ employeeId: empId }).sort({ week: 1 });
    console.log(`领取记录数: ${claims.length}`);
    claims.forEach(c => {
      console.log(`第${c.week}周: bonusGold=${c.bonusGold}, claimedAt=${c.claimedAt.toISOString()}`);
    });

    console.log('\n=== 检查近期金币变动 ===');
    const recentLogs = await GoldLog.find({
      employeeId: empId,
    }).sort({ createTime: -1 }).limit(20);
    console.log(`最近20条记录:`);
    recentLogs.forEach((log, i) => {
      console.log(`${i+1}. createTime=${log.createTime.toISOString()}, gold=${log.gold}, type=${log.type}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });