const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function findEmployees() {
  try {
    console.log('=== 查找有teamGroupId的员工记录 ===\n');

    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功\n');

    // 直接查询原生集合
    const db = mongoose.connection.db;
    const collection = db.collection('employees');

    // 查找teamGroupId不为null且不为空字符串的记录
    const samples = await collection.find({
      teamGroupId: { $type: 'string', $ne: '' }
    }).limit(5).toArray();

    console.log(`找到 ${samples.length} 条teamGroupId为字符串的记录:\n`);

    samples.forEach((sample, i) => {
      console.log(`${i+1}. employeeId: ${sample.employeeId}`);
      console.log(`   teamGroupId: "${sample.teamGroupId}"`);
      console.log(`   groupName: ${sample.groupName}`);
      console.log('');
    });

    // 测试查询teamGroupId = "69cd2b814b7bff2403ab4f70"
    console.log('测试查询 teamGroupId = "69cd2b814b7bff2403ab4f70":');
    const count = await collection.countDocuments({ teamGroupId: '69cd2b814b7bff2403ab4f70' });
    console.log(`  找到 ${count} 条\n`);

    // 测试查询teamGroupId = "69cd2b3f4b7bff2403ab4c79"
    console.log('测试查询 teamGroupId = "69cd2b3f4b7bff2403ab4c79":');
    const count2 = await collection.countDocuments({ teamGroupId: '69cd2b3f4b7bff2403ab4c79' });
    console.log(`  找到 ${count2} 条\n`);

    await mongoose.connection.close();

  } catch (error) {
    console.error('查找失败:', error.message);
  }
}

findEmployees();
