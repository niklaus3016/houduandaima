const axios = require('axios');

const API_BASE_URL = 'http://127.0.0.1:3003/api';

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
  console.log('=== 测试 API 返回时间戳 ===\n');

  const token = await login('cuiding', '66668888');
  if (!token) {
    console.log('登录失败');
    return;
  }

  try {
    // 获取原始响应，包含时间戳用于调试
    const response = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today' },
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('响应时间:', new Date().toISOString());
    console.log('cached:', response.data.cached);
    console.log('data.kpi 时间戳: 无');

    // 检查 groups 数据中的时间范围
    const groups = response.data.data.groups;
    console.log('\ngroups 数据:');
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      console.log(`组 ${i + 1}: ${g.name}`);
      console.log(`  memberCount: ${g.memberCount}`);
      console.log(`  todayRevenue: ${g.todayRevenue}`);
      console.log(`  monthlyRevenue: ${g.monthlyRevenue}`);
    }

    // 调用不同的 range 来看区别
    console.log('\n\n=== 强制刷新测试 (使用 cache-bust) ===');
    const freshResponse = await axios.get(`${API_BASE_URL}/admin/dashboard/team-leader`, {
      params: { range: 'today', _t: Date.now() },
      headers: { Authorization: `Bearer ${token}` }
    });

    const freshGroups = freshResponse.data.data.groups;
    console.log('\n强制刷新的 groups 数据:');
    for (let i = 0; i < freshGroups.length; i++) {
      const g = freshGroups[i];
      console.log(`组 ${i + 1}: ${g.name}`);
      console.log(`  memberCount: ${g.memberCount}`);
      console.log(`  todayRevenue: ${g.todayRevenue}`);
      console.log(`  monthlyRevenue: ${g.monthlyRevenue}`);
    }

  } catch (error) {
    console.error('请求失败:', error.response?.data || error.message);
  }
}

runTests();
