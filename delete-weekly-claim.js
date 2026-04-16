const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function deleteWeeklyClaim() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');
    
    const WeeklyBonusClaim = mongoose.connection.db.collection('weeklybonusclaims');
    
    // 删除用户1111的周奖励领取记录
    const result = await WeeklyBonusClaim.deleteMany({ employeeId: '1111' });
    
    console.log(`已删除 ${result.deletedCount} 条领取记录`);
    
  } catch (error) {
    console.error('删除失败:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n数据库连接已关闭');
  }
}

deleteWeeklyClaim();
