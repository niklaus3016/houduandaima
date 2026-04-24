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

    // 2. 查找"花生仁"帐号
    console.log('\n2. 查找"花生仁"帐号:');
    const admin = await Admin.findOne({ username: '花生仁' });
    if (!admin) {
      console.log('   未找到"花生仁"帐号');
    } else {
      console.log(`   _id: ${admin._id}`);
      console.log(`   username: ${admin.username}`);
      console.log(`   realName: ${admin.realName}`);
      console.log(`   role: ${admin.role}`);
      console.log(`   teamGroupId: ${admin.teamGroupId}`);
      console.log(`   teamName: ${admin.teamName}`);
    }

    // 3. 查找所有username包含"花生"的Admin
    console.log('\n3. 所有username包含"花生"的Admin:');
    const admins = await Admin.find({ username: { $regex: '花生' } });
    admins.forEach(a => {
      console.log(`   _id: ${a._id}, username: ${a.username}, role: ${a.role}, teamGroupId: ${a.teamGroupId}`);
    });

    // 4. 查找所有groupName包含"花生"的TeamGroup
    console.log('\n4. 所有groupName包含"花生"的TeamGroup:');
    const groups = await TeamGroup.find({ groupName: { $regex: '花生' } });
    groups.forEach(g => {
      console.log(`   _id: ${g._id}, groupName: ${g.groupName}, groupLeaderId: ${g.groupLeaderId}`);
    });

    mongoose.connection.close();
  } catch (error) {
    console.error('错误:', error);
    mongoose.connection.close();
  }
}

checkData();