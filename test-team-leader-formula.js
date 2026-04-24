const axios = require('axios');

const API_BASE_URL = 'https://wfqmaepvjkdd.sealoshzh.site/api';

async function login(username, password) {
  try {
    const response = await axios.post(`${API_BASE_URL}/admin/login`, {
      username,
      password
    });
    return response.data.data.token;
  } catch (error) {
    console.error(`登录失败:`, error.response?.data || error.message);
    return null;
  }
}

async function runTests() {
  console.log('=== cuidang 团队长数据看板 - 全量测试 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  const ranges = ['today', 'yesterday', 'week', 'month'];
  const rangeNames = { today: '今日', yesterday: '昨日', week: '本周', month: '本月' };

  for (const range of ranges) {
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: range },
      headers: { Authorization: `Bearer ${token}` }
    });

    const { kpi, groups } = response.data.data;

    console.log(`\n========== ${rangeNames[range]} ==========`);
    console.log('-------------------------------------------');
    console.log(`revenue (团队用户收益)           : ${kpi.revenue}`);
    console.log(`coins (金币总数)                : ${kpi.coins}`);
    console.log(`impressions (广告曝光)          : ${kpi.impressions}`);
    console.log(`ecpm (单条平均ecpm)             : ${kpi.ecpm}`);
    console.log(`avgGoldPerAd (单条平均金币)      : ${kpi.avgGoldPerAd}`);
    console.log(`activeUsers (活跃用户)          : ${kpi.activeUsers}`);
    console.log(`teamLeadCommission (团队提成)   : ${kpi.teamLeadCommission}`);
    console.log(`groupLeadersCommission (组长收益): ${kpi.groupLeadersCommission}`);
    console.log(`teamUserRevenue (用户收益)       : ${kpi.teamUserRevenue}`);

    console.log('\nGroups:');
    for (const g of groups) {
      const groupCommissionSum = g.todayGoldRevenue * g.commission;
      console.log(`  ${g.name}: 收益=${g.todayGoldRevenue}, 提成=${g.todayRevenue} (${g.commission*100}%)`);
    }
  }

  console.log('\n\n【验证公式】');
  console.log('团队提成收益 = 团队用户收益 × 20% - 团队组长收益');
}

runTests();
