function getWeeksInMonth(year, month) {
  const weeks = [];
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  let currentDate = new Date(firstDay);
  while (currentDate <= lastDay) {
    const beijingDate = new Date(currentDate.getTime() + 8 * 60 * 60 * 1000);
    const beijingYear = beijingDate.getFullYear();
    const firstDayOfYear = new Date(beijingYear, 0, 1);
    const dayOfWeek = firstDayOfYear.getUTCDay() || 7;
    const daysToFirstMonday = (8 - dayOfWeek) % 7;
    const firstMonday = new Date(firstDayOfYear);
    firstMonday.setDate(firstMonday.getDate() + daysToFirstMonday);

    const diffTime = beijingDate - firstMonday;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekNumber = Math.floor(diffDays / 7) + 1;
    const week = `${beijingYear}-${weekNumber.toString().padStart(2, '0')}`;

    if (!weeks.includes(week)) {
      weeks.push(week);
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return weeks;
}

console.log('2026年4月的周:');
console.log(getWeeksInMonth(2026, 4));

console.log('\n2026年4月13日（周一）~ 4月19日（周日）: 第15周');
console.log('2026年4月20日（周一）~ 4月26日（周日）: 第16周');