const { MongoClient } = require('mongodb');

const uri = 'mongodb://127.0.0.1:27017/lz';

async function main() {
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('已连接数据库');
    
    const db = client.db('lz');
    
    // 查一下"洁然如初代理"组
    const group = await db.collection('teamgroups').findOne({ groupName: '洁然如初代理' });
    console.log('组ID:', group._id.toString());
    console.log('团队长ID:', group.teamLeaderId);
    
    // 查属于这个组的员工
    const employees = await db.collection('employees').find({ teamGroupId: group._id.toString() }).toArray();
    console.log('\n员工数量:', employees.length);
    console.log('员工号列表:');
    employees.forEach((e, i) => {
      console.log(`${i + 1}. ${e.employeeId}`);
    });
    
    // 查parentId等于团队长的员工
    const parentEmployees = await db.collection('employees').find({ parentId: group.teamLeaderId }).toArray();
    console.log('\nparentId等于团队长的员工数量:', parentEmployees.length);
    parentEmployees.forEach((e, i) => {
      console.log(`${i + 1}. ${e.employeeId}`);
    });
    
  } finally {
    await client.close();
  }
}

main().catch(console.error);
