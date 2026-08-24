const mongoose = require('mongoose');

async function main() {
  const conn = await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb&readPreference=secondaryPreferred');
  const db = conn.connection.db;
  const employees = db.collection('employees');

  // 查询所有设置了 csjDeviceLimit 的员工
  const results = await employees.find(
    { csjDeviceLimit: { $exists: true, $ne: null } },
    { projection: { _id: 0, employeeId: 1, realName: 1, csjDeviceLimit: 1 } }
  ).sort({ csjDeviceLimit: -1, employeeId: 1 }).toArray();

  console.log('========== 员工 CSJ 设备数限制一览 ==========');
  console.log('总记录数: ' + results.length);
  console.log('');
  console.log('员工ID | 姓名 | 设备数限制');
  console.log('---|---|---');
  results.forEach(e => {
    const eid = e.employeeId || '(无ID)';
    const name = e.realName || '(未填)';
    const limit = e.csjDeviceLimit !== undefined ? e.csjDeviceLimit : 1;
    console.log(eid + ' | ' + name + ' | ' + limit);
  });

  // 按设备数限制分组统计
  const groupResult = await employees.aggregate([
    { $group: {
      _id: '$csjDeviceLimit',
      count: { $sum: 1 }
    }},
    { $sort: { _id: 1 } }
  ]).toArray();

  console.log('');
  console.log('========== 按限制数分组统计 ==========');
  console.log('设备数限制 | 员工数');
  console.log('---|---');
  groupResult.forEach(g => {
    console.log((g._id === null ? 'null(默认1)' : g._id) + ' | ' + g.count);
  });

  await mongoose.disconnect();
}
main().catch(e => console.error(e));
