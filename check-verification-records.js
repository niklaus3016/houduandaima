const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function checkVerificationRecords() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('数据库连接成功\n');
    
    const Verification = mongoose.connection.db.collection('verifications');
    
    // 查询所有核销记录
    const records = await Verification.find({}).toArray();
    
    console.log(`共找到 ${records.length} 条核销记录`);
    console.log('');
    
    records.forEach((record, index) => {
      console.log(`记录 ${index + 1}:`);
      console.log(`  ID: ${record._id}`);
      console.log(`  员工ID: ${record.employeeId}`);
      console.log(`  金额: ${record.amount}`);
      console.log(`  状态: ${record.status}`);
      console.log(`  支付宝姓名: ${record.alipayName || '未设置'}`);
      console.log(`  支付宝账号: ${record.alipayAccount || '未设置'}`);
      console.log(`  发票文件: ${record.invoiceFile}`);
      console.log(`  创建时间: ${record.createdAt}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await mongoose.connection.close();
    console.log('数据库连接已关闭');
  }
}

checkVerificationRecords();
