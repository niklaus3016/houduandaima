const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 直接使用原生MongoDB客户端
const { MongoClient } = require('mongodb');

async function checkTeamGroupData() {
  try {
    console.log('=== 检查TeamGroup表中的实际数据 ===\n');

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('MongoDB连接成功\n');

    const db = client.db();
    const collection = db.collection('teamgroups');

    // 查询所有TeamGroup记录
    const groups = await collection.find({}).toArray();
    console.log(`TeamGroup表中共有 ${groups.length} 条记录:`);
    console.log('');

    groups.forEach((g, i) => {
      console.log(`${i+1}. ${g.groupName}`);
      console.log(`   teamName: ${g.teamName}`);
      console.log(`   teamLeaderId: "${g.teamLeaderId}"`);
      console.log(`   groupLeaderId: "${g.groupLeaderId}"`);
      console.log(`   groupLeaderName: "${g.groupLeaderName}"`);
      console.log('');
    });

    // 测试查询fanjie的userId
    const fanjieUserId = '69cd2b814b7bff2403ab4f70';
    console.log(`测试查询 teamLeaderId = "${fanjieUserId}":`);
    const result = await collection.find({ teamLeaderId: fanjieUserId }).toArray();
    console.log(`找到 ${result.length} 条记录`);
    console.log('');

    // 测试查询groupName = "洁然如初代理"
    console.log('测试查询 groupName = "洁然如初代理":');
    const result2 = await collection.find({ groupName: '洁然如初代理' }).toArray();
    console.log(`找到 ${result2.length} 条记录`);
    if (result2.length > 0) {
      console.log(`  teamLeaderId: "${result2[0].teamLeaderId}"`);
      console.log(`  groupLeaderId: "${result2[0].groupLeaderId}"`);
    }

    await client.close();

  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

checkTeamGroupData();
