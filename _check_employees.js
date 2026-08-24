const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017/test?authSource=admin&replicaSet=lzjzb-sjk-mongodb';

(async () => {
  await mongoose.connect(MONGODB_URI);
  const Admin = require('./models/Admin');
  const Employee = require('./models/Employee');
  const TeamGroup = require('./models/TeamGroup');
  const dashboard = require('./routes/dashboard');

  console.log('=== 获取 huangzhenhui 的所有员工 ===\n');

  const admin = await Admin.findOne({ username: 'huangzhenhui' }).lean();
  const tlId = String(admin._id);
  console.log('TL ID:', tlId);
  
  // 获取直推 D 员工
  const directDIds = await dashboard._getTLDirectDIds(tlId);
  console.log('\n直推 D 员工数:', directDIds.length);
  
  // 获取下属组长 G 员工
  const subGIds = await dashboard._getTLSubGroupGIds(tlId);
  console.log('下属 G 员工数:', subGIds.length);
  
  // 获取下属 TL 列表
  const subTls = await Admin.find({ parentTlId: tlId, role: /NORMAL_ADMIN|normal_admin/i }).lean();
  console.log('\n下属 TL:');
  for (const st of subTls) {
    console.log(`  ${st.username}, commission=${st.commission}`);
  }
  
  // 获取下属 TL 的 D 员工
  let subTlDIdsAll = [];
  for (const st of subTls) {
    const subDIds = await dashboard._getTLDirectDIds(String(st._id));
    console.log(`  ${st.username} D 员工数: ${subDIds.length}`);
    subTlDIdsAll = [...subTlDIdsAll, ...subDIds];
  }
  console.log('\n下属 TL D 员工总数:', subTlDIdsAll.length);
  
  // 汇总
  console.log('\n=== 汇总 ===');
  console.log('直推 D 员工:', directDIds.length);
  console.log('间推 G 员工:', subGIds.length);
  console.log('间推 TL D 员工:', subTlDIdsAll.length);
  console.log('员工总数:', directDIds.length + subGIds.length + subTlDIdsAll.length);

  await mongoose.disconnect();
})();
