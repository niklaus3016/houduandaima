const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const Employee = require('./models/Employee');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

function getBeijingDate() {
  const now = new Date();
  return new Date(now.getTime() + 8 * 60 * 60 * 1000);
}

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    // 查询员工8202的信息
    const employee = await Employee.findOne({ employeeId: '8202' });
    console.log('\n员工8202信息:');
    console.log('  employeeId:', employee.employeeId);
    console.log('  realName:', employee.realName);
    console.log('  groupName:', employee.groupName);
    console.log('  teamGroupId:', employee.teamGroupId);
    console.log('  userId:', employee.userId);
    
    // 查询3-18的金币记录
    const beijingNow = getBeijingDate();
    const todayStart = new Date(beijingNow);
    todayStart.setUTCHours(0, 0, 0, 0);
    const utcTodayStart = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);
    
    console.log('\n查询时间范围:');
    console.log('  北京时间今天0点:', todayStart.toISOString());
    console.log('  UTC时间:', utcTodayStart.toISOString());
    
    const goldLogs = await GoldLog.find({
      employeeId: '8202',
      createTime: { $gte: utcTodayStart }
    }).sort({ createTime: 1 });
    
    console.log('\n3-18金币记录 (共', goldLogs.length, '条):');
    goldLogs.forEach((log, index) => {
      const beijingTime = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000);
      console.log(`\n记录 ${index + 1}:`);
      console.log('  时间:', beijingTime.toISOString());
      console.log('  金币:', log.gold);
      console.log('  ECPM:', log.ecpm);
      console.log('  userId:', log.userId);
      console.log('  deviceId:', log.deviceId);
    });
    
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    process.exit(1);
  });
