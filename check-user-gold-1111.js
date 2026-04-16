const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkUserGold() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');
    
    const UserGold = mongoose.connection.db.collection('usergolds');
    const WeeklyBonusClaim = mongoose.connection.db.collection('weeklybonusclaims');
    
    // 查询用户1111的金币记录
    const userGold = await UserGold.findOne({ employeeId: '1111' });
    
    console.log('========================================');
    console.log('用户1111的金币记录');
    console.log('========================================');
    console.log(`userId: ${userGold.userId}`);
    console.log(`employeeId: ${userGold.employeeId}`);
    console.log(`本月金币: ${userGold.currentMonthGold}`);
    console.log(`上月金币: ${userGold.lastMonthGold}`);
    console.log(`总金币: ${(userGold.currentMonthGold || 0) + (userGold.lastMonthGold || 0)}`);
    console.log('');
    
    // 查询用户1111的周奖励领取记录
    const claims = await WeeklyBonusClaim.find({ employeeId: '1111' }).toArray();
    
    console.log('========================================');
    console.log('用户1111的周奖励领取记录');
    console.log('========================================');
    console.log(`领取记录数: ${claims.length}`);
    
    if (claims.length > 0) {
      claims.forEach((claim, index) => {
        console.log(`\n记录 ${index + 1}:`);
        console.log(`  周: ${claim.week}`);
        console.log(`  奖励金币: ${claim.bonusGold}`);
        console.log(`  领取时间: ${claim.claimedAt}`);
      });
    }
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n数据库连接已关闭');
  }
}

checkUserGold();
