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

async function main() {
  const token = await login();

  // 获取当前时间
  const now = new Date();
  const beijingNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStart = new Date(beijingNow);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartUTC = new Date(todayStart.getTime() - 8 * 60 * 60 * 1000);

  console.log('当前UTC时间:', now.toISOString());
  console.log('当前北京时间:', beijingNow.toISOString());
  console.log('今日开始时间(北京时间):', todayStart.toISOString());
  console.log('今日开始时间(UTC):', todayStartUTC.toISOString());

  // 通过API查询排行榜数据，同时获取数据库实际统计
  // 由于无法直接访问数据库，我们只能通过API对比
  const rankingData = await fetch('/api/ranking/today-ranking', token);
  const rankingList = rankingData.data.ranking;

  // 查询首页接口数据
  const usersData = await fetch('/api/admin/dashboard/users?range=today', token);
  const users = usersData.data || [];

  // 按employeeId汇总首页数据
  const empStats = {};
  users.forEach(u => {
    if (!empStats[u.employeeId]) {
      empStats[u.employeeId] = { watched: 0, earnings: 0, users: [] };
    }
    empStats[u.employeeId].watched += u.watched;
    empStats[u.employeeId].earnings += u.earnings;
    empStats[u.employeeId].users.push(u.userId);
  });

  console.log('\n=== 数据对比 ===');
  console.log('排行榜接口返回的记录数 vs 首页接口按employeeId汇总的记录数:\n');

  const compareIds = ['7703', '3769', '2222', '8899', '5555'];
  compareIds.forEach(eid => {
    const rankingItem = rankingList.find(r => r.employeeId === eid);
    const homeItem = empStats[eid];
    console.log(`Employee ${eid}:`);
    console.log(`  排行榜接口: count=${rankingItem?.count || 0}, earnings=${rankingItem?.earnings || 0}`);
    console.log(`  首页接口:   watched=${homeItem?.watched || 0}, earnings=${homeItem?.earnings?.toFixed(2) || 0}, users=${homeItem?.users?.length || 0}`);
    if (homeItem && rankingItem) {
      console.log(`  差异: count=${rankingItem.count} vs watched=${homeItem.watched}, ratio=${(rankingItem.count / homeItem.watched).toFixed(2)}x`);
    }
    console.log('');
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

main().catch(console.error);