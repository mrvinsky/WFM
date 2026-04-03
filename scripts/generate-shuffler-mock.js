/**
 * generate-shuffler-mock.js
 * Generates mock shuffler data:
 *   - 17 studios × 6 people = 102 shufflers
 *   - Creates shuffler_mock.xlsx in /public for import
 *   - Also directly injects into all 3 shifts via API
 */

const xlsx = require('xlsx');
const path = require('path');
const http = require('http');

const STUDIO_ORDER = ['7','10','3&4','8','9'];
['RS','SR'].forEach(lang => {
    for (let i = 1; i <= 6; i++) STUDIO_ORDER.push(`${lang}${i}`);
});

const PER_STUDIO = 6; // 3 work + 3 break → strict 30/30 rotation
const INTERVALS = 16;
const SLOTS = 3;

const STUDIOS_META = {};
STUDIO_ORDER.forEach((sid, i) => {
    const isRS = sid.startsWith('RS');
    const isRSorSR = sid.startsWith('RS') || sid.startsWith('SR');
    let bldg = 'A2';
    if (['8','9'].includes(sid)) bldg = 'E1';
    if (isRSorSR) {
        const num = parseInt(sid.slice(2));
        bldg = num <= 3 ? 'A2' : 'E1';
    }
    STUDIOS_META[sid] = { b: bldg };
});

// ── Generate IDs ───────────────────────────────────────────────────────────
const allIds = [];
let counter = 1;
STUDIO_ORDER.forEach(sid => {
    for (let i = 0; i < PER_STUDIO; i++) {
        allIds.push(`SHF${String(counter++).padStart(3,'0')}`);
    }
});

console.log(`✅ Generated ${allIds.length} shuffler IDs (${STUDIO_ORDER.length} studios × ${PER_STUDIO} each)\n`);

// ── Create XLSX ─────────────────────────────────────────────────────────────
const ws_data = [['ID'], ...allIds.map(id => [id])];
const ws = xlsx.utils.aoa_to_sheet(ws_data);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'Shufflers');
const outPath = path.join(__dirname, '..', 'public', 'shuffler_mock.xlsx');
xlsx.writeFile(wb, outPath);
console.log(`📄 XLSX saved: public/shuffler_mock.xlsx\n`);

// ── Build shuffler objects with schedules ────────────────────────────────────
function buildSchedule(studioIdx) {
    // Each person in the studio has a fixed group (A or B or C for 3-slot rotation)
    // Group 0,1,2 → work INT 0,2,4... (even)  |  group 3,4,5 → work INT 1,3,5... (odd)
    return null; // schedules calculated on release by admin
}

function buildShufflers() {
    const list = [];
    let counter = 1;
    STUDIO_ORDER.forEach(sid => {
        for (let i = 0; i < PER_STUDIO; i++) {
            list.push({
                id: `SHF${String(counter++).padStart(3,'0')}`,
                studio: sid,
                building: STUDIOS_META[sid].b,
                schedule: new Array(INTERVALS).fill(''),
                status: 'pending'
            });
        }
    });
    return list;
}

// ── Calculate schedule (same logic as shuffler-admin.html) ─────────────────
function calculateInterval(shufflers, idx) {
    STUDIO_ORDER.forEach(sid => {
        const active = shufflers.filter(p => p.studio === sid && p.status === 'active');
        
        let eligible = active.filter(p => {
            if (idx === 0) return true;
            return p.schedule[idx - 1] === '/';
        });

        // Fairness sort
        eligible.sort((a, b) => {
            const wa = a.schedule.slice(0,idx).filter(v => v !== '' && v !== '/').length;
            const wb = b.schedule.slice(0,idx).filter(v => v !== '' && v !== '/').length;
            if (wa !== wb) return wa - wb;
            let la=-1, lb=-1;
            for (let x=idx-1;x>=0;x--) { if(a.schedule[x]!==''&&a.schedule[x]!=='/'){la=x;break;} }
            for (let x=idx-1;x>=0;x--) { if(b.schedule[x]!==''&&b.schedule[x]!=='/'){lb=x;break;} }
            return la - lb;
        });

        const workers = new Set(eligible.slice(0, SLOTS).map(p => p.id));
        active.forEach(p => {
            p.schedule[idx] = workers.has(p.id) ? sid : '/';
        });
    });
}

// ── Inject into all 3 shifts ─────────────────────────────────────────────────
function postJSON(path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const options = {
            hostname: 'localhost',
            port: 4000,
            path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        const req = http.request(options, res => {
            let out = '';
            res.on('data', d => out += d);
            res.on('end', () => resolve(JSON.parse(out)));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function injectShift(shiftId) {
    const shufflers = buildShufflers();
    // Set all to active for mock
    shufflers.forEach(p => p.status = 'active');

    // Calculate all 16 intervals
    for (let i = 0; i < INTERVALS; i++) {
        calculateInterval(shufflers, i);
    }

    const result = await postJSON('/api/shf/state', {
        shift: shiftId,
        phase: 2,
        shufflers,
        currentInterval: 0
    });
    
    if (result.success) {
        const workingInt0 = shufflers.filter(p => p.schedule[0] !== '/').length;
        const breakInt0   = shufflers.filter(p => p.schedule[0] === '/').length;
        console.log(`✅ Shift ${shiftId} injected → Phase 2 | INT 1: ${workingInt0} working, ${breakInt0} on break`);
    } else {
        console.log(`❌ Shift ${shiftId} failed:`, result);
    }
}

(async () => {
    console.log('🚀 Injecting mock data into all 3 shifts...\n');
    try {
        await injectShift(1);
        await injectShift(2);
        await injectShift(3);
        console.log('\n🎉 Done! Open http://localhost:4000/shffs to see the result.');
        console.log('   Import file available at: http://localhost:4000/shuffler_mock.xlsx\n');
    } catch(e) {
        console.error('❌ Could not reach server:', e.message);
        console.log('   Make sure the server is running on port 4000.');
    }
})();
