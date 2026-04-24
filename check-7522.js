const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const GoldLog = require('./models/GoldLog');
const UserGold = require('./models/UserGold');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const empId = '7522';

    console.log('\n=== 员工信息 ===');
    const employee = await Employee.findOne({ employeeId: empId });
    if (employee) {
      console.log(`employeeId: ${employee.employeeId}`);
      console.log(`username: ${employee.username}`);
      console.log(`createdAt: ${employee.createdAt.toISOString()}`);
      console.log(`注册时间: ${new Date(employee.createdAt.getTime() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19)}`);
    } else {
      console.log('未找到员工记录');
    }

    console.log('\n=== 金币记录统计 ===');
    const goldLogs = await GoldLog.find({ employeeId: empId });
    console.log(`金币记录总数: ${goldLogs.length}`);

    let totalIncome = 0;
    let totalWithdraw = 0;
    let totalBonus = 0;

    goldLogs.forEach(log => {
      if (log.type === 'income') totalIncome += log.gold;
      else if (log.type === 'withdraw') totalWithdraw += log.gold;
      else if (log.type === 'weekly_bonus') totalBonus += log.gold;
    });

    console.log(`总收入金币: ${totalIncome.toFixed(2)}`);
    console.log(`总提现金币: ${totalWithdraw.toFixed(2)}`);
    console.log(`周奖励金币: ${totalBonus.toFixed(2)}`);

    console.log('\n=== 最近的20条金币记录 ===');
    const recentLogs = await GoldLog.find({ employeeId: empId }).sort({ createTime: -1 }).limit(20);
    recentLogs.forEach((log, i) => {
      const localTime = new Date(log.createTime.getTime() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
      console.log(`${i+1}. [${localTime}] ${log.type}: ${log.gold}`);
    });

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });