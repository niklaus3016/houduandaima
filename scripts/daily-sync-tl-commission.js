const mongoose = require('mongoose');
require('../models/Admin');
require('../models/Employee');
require('../models/GoldLog');
require('../models/TeamGroup');
const { getTeamLeaderRealCommission } = require('../utils/commissionRateCache');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

async function syncAllTLCommission() {
  await mongoose.connect(MONGODB_URI + '?authSource=admin&replicaSet=lzjzb-sjk-mongodb');
  const Admin = mongoose.model('Admin');
  const TeamGroup = mongoose.model('TeamGroup');

  console.log(`[${new Date().toISOString()}] 开始同步所有 TL 提成率...`);

  const tlAdmins = await Admin.find({ role: 'NORMAL_ADMIN', status: 'enabled' }).lean();
  console.log(`找到 ${tlAdmins.length} 个 TL`);

  const results = { updated: 0, skipped: 0, error: 0 };

  for (const admin of tlAdmins) {
    try {
      if (admin.manualLevel) {
        console.log(`  ${admin.username}: 手动档，跳过`);
        results.skipped++;
        continue;
      }

      const realComm = await getTeamLeaderRealCommission(admin._id.toString());
      const dbComm = +(admin.commission || 0);

      if (realComm > dbComm + 0.0001) {
        await Admin.updateOne(
          { _id: admin._id },
          { $set: { commission: realComm, updatedAt: new Date() } }
        );
        console.log(`  ${admin.username}: ${dbComm.toFixed(2)} → ${realComm.toFixed(2)} ✅ 已升级`);
        results.updated++;
      } else {
        console.log(`  ${admin.username}: ${dbComm.toFixed(2)} (无需更新)`);
        results.skipped++;
      }
    } catch (e) {
      console.log(`  ${admin.username}: 出错 ${e.message}`);
      results.error++;
    }
  }

  console.log(`\n[完成] 更新: ${results.updated}, 跳过: ${results.skipped}, 错误: ${results.error}`);
  await mongoose.connection.close();
  process.exit(0);
}

syncAllTLCommission().catch(e => {
  console.error(e.message);
  process.exit(1);
});
