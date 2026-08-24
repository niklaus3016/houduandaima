const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb');
  const db = mongoose.connection.db;
  const employees = db.collection('employees');

  const total = await employees.countDocuments();
  console.log('总员工数: ' + total);

  // 批量设置三个字段为 2
  const result = await employees.updateMany(
    {},
    { $set: { csjDeviceLimit: 2, ksDeviceLimit: 2, ylhDeviceLimit: 2 } }
  );

  console.log('匹配数: ' + result.matchedCount);
  console.log('修改数: ' + result.modifiedCount);

  // 验证
  const csj2 = await employees.countDocuments({ csjDeviceLimit: 2 });
  const ks2 = await employees.countDocuments({ ksDeviceLimit: 2 });
  const ylh2 = await employees.countDocuments({ ylhDeviceLimit: 2 });
  console.log('');
  console.log('验证:');
  console.log('  csjDeviceLimit=2: ' + csj2 + ' 人');
  console.log('  ksDeviceLimit=2: ' + ks2 + ' 人');
  console.log('  ylhDeviceLimit=2: ' + ylh2 + ' 人');

  await mongoose.disconnect();
}
main().catch(e => console.error(e));
