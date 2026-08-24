const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const WithdrawRecord = require('./models/WithdrawRecord');
  const SystemConfig = require('./models/SystemConfig');

  console.log('=== 测试高管提现接口 ===\n');

  // 1. 检查提现开关
  console.log('1. 检查提现开关:');
  const config = await SystemConfig.findOne({ key: 'withdraw_enabled' });
  console.log('   config:', config);
  if (!config || config.value === true || (typeof config.value === 'object' && config.value.enabled !== false)) {
    console.log('   提现功能: 开启 ✓');
  } else {
    console.log('   提现功能: 关闭 ✗');
  }

  // 2. 查询 admin002 和 admin003 的信息
  console.log('\n2. 查询管理员信息:');
  for (const username of ['admin002', 'admin003']) {
    const admin = await Admin.findOne({ username }).lean();
    if (admin) {
      console.log(`   ${username}:`);
      console.log('     role:', admin.role);
      console.log('     commission (提现余额):', admin.commission);
      console.log('     managedTeamIds:', admin.managedTeamIds?.length || 0, '个团队');
    }
  }

  // 3. 检查前端可能的调用路径
  console.log('\n3. 检查提现接口路径:');
  console.log('   /api/withdraw/admin/submit (POST) - 管理员提现提交');
  console.log('   /api/admin/withdraw/list (GET) - 管理员提现记录列表');
  console.log('   /api/admin/withdraw/:id/approve (POST) - 通过提现');
  console.log('   /api/admin/withdraw/:id/reject (POST) - 拒绝提现');
  console.log('\n   注意: 高管需要调用的是 /api/withdraw/admin/submit');

  // 4. 模拟请求参数
  console.log('\n4. 模拟请求参数 (admin003):');
  console.log('   {');
  console.log('     amount: 5331.22,');
  console.log('     alipayAccount: "test@example.com",');
  console.log('     alipayName: "黄振汇",');
  console.log('     employeeId: "admin003"');
  console.log('   }');

  // 5. 检查 admin.commission 是否足够
  console.log('\n5. 检查提现余额:');
  const admin003 = await Admin.findOne({ username: 'admin003' }).lean();
  console.log('   admin003.commission =', admin003.commission);
  console.log('   需要提现金额 = 5331.22');
  
  // 模拟接口逻辑
  const pendingAmount = +(await WithdrawRecord.aggregate([
    { $match: { userId: 'admin003', type: 'admin', status: 0 } },
    { $group: { _id: null, sumAmount: { $sum: '$amount' } } }
  ])).next()?.sumAmount || 0;
  
  console.log('   待处理提现金额 =', pendingAmount);
  console.log('   检查: commission >= pendingAmount + amount');
  console.log('         ', admin003.commission, '>=', pendingAmount + 5331.22);
  console.log('         ', admin003.commission >= pendingAmount + 5331.22 ? '✓ 余额充足' : '✗ 余额不足');

  // 6. 检查可能的问题
  console.log('\n6. 可能的问题排查:');
  console.log('   a) 前端调用的接口路径是否正确?');
  console.log('      - 应为: POST /api/withdraw/admin/submit');
  console.log('      - 如果是: POST /api/admin/withdraw/submit → 会404');
  console.log('');
  console.log('   b) 请求参数是否正确?');
  console.log('      - 必需字段: amount, alipayAccount, alipayName, employeeId');
  console.log('      - 如果缺少任何字段，返回400错误');
  console.log('');
  console.log('   c) 认证Token是否有效?');
  console.log('      - 需要有效的JWT Token');
  console.log('      - 如果Token无效，返回401错误');
  console.log('');
  console.log('   d) 提现开关是否打开?');
  console.log('      - 如果关闭，返回400错误"提现功能已关闭"');

  // 7. 建议
  console.log('\n7. 建议:');
  console.log('   - 检查前端代码中的API调用路径');
  console.log('   - 确认是否调用的是 /api/withdraw/admin/submit');
  console.log('   - 如果是老版本前端，可能路径不同');

  await mongoose.disconnect();
})();
