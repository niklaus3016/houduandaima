const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 直接使用原生MongoDB客户端
const { MongoClient } = require('mongodb');

async function checkRawData() {
  try {
    console.log('=== 检查Employee表中teamGroupId的实际类型 ===\n');

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('MongoDB连接成功\n');

    const db = client.db();
    const collection = db.collection('employees');

    // 查找一个有非空teamGroupId的员工记录
    const sample = await collection.findOne({
      teamGroupId: { $exists: true, $ne: null, $ne: '' }
    });

    if (sample) {
      console.log('示例员工记录:');
      console.log(`  employeeId: ${sample.employeeId}`);
      console.log(`  username: ${sample.username}`);
      console.log(`  teamGroupId: ${sample.teamGroupId}`);
      console.log(`  teamGroupId 类型: ${typeof sample.teamGroupId}`);
      console.log(`  teamGroupId constructor: ${sample.teamGroupId.constructor.name}`);

      console.log('\n测试不同类型的查询:');

      const stringId = sample.teamGroupId.toString();
      console.log(`字符串查询 teamGroupId = "${stringId}":`);

      const result1 = await collection.countDocuments({ teamGroupId: stringId });
      console.log(`  用字符串查询: 找到 ${result1} 条`);

      try {
        const result2 = await collection.countDocuments({ teamGroupId: new mongoose.Types.ObjectId(stringId) });
        console.log(`  用ObjectId查询: 找到 ${result2} 条`);
      } catch (e) {
        console.log(`  用ObjectId查询失败: ${e.message}`);
      }

      const result3 = await collection.countDocuments({
        $or: [
          { teamGroupId: stringId },
          { teamGroupId: new mongoose.Types.ObjectId(stringId) }
        ]
      });
      console.log(`  用$or查询: 找到 ${result3} 条`);
    } else {
      console.log('没有找到有teamGroupId的员工记录');
    }

    await client.close();

  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

checkRawData();
