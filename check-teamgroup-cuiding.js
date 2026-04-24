const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 直接使用原生MongoDB客户端
const { MongoClient } = require('mongodb');

async function checkTeamGroupCuiding() {
  try {
    console.log('=== 检查TeamGroup表中cuiding的记录 ===\n');

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('MongoDB连接成功\n');

    const db = client.db();
    const collection = db.collection('teamgroups');

    // cuiding的用户ID
    const cuidingUserId = '69af8e34132651c70aa85608';
    console.log(`cuiding的用户ID: ${cuidingUserId}\n`);

    // 测试查询cuiding的记录
    console.log('测试查询teamLeaderId = "69af8e34132651c70aa85608":');
    const result = await collection.find({ teamLeaderId: cuidingUserId }).toArray();
    console.log(`找到 ${result.length} 条记录`);
    
    if (result.length > 0) {
      console.log('找到的记录:');
      result.forEach((g, i) => {
        console.log(`${i+1}. ${g.groupName}`);
        console.log(`   teamLeaderId: "${g.teamLeaderId}"`);
        console.log(`   type: ${typeof g.teamLeaderId}`);
        console.log('');
      });
    }

    // 测试查询所有记录
    console.log('\n所有TeamGroup记录:');
    const allGroups = await collection.find({}).toArray();
    allGroups.forEach((g, i) => {
      console.log(`${i+1}. ${g.groupName}: teamLeaderId = "${g.teamLeaderId}"`);
    });

    await client.close();

  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

checkTeamGroupCuiding();
