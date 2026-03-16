const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://root:9yx7pAD9851A7W7Q@lzjzb-sjk-mongodb.ns-tlwyfho9.svc:27017';

const employeeSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true },
  name: { type: String, default: '' },
  realName: { type: String, default: '' },
  phone: { type: String, default: '' },
  area: { type: String, default: '' },
  region: { type: String, default: '' },
  status: { type: String, default: 'enabled' },
  parentId: { type: String, default: '' },
  role: { type: String, default: 'EMPLOYEE' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Employee = mongoose.model('Employee', employeeSchema);

async function createEmployee() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('MongoDB连接成功');

    // 检查是否已存在
    const existing = await Employee.findOne({ employeeId: '8202' });
    if (existing) {
      console.log('员工8202已存在:', existing);
      // 更新状态为启用
      existing.status = 'enabled';
      await existing.save();
      console.log('已更新状态为enabled');
    } else {
      // 创建新员工
      const newEmployee = new Employee({
        employeeId: '8202',
        name: '测试员工8202',
        realName: '测试员工8202',
        phone: '13800138002',
        area: '北京',
        region: '华北',
        status: 'enabled',
        role: 'EMPLOYEE'
      });
      await newEmployee.save();
      console.log('员工8202创建成功');
    }

    await mongoose.disconnect();
    console.log('完成');
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
}

createEmployee();
