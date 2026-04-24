const mongoose = require('mongoose');
const GoldLog = require('./models/GoldLog');

mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017')
  .then(async () => {
    console.log('MongoDB连接成功');

    // 查看GoldLog的字段结构
    const sample = await GoldLog.findOne({ employeeId: '2222' });
    console.log('\n=== GoldLog示例记录 ===');
    console.log('所有字段:', Object.keys(sample.toObject()));
    console.log('userId:', sample.userId);
    console.log('employeeId:', sample.employeeId);

    // 测试两种查询方式
    console.log('\n=== 查询测试 ===');

    // 方式1: 用employeeId查询
    const count1 = await GoldLog.countDocuments({
      employeeId: '2222',
      createTime: {
        $gte: new Date('2026-04-12T16:00:00.000Z'),
        $lt: new Date('2026-04-19T16:00:00.000Z')
      }
    });
    console.log('用employeeId查询:', count1, '条');

    // 方式2: 用userId查询
    const count2 = await GoldLog.countDocuments({
      userId: 'user_2222_1773112309254',
      createTime: {
        $gte: new Date('2026-04-12T16:00:00.000Z'),
        $lt: new Date('2026-04-19T16:00:00.000Z')
      }
    });
    console.log('用userId查询:', count2, '条');

    // 方式3: 两者都用
    const count3 = await GoldLog.countDocuments({
      employeeId: '2222',
      userId: 'user_2222_1773112309254',
      createTime: {
        $gte: new Date('2026-04-12T16:00:00.000Z'),
        $lt: new Date('2026-04-19T16:00:00.000Z')
      }
    });
    console.log('用employeeId和userId查询:', count3, '条');

    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接错误:', err);
    mongoose.disconnect();
  });