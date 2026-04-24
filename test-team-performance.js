const https = require('https');

async function login() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'admin', password: 'admin123456' });
    const options = {
      hostname: 'wfqmaepvjkdd.sealoshzh.site',
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const result = JSON.parse(d);
        if (result.success) {
          resolve(result.data.token);
        } else {
          reject(new Error('登录失败'));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function fetchTeamPerformance(range, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'wfqmaepvjkdd.sealoshzh.site',
      path: `/api/admin/team-performance?range=${range}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const result = JSON.parse(d);
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  try {
    console.log('=== 登录获取token ===');
    const token = await login();
    console.log('登录成功，获取到token');

    console.log('\n=== 测试今日团队业绩 ===');
    const todayData = await fetchTeamPerformance('today', token);
    console.log('今日团队业绩:', JSON.stringify(todayData, null, 2));

    console.log('\n=== 测试本月团队业绩 ===');
    const monthData = await fetchTeamPerformance('month', token);
    console.log('本月团队业绩:', JSON.stringify(monthData, null, 2));
  } catch (error) {
    console.error('测试失败:', error);
  }
}

main();