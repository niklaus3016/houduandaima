const mongoose = require('mongoose');

// MongoDB连接字符串
const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

// 直接使用原生MongoDB客户端
const { MongoClient } = require('mongodb');

async function checkTeamHierarchy() {
  try {
    console.log('=== 检查团队层级关系 ===\n');

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log('MongoDB连接成功\n');

    const db = client.db();
    
    // 1. 检查所有TeamGroup记录
    console.log('1. 所有TeamGroup记录:');
    const teamGroups = await db.collection('teamgroups').find({}).toArray();
    teamGroups.forEach((g, i) => {
      console.log(`${i+1}. ${g.groupName}`);
      console.log(`   teamLeaderId: "${g.teamLeaderId}"`);
      console.log(`   groupLeaderId: "${g.groupLeaderId}"`);
      console.log(`   groupLeaderName: "${g.groupLeaderName}"`);
      console.log(`   teamName: "${g.teamName}"`);
      console.log('');
    });

    // 2. 检查fanjie的组
    console.log('2. 检查fanjie的组:');
    const fanjieGroup = await db.collection('teamgroups').findOne({ groupLeaderName: '范洁' });
    if (fanjieGroup) {
      console.log(`组名: ${fanjieGroup.groupName}`);
      console.log(`teamLeaderId: "${fanjieGroup.teamLeaderId}"`);
      console.log(`groupLeaderId: "${fanjieGroup.groupLeaderId}"`);
      console.log(`teamName: "${fanjieGroup.teamName}"`);
    }
    console.log('');

    // 3. 检查cuiding的组
    console.log('3. 检查cuiding的组:');
    const cuidingGroups = await db.collection('teamgroups').find({ teamLeaderId: '69af8e34132651c70aa85608' }).toArray();
    cuidingGroups.forEach((g, i) => {
      console.log(`${i+1}. ${g.groupName}`);
      console.log(`   teamLeaderId: "${g.teamLeaderId}"`);
      console.log(`   groupLeaderId: "${g.groupLeaderId}"`);
      console.log(`   groupLeaderName: "${g.groupLeaderName}"`);
      console.log('');
    });

    // 4. 检查团队名称
    console.log('4. 检查团队名称:');
    const teamNames = await db.collection('teamgroups').distinct('teamName');
    console.log(`所有团队名称: ${teamNames}`);
    console.log('');

    // 5. 检查fanjie组的teamName
    if (fanjieGroup) {
      console.log('5. 检查与fanjie同团队的组:');
      const sameTeamGroups = await db.collection('teamgroups').find({ teamName: fanjieGroup.teamName }).toArray();
      console.log(`团队 "${fanjieGroup.teamName}" 共有 ${sameTeamGroups.length} 个组:`);
      sameTeamGroups.forEach((g, i) => {
        console.log(`${i+1}. ${g.groupName} (teamLeaderId: "${g.teamLeaderId}")`);
      });
    }

    await client.close();

  } catch (error) {
    console.error('检查失败:', error.message);
  }
}

checkTeamHierarchy();
