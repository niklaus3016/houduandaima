const mongoose = require('mongoose');
const Admin = require('./models/Admin');
const WithdrawRecord = require('./models/WithdrawRecord');

async function testAdminWithdraw() {
  try {
    await mongoose.connect('mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017');
    console.log('数据库连接成功');
    
    // 查询管理员cuijie
    const admin = await Admin.findOne({ username: 'cuijie' });
    if (!admin) {
      console.log('管理员cuijie不存在');
      return;
    }
    
    console.log('提现前管理员信息:', {
      username: admin.username,
      commission: admin.commission,
      teamName: admin.teamName
    });
    
    // 提现金额
    const amount = 5;
    
    // 检查余额
    if (admin.commission < amount) {
      console.log('余额不足');
      return;
    }
    
    // 扣除提成（原子操作）
    await Admin.findByIdAndUpdate(
      admin._id,
      { $inc: { commission: -amount } }
    );
    
    // 创建提现记录（标记为待处理）
    const withdrawRecord = new WithdrawRecord({
      userId: admin.username,
      employeeId: 'cuijie', // 使用管理员用户名作为员工ID
      amount,
      goldAmount: 0,
      alipayAccount: 'cuijie@example.com',
      alipayName: 'cuijie',
      status: 0,
      statusText: '待处理',
      createTime: new Date(),
      type: 'admin'
    });
    
    await withdrawRecord.save();
    
    // 查询更新后的管理员信息
    const updatedAdmin = await Admin.findById(admin._id);
    
    console.log('提现成功！');
    console.log('提现记录:', {
      _id: withdrawRecord._id,
      userId: withdrawRecord.userId,
      amount: withdrawRecord.amount,
      status: withdrawRecord.status,
      statusText: withdrawRecord.statusText,
      type: withdrawRecord.type
    });
    console.log('提现后管理员余额:', updatedAdmin.commission);
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('测试失败:', error);
    process.exit(1);
  }
}

testAdminWithdraw();