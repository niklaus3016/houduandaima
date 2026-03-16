const mongoose = require('mongoose');
const Employee = require('./models/Employee');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI).then(async () => {
  console.log('=== 初始化员工phoneCount字段 ===');
  
  // 查找所有phoneCount字段不存在或为null的员工
  const employees = await Employee.find({ 
    $or: [
      { phoneCount: { $exists: false } },
      { phoneCount: null }
    ]
  });
  
  console.log(`找到 ${employees.length} 个需要初始化phoneCount的员工`);
  
  // 批量更新
  const updatePromises = employees.map(emp => {
    return Employee.findByIdAndUpdate(emp._id, { phoneCount: 0 });
  });
  
  await Promise.all(updatePromises);
  
  console.log('初始化完成！');
  
  // 验证结果
  const allEmployees = await Employee.find({});
  console.log(`\n当前员工总数: ${allEmployees.length}`);
  
  let noPhoneCount = 0;
  allEmployees.forEach(emp => {
    if (emp.phoneCount === undefined || emp.phoneCount === null) {
      noPhoneCount++;
    }
  });
  
  console.log(`phoneCount字段缺失的员工数: ${noPhoneCount}`);
  
  mongoose.disconnect();
});