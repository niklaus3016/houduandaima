const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const empId = '3236';

    console.log('\n=== 检查3236的所有金币记录（包含负数） ===');
    const allLogs = await GoldLog.find({
      employeeId: empId
    }).sort({ createTime: -1 });

    console.log(`总记录数: ${allLogs.length}`);
    console.log('\n最近30条记录:');
    allLogs.slice(0, 30).forEach((log, i) => {
      console.log(`${i+1}. createTime=${log.createTime.toISOString()}, gold=${log.gold}, type=${log.type}`);
    });

    console.log('\n=== 检查是否有扣除28888的记录 ===');
    const deductionLogs = await GoldLog.find({
      employeeId: empId,
      gold: -28888
    }).sort({ createTime: -1 });
    console.log(`扣除28888记录数: ${deductionLogs.length}`);
    deductionLogs.forEach((log, i) => {
      console.log(`${i+1}. createTime=${log.createTime.toISOString()}, gold=${log.gold}, type=${log.type}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });