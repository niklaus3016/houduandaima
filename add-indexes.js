const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB连接成功');
    
    const db = mongoose.connection.db;
    
    // 1. 检查当前索引
    console.log('\n=== 当前索引 ===');
    const goldLogIndexes = await db.collection('goldlogs').indexes();
    console.log('GoldLog 索引:');
    goldLogIndexes.forEach(idx => {
      console.log('  -', idx.name, ':', JSON.stringify(idx.key));
    });
    
    const loginRecordIndexes = await db.collection('loginrecords').indexes();
    console.log('\nLoginRecord 索引:');
    loginRecordIndexes.forEach(idx => {
      console.log('  -', idx.name, ':', JSON.stringify(idx.key));
    });
    
    // 2. 添加 createTime 索引
    console.log('\n=== 添加索引 ===');
    
    try {
      await db.collection('goldlogs').createIndex({ createTime: -1 });
      console.log('✅ GoldLog.createTime 索引添加成功');
    } catch (err) {
      if (err.code === 86) {
        console.log('ℹ️ GoldLog.createTime 索引已存在');
      } else {
        console.error('❌ GoldLog.createTime 索引添加失败:', err.message);
      }
    }
    
    try {
      await db.collection('goldlogs').createIndex({ userId: 1, createTime: -1 });
      console.log('✅ GoldLog.userId+createTime 复合索引添加成功');
    } catch (err) {
      if (err.code === 86) {
        console.log('ℹ️ GoldLog.userId+createTime 索引已存在');
      } else {
        console.error('❌ GoldLog.userId+createTime 索引添加失败:', err.message);
      }
    }
    
    try {
      await db.collection('goldlogs').createIndex({ employeeId: 1, createTime: -1 });
      console.log('✅ GoldLog.employeeId+createTime 复合索引添加成功');
    } catch (err) {
      if (err.code === 86) {
        console.log('ℹ️ GoldLog.employeeId+createTime 索引已存在');
      } else {
        console.error('❌ GoldLog.employeeId+createTime 索引添加失败:', err.message);
      }
    }
    
    try {
      await db.collection('loginrecords').createIndex({ loginDate: -1 });
      console.log('✅ LoginRecord.loginDate 索引添加成功');
    } catch (err) {
      if (err.code === 86) {
        console.log('ℹ️ LoginRecord.loginDate 索引已存在');
      } else {
        console.error('❌ LoginRecord.loginDate 索引添加失败:', err.message);
      }
    }
    
    try {
      await db.collection('loginrecords').createIndex({ employeeId: 1, loginDate: -1 });
      console.log('✅ LoginRecord.employeeId+loginDate 复合索引添加成功');
    } catch (err) {
      if (err.code === 86) {
        console.log('ℹ️ LoginRecord.employeeId+loginDate 索引已存在');
      } else {
        console.error('❌ LoginRecord.employeeId+loginDate 索引添加失败:', err.message);
      }
    }
    
    // 3. 验证索引
    console.log('\n=== 验证索引 ===');
    const newGoldLogIndexes = await db.collection('goldlogs').indexes();
    console.log('GoldLog 新索引:');
    newGoldLogIndexes.forEach(idx => {
      console.log('  -', idx.name, ':', JSON.stringify(idx.key));
    });
    
    console.log('\n✅ 索引添加完成');
    mongoose.disconnect();
  })
  .catch(err => {
    console.error('MongoDB连接失败:', err);
    mongoose.disconnect();
  });
