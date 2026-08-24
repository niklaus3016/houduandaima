const mongoose = require('mongoose');
async function main() {
  await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb');
  const Admin = require('./models/Admin');
  const roles = await Admin.distinct('role').lean();
  console.log('当前系统存在的角色：', roles);
  
  const counts = await Admin.aggregate([
    { $group: { _id: '$role', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
  console.log('\n各角色数量：');
  counts.forEach(c => console.log('  ' + c._id + ': ' + c.count));
  
  await mongoose.disconnect();
}
main();
