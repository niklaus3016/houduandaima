const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const TeamGroup = require('./models/TeamGroup');

// 数据库连接字符串
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');

    // 1. 查找"花生"组
    console.log('1. 查找"花生"组:');
    const group = await TeamGroup.findOne({ groupName: '花生' });
    if (!group) {
      console.log('   未找到"花生"组');
    } else {
      console.log(`   _id: ${group._id}`);
      console.log(`   groupName: ${group.groupName}`);
      console.log(`   teamLeaderId: ${group.teamLeaderId}`);
      console.log(`   groupLeaderId: ${group.groupLeaderId}`);
      console.log(`   groupLeaderName: ${group.groupLeaderName}`);
    }

    // 2. 查找所有 Admin 帐号
    console.log('\n2. 所有 Admin 帐号 (username 包含"花"或"仁"或"组"):');
    const admins = await Admin.find({ username: { $regex: '花|仁|组' } });
    admins.forEach(a => {
      console.log(`   _id: ${a._id}`);
      console.log(`   username: ${a.username}`);
      console.log(`   realName: ${a.realName}`);
      console.log(`   role: ${a.role}`);
      console.log(`   teamGroupId: ${a.teamGroupId}`);
      console.log(`   teamName: ${a.teamName}`);
      console.log('   ---');
    });

    // 3. 查找 teamGroupId 为"花生"组ID的 Admin
    console.log('\n3. 查找 teamGroupId 为"花生"组ID的 Admin:');
    if (group) {
      const adminsWithGroupId = await Admin.find({ teamGroupId: group._id.toString() });
      adminsWithGroupId.forEach(a => {
        console.log(`   _id: ${a._id}, username: ${a.username}, teamGroupId: ${a.teamGroupId}`);
      });
      if (adminsWithGroupId.length === 0) {
        console.log('   没有找到');
      }
    }

    // 4. 列出所有已开通组长（role: GROUP_LEADER）的 Admin
    console.log('\n4. 所有已开通组长 (role: GROUP_LEADER):');
    const groupLeaders = await Admin.find({ role: 'GROUP_LEADER' });
    groupLeaders.forEach(a => {
      console.log(`   _id: ${a._id}`);
      console.log(`   username: ${a.username}`);
      console.log(`   realName: ${a.realName}`);
      console.log(`   teamGroupId: ${a.teamGroupId}`);
      console.log(`   teamName: ${a.teamName}`);
      console.log('   ---');
    });

    mongoose.connection.close();
  } catch (error) {
    console.error('错误:', error);
    mongoose.connection.close();
  }
}

checkData();