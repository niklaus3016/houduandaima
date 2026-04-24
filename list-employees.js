const mongoose = require('mongoose');
const Employee = require('./models/Employee');

mongoose.connect('mongodb://127.0.0.1:27017/lz');

Employee.find({ teamGroupId: '69cd2b3f4b7bff2403ab4c79' }).then(employees => {
  console.log('员工数量:', employees.length);
  console.log('员工号列表:');
  employees.forEach((e, i) => {
    console.log(`${i + 1}. ${e.employeeId}`);
  });
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
