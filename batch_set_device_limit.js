const mongoose = require('mongoose');

async function main() {
  const conn = await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb');
  const db = conn.connection.db;
  const employees = db.collection('employees');

  // 先查总数
  const totalBefore = await employees.countDocuments();
  const non2Before = await employees.countDocuments({ csjDeviceLimit: { $ne: 2 } });

  console.log('总员工数: ' + totalBefore);
  console.log('csjDeviceLimit != 2 的数量: ' + non2Before);

  // 批量更新所有员工
  const result = await employees.updateMany(
    {},
    { $set: { csjDeviceLimit: 2 } }
  );

  console.log('');
  console.log('更新结果:');
  console.log('  匹配数: ' + result.matchedCount);
  console.log('  修改数: ' + result.modifiedCount);

  // 验证
  const limit2 = await employees.countDocuments({ csjDeviceLimit: 2 });
  const others = await employees.countDocuments({ csjDeviceLimit: { $ne: 2 } });
  console.log('');
  console.log('验证:');
  console.log('  csjDeviceLimit = 2: ' + limit2 + ' 人');
  console.log('  csjDeviceLimit != 2: ' + others + ' 人');

  await mongoose.disconnect();
}
main().catch(e => console.error(e));
