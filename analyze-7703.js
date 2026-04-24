const http = require('http');

async function login() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'admin', password: 'admin123456' });
    const req = http.request({ hostname: '127.0.0.1', port: 3003, path: '/api/admin/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d).data.token));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function fetch(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: 3003, path, headers: { Authorization: `Bearer ${token}` } }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const token = await login();

  const usersData = await fetch('/api/admin/dashboard/users?range=today', token);
  const users = usersData.data || [];

  // 找到7703的员工信息和其下所有用户
  const emp7703Users = users.filter(u => u.employeeId === '7703');

  console.log('=== 7703员工下的所有用户 ===');
  console.log('员工ID: 7703, 姓名:', emp7703Users[0]?.name);
  console.log('下属用户数:', emp7703Users.length);

  let totalWatched = 0;
  let totalEarnings = 0;
  emp7703Users.forEach((u, i) => {
    console.log(`  用户${i+1}: userId=${u.userId}, watched=${u.watched}, earnings=${u.earnings.toFixed(2)}, ecpm=${u.ecpm}`);
    totalWatched += u.watched;
    totalEarnings += u.earnings;
  });

  console.log('\n汇总: watched=' + totalWatched + ', earnings=' + totalEarnings.toFixed(2));
  console.log('\n首页接口返回给前端的7703员工数据显示:');
  console.log('  watched:', emp7703Users[0]?.watched || 0);
  console.log('  earnings:', emp7703Users[0]?.earnings || 0);

  // 排行榜接口数据
  const rankingData = await fetch('/api/ranking/today-ranking', token);
  const r7703 = rankingData.data.ranking.find(r => r.employeeId === '7703');
  console.log('\n排行榜接口7703数据:');
  console.log('  count:', r7703?.count);
  console.log('  earnings:', r7703?.earnings);

  // 计算差异
  console.log('\n=== 差异分析 ===');
  console.log('首页接口7703员工watched:', emp7703Users[0]?.watched || 0);
  console.log('排行榜接口7703 count:', r7703?.count);
  console.log('差异倍数:', (r7703?.count / (emp7703Users[0]?.watched || 1)).toFixed(2) + 'x');

  // 查看排行榜3769的数据，对比首页接口
  const emp3769Users = users.filter(u => u.employeeId === '3769');
  let emp3769Total = { watched: 0, earnings: 0 };
  emp3769Users.forEach(u => {
    emp3769Total.watched += u.watched;
    emp3769Total.earnings += u.earnings;
  });

  const r3769 = rankingData.data.ranking.find(r => r.employeeId === '3769');
  console.log('\n=== 3769对比 ===');
  console.log('首页接口3769员工: watched=' + emp3769Total.watched + ', earnings=' + emp3769Total.earnings.toFixed(2));
  console.log('排行榜接口3769: count=' + r3769?.count + ', earnings=' + r3769?.earnings);
}

main().catch(console.error);