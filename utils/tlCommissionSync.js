const mongoose = require('mongoose');

async function syncTLCommission(tlAdminId) {
  const Admin = mongoose.model('Admin');

  const admin = await Admin.findById(tlAdminId).lean();
  if (!admin || admin.status !== 'enabled') return;
  if (admin.manualLevel) return; // 手动档不自动同步

  const { getTeamLeaderRealCommission } = require('./commissionRateCache');
  const realComm = await getTeamLeaderRealCommission(tlAdminId);
  const dbComm = +(admin.commission || 0);

  if (realComm > dbComm + 0.0001) {
    await Admin.updateOne(
      { _id: tlAdminId },
      { $set: { commission: realComm, updatedAt: new Date() } }
    );
    console.log(`[TL Sync] ${admin.username}: ${dbComm.toFixed(2)} → ${realComm.toFixed(2)} ✅`);
  }
}

module.exports = { syncTLCommission };
