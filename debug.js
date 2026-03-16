const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');
const UserGold = require('./models/UserGold');
const Employee = require('./models/Employee');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017').then(async () => {
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
  
  const employees = await Employee.find({ 
    createdAt: { $gte: fifteenDaysAgo },
    $or: [{ status: 'enabled' }, { status: 1 }, { status: { $exists: false } }]
  }).sort({ createdAt: -1 });
  
  const employeeIds = employees.map(e => e.employeeId);
  const userGolds = await UserGold.find({ employeeId: { $in: employeeIds } });
  
  const userGoldMap = {};
  userGolds.forEach(ug => {
    userGoldMap[ug.employeeId] = ug;
  });
  
  const allUserIds = userGolds.map(ug => ug.userId).filter(id => id);
  console.log('allUserIds:', allUserIds);
  
  const allGoldLogs = await GoldLog.find({ userId: { $in: allUserIds } });
  console.log('allGoldLogs count:', allGoldLogs.length);
  
  const goldLogMap = {};
  allGoldLogs.forEach(log => {
    if (!goldLogMap[log.userId]) {
      goldLogMap[log.userId] = [];
    }
    goldLogMap[log.userId].push(log);
  });
  
  console.log('goldLogMap keys:', Object.keys(goldLogMap));
  console.log('goldLogMap[test123] count:', goldLogMap['test123'] ? goldLogMap['test123'].length : 0);
  
  const userGold8202 = userGoldMap['8202'] || {};
  console.log('userGold8202.userId:', userGold8202.userId);
  const userId8202 = userGold8202.userId || '';
  console.log('userId8202:', userId8202);
  const goldLogs8202 = goldLogMap[userId8202] || [];
  console.log('goldLogs8202 count:', goldLogs8202.length);
  
  mongoose.disconnect();
});
