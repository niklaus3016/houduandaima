const mongoose = require('mongoose');
const Employee = require('./models/Employee');
const Admin = require('./models/Admin');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    const huangzhenhui = await Admin.findOne({ username: 'huangzhenhui' });
    if (huangzhenhui) {
      console.log('huangzhenhui:', JSON.stringify(huangzhenhui, null, 2));
    }

    console.log('\n=== 查询员工7579的完整信息 ===');
    const emp7579 = await Employee.findOne({ employeeId: '7579' });
    if (emp7579) {
      console.log(JSON.stringify(emp7579, null, 2));
    }

    console.log('\n=== 用parentId查询员工 ===');
    const parentId = '69b116a5c9e0f0e16c46ba2c';
    const children = await Employee.find({ parentId: parentId });
    console.log(`parentId=${parentId} 下有 ${children.length} 个员工`);
    children.forEach(e => {
      console.log(`- employeeId: ${e.employeeId}, realName: ${e.realName}`);
    });

    console.log('\n=== 用huangzhenhui._id查询员工 ===');
    if (huangzhenhui) {
      const children2 = await Employee.find({ parentId: huangzhenhui._id.toString() });
      console.log(`huangzhenhui._id=${huangzhenhui._id} 下有 ${children2.length} 个员工`);
      children2.forEach(e => {
        console.log(`- employeeId: ${e.employeeId}, realName: ${e.realName}`);
      });
    }

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });