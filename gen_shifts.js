const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

function generateRoster(shiftNum) {
    const data = [['Presenter ID', 'Name', 'Role']];
    // Generate 150 TR, 150 RS, 150 SR = 450 total
    const tr = Array.from({length: 150}, (_, i) => `${shiftNum}0${101 + i}_TR`);
    const rs = Array.from({length: 150}, (_, i) => `${shiftNum}0${251 + i}_RS`);
    const sr = Array.from({length: 150}, (_, i) => `${shiftNum}0${401 + i}_SR`);

    [...tr, ...rs, ...sr].forEach(id => {
        data.push([id, `Presenter ${id}`, 'Game Presenter']);
    });

    const wb = xlsx.utils.book_new();
    const ws = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(wb, ws, 'Roster');
    xlsx.writeFile(wb, path.join(uploadDir, `Shift${shiftNum}_Roster.xlsx`));
    console.log(`Generated Shift${shiftNum}_Roster.xlsx with 450 IDs`);
}

for (let i = 1; i <= 3; i++) {
    generateRoster(i);
}
