const mongoose = require('mongoose');
const UserGold = require('./models/UserGold');
const GoldLog = require('./models/GoldLog');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function clean8202Users() {
  try {
    // 连接MongoDB
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 要保留的用户ID
    const keepUserId = 'user_8202_1772466028893';

    // 查询8202员工对应的所有用户记录
    const userGolds = await UserGold.find({ employeeId: '8202' });
    console.log('8202员工对应的用户记录数量:', userGolds.length);

    // 筛选出要删除的用户
    const usersToDelete = userGolds.filter(userGold => userGold.userId !== keepUserId);
    console.log('要删除的用户数量:', usersToDelete.length);

    if (usersToDelete.length > 0) {
      console.log('\n要删除的用户列表:');
      usersToDelete.forEach(userGold => {
        console.log(`userId: ${userGold.userId}, currentMonthGold: ${userGold.currentMonthGold}`);
      });

      // 批量删除UserGold记录
      const userIdsToDelete = usersToDelete.map(userGold => userGold.userId);
      const deleteResult = await UserGold.deleteMany({
        employeeId: '8202',
        userId: { $in: userIdsToDelete }
      });
      console.log('\n删除UserGold记录结果:', deleteResult);

      // 批量删除对应的GoldLog记录
      const goldLogDeleteResult = await GoldLog.deleteMany({
        employeeId: '8202',
        userId: { $in: userIdsToDelete }
      });
      console.log('删除GoldLog记录结果:', goldLogDeleteResult);

      // 验证删除结果
      const remainingUserGolds = await UserGold.find({ employeeId: '8202' });
      console.log('\n删除后剩余的用户记录数量:', remainingUserGolds.length);
      remainingUserGolds.forEach(userGold => {
        console.log(`剩余用户: userId: ${userGold.userId}, currentMonthGold: ${userGold.currentMonthGold}`);
      });

    } else {
      console.log('没有需要删除的用户记录');
    }

    // 断开连接
    await mongoose.disconnect();
  } catch (error) {
    console.error('操作错误:', error);
    // 断开连接
    await mongoose.disconnect();
  }
}

clean8202Users();