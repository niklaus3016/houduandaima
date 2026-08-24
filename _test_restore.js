const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    const Admin = require('./models/Admin');
    const dashboard = require('./routes/dashboard');

    console.log('=== 恢复 $min 逻辑后重新计算 ===\n');

    const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
    console.log('Admin.commission:', admin.commission);
    
    // 重新计算
    console.log('开始计算 computeNewKpi...');
    const scope = { kind: 'TL', adminId: String(admin._id) };
    const kpi = await dashboard.computeNewKpi(scope, 'lastMonth');
    
    console.log('\n计算结果:');
    console.log('  teamCommission:', kpi.teamCommission);
    console.log('  directCommission:', kpi.directCommission);
    console.log('  indirectCommission:', kpi.indirectCommission);
    
    console.log('\n=== 对比用户截图 ===');
    console.log('用户截图中的正确数据: ¥5,643.75');
    console.log('当前计算结果:          ¥' + kpi.teamCommission);
    console.log('差异:                  ¥' + (kpi.teamCommission - 5643.75).toFixed(2));

    await mongoose.disconnect();
  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
