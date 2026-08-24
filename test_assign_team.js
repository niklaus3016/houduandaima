const mongoose = require('mongoose');
require('./models/Admin');

async function main() {
  const MONGO = 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';
  await mongoose.connect(MONGO);
  
  console.log('=== 查找 cuiding ID ===');
  const cuiding = await mongoose.model('Admin').findOne({ username: 'cuiding' }).select('_id username teamName role').lean();
  console.log('cuiding:', JSON.stringify(cuiding));
  
  console.log('\n=== 查找 admin002 ===');
  const admin002 = await mongoose.model('Admin').findOne({ username: 'admin002' }).select('_id username role managedTeamIds').lean();
  console.log('admin002:', JSON.stringify(admin002));
  
  if (cuiding && admin002) {
    console.log('\n=== 测试分配团队 ===');
    const cuidingId = String(cuiding._id);
    console.log('cuiding._id:', cuidingId);
    
    console.log('\n--- 验证 ObjectId.isValid ---');
    console.log('isValid(cuidingId):', mongoose.Types.ObjectId.isValid(cuidingId));
    
    console.log('\n--- 测试 update (使用 new) ---');
    try {
      const updated = await mongoose.model('Admin').findByIdAndUpdate(
        admin002._id,
        { managedTeamIds: [new mongoose.Types.ObjectId(cuidingId)] },
        { new: true }
      ).lean();
      console.log('update success:', JSON.stringify(updated));
      
      console.log('\n--- 验证 managedTeamIds 是否正确 ---');
      const verify = await mongoose.model('Admin').findById(admin002._id).select('managedTeamIds').lean();
      console.log('managedTeamIds:', verify.managedTeamIds);
      console.log('managedTeamIds[0] === cuiding._id:', String(verify.managedTeamIds[0]) === cuidingId);
    } catch (e) {
      console.error('update error:', e.message);
      console.error('stack:', e.stack);
    }
  }
  
  await mongoose.disconnect();
}

main().catch(e => console.error(e));
