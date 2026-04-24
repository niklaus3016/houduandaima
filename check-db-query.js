const mongoose = require('mongoose');
const Employee = require('./models/Employee');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const teamId = '69b116a5c9e0f0e16c46ba2c';

    console.log('\n=== 直接查询数据库 ===');
    const employees = await Employee.find({ parentId: teamId });
    console.log(`parentId=${teamId} 的员工总数: ${employees.length}`);

    const emp7579 = employees.find(e => e.employeeId === '7579');
    if (emp7579) {
      console.log('✅ 数据库中有员工7579');
    } else {
      console.log('❌ 数据库中没有员工7579');
    }

    console.log('\n=== 模拟接口查询逻辑 ===');
    const result = await Employee.find(
      { parentId: teamId },
      { employeeId: 1, realName: 1, status: 1, phone: 1, region: 1, teamGroupId: 1, parentId: 1, createdAt: 1, _id: 1 }
    );
    console.log(`find()返回的记录数: ${result.length}`);

    const emp7579Result = result.find(e => e.employeeId === '7579');
    if (emp7579Result) {
      console.log('✅ find()结果中有员工7579');
    } else {
      console.log('❌ find()结果中没有员工7579');
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });