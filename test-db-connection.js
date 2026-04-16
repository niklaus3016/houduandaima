const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

console.log('开始测试数据库连接...');
console.log('数据库地址:', MONGODB_URI.replace(/:[^:@]+@/, ':****@'));

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000
})
  .then(() => {
    console.log('✅ 数据库连接成功！');
    
    // 测试数据库操作
    return mongoose.connection.db.admin().ping();
  })
  .then((result) => {
    console.log('✅ 数据库ping测试成功:', result);
    
    // 列出所有数据库
    return mongoose.connection.db.admin().listDatabases();
  })
  .then((result) => {
    console.log('✅ 数据库列表:');
    result.databases.forEach(db => {
      console.log(`   - ${db.name} (大小: ${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    mongoose.connection.close();
    console.log('\n数据库连接测试完成，连接已关闭。');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 数据库连接失败:', error.message);
    console.error('错误详情:', error);
    process.exit(1);
  });

// 监听连接事件
mongoose.connection.on('connected', () => {
  console.log('Mongoose连接成功');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose连接错误:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose连接断开');
});
