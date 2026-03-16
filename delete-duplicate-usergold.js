const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function deleteDuplicateUserGold() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    const employeeId = '2222';

    // 查找所有匹配的UserGold记录
    const allUserGold = await UserGold.find({ employeeId });
    console.log('\n=== 所有UserGold记录 ===');
    console.log(`总记录数: ${allUserGold.length}`);
    allUserGold.forEach((record, index) => {
      console.log(`${index + 1}. userId: ${record.userId}, 本月金币: ${record.currentMonthGold}`);
    });

    // 删除userId为'2222'的记录（保留user_2222_1773112309254）
    const result = await UserGold.deleteOne({ 
      employeeId: employeeId,
      userId: '2222'
    });

    console.log('\n=== 删除结果 ===');
    if (result.deletedCount > 0) {
      console.log(`✅ 成功删除 ${result.deletedCount} 条重复记录`);
    } else {
      console.log('⚠️  未找到需要删除的记录');
    }

    // 再次查询确认
    const remainingRecords = await UserGold.find({ employeeId });
    console.log('\n=== 删除后剩余记录 ===');
    console.log(`剩余记录数: ${remainingRecords.length}`);
    remainingRecords.forEach((record, index) => {
      console.log(`${index + 1}. userId: ${record.userId}, 本月金币: ${record.currentMonthGold}`);
    });

    await mongoose.disconnect();
    console.log('\n完成');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

deleteDuplicateUserGold();
