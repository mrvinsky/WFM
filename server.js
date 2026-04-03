const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create data dir if not exists (for sqlite DB)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const db = new sqlite3.Database(path.join(dataDir, 'wfm.db'), (err) => {
    if (err) console.error("Database opening error: ", err);
});

db.serialize(() => {
    // Drop the old table to ensure clean schema
    db.run("DROP TABLE IF EXISTS state");
    db.run("CREATE TABLE state (shift_id INTEGER PRIMARY KEY, phase INTEGER, presenters TEXT, current_interval INTEGER, notifications TEXT DEFAULT '[]', sort_studios TEXT DEFAULT '[]')");
    // Initialize 3 shifts
    for (let s = 1; s <= 3; s++) {
        db.run("INSERT INTO state (shift_id, phase, presenters, current_interval, notifications, sort_studios) VALUES (?, 0, '[]', 0, '[]', '[]')", [s]);
    }
});

const upload = multer({ dest: 'uploads/' });

// API: Upload Excel and extract IDs
app.post('/api/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        let ids = [];
        for (let row of data) {
            for (let cell of row) {
                if (cell && String(cell).trim() !== '' && !String(cell).toUpperCase().includes('ID')) {
                    ids.push(String(cell).trim());
                }
            }
        }
        fs.unlinkSync(req.file.path);
        res.json({ success: true, ids: ids });
    } catch (err) { res.status(500).json({ error: 'Parse fail' }); }
});

// API: Get current state
app.get('/api/state', (req, res) => {
    const shift = req.query.shift || 1;
    db.get("SELECT phase, presenters, current_interval, notifications, sort_studios FROM state WHERE shift_id = ?", [shift], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'DB error' });
        res.json({
            shift,
            phase: row.phase,
            currentInterval: row.current_interval,
            presenters: JSON.parse(row.presenters),
            notifications: JSON.parse(row.notifications || '[]'),
            sortStudios: JSON.parse(row.sort_studios || '[]')
        });
    });
});

// API: Update State
app.post('/api/state', (req, res) => {
    const { phase, presenters, shift, currentInterval, notifications } = req.body;
    const targetShift = shift || 1;
    const stmt = db.prepare("UPDATE state SET phase = ?, presenters = ?, current_interval = ?, notifications = ? WHERE shift_id = ?");
    stmt.run([phase, JSON.stringify(presenters), currentInterval || 0, JSON.stringify(notifications || []), targetShift], (err) => {
        if (err) return res.status(500).json({ error: 'Update fail' });
        res.json({ success: true });
    });
});

// API: Signal "Extra Change"
app.post('/api/notify-swap', (req, res) => {
    const { shift, presenterId, studio } = req.body;
    db.get("SELECT notifications FROM state WHERE shift_id = ?", [shift], (err, row) => {
        if (!row) return res.status(404).send();
        let notes = JSON.parse(row.notifications || '[]');
        if (!notes.find(n => n.id === presenterId)) {
            notes.push({ id: presenterId, studio, time: new Date().toLocaleTimeString() });
        }
        db.run("UPDATE state SET notifications = ? WHERE shift_id = ?", [JSON.stringify(notes), shift], () => {
            res.json({ success: true });
        });
    });
});

// API: Execute Swap
app.post('/api/execute-swap', (req, res) => {
    const { shift, originalId, replacementId } = req.body;
    db.get("SELECT presenters, current_interval, notifications FROM state WHERE shift_id = ?", [shift], (err, row) => {
        if (!row) return res.status(404).send();
        let presenters = JSON.parse(row.presenters);
        let intIdx = row.current_interval;
        let notes = JSON.parse(row.notifications);
        let p1 = presenters.find(p => p.id === originalId);
        let p2 = presenters.find(p => p.id === replacementId);
        if (p1 && p2) {
            let temp = p1.schedule[intIdx];
            p1.schedule[intIdx] = p2.schedule[intIdx];
            p2.schedule[intIdx] = temp;
        }
        notes = notes.filter(n => n.id !== originalId);
        db.run("UPDATE state SET presenters = ?, notifications = ? WHERE shift_id = ?", [JSON.stringify(presenters), JSON.stringify(notes), shift], () => {
            res.json({ success: true });
        });
    });
});

// API: Reset shift
app.post('/api/reset', (req, res) => {
    const shift = req.body.shift || 1;
    db.run("UPDATE state SET phase = 0, presenters = '[]', current_interval = 0, notifications = '[]' WHERE shift_id = ?", [shift], (err) => {
        if (err) return res.status(500).json({ error: 'Reset fail' });
        res.json({ success: true });
    });
});
// API: Update Presenter Status
app.post('/api/update-status', (req, res) => {
    const { shift, id, status } = req.body;
    db.get("SELECT presenters FROM state WHERE shift_id = ?", [shift || 1], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'DB error' });
        let presenters = JSON.parse(row.presenters);
        let p = presenters.find(pr => pr.id === id);
        if (p) {
            p.status = status;
            db.run("UPDATE state SET presenters = ? WHERE shift_id = ?", [JSON.stringify(presenters), shift || 1], (updateErr) => {
                if (updateErr) return res.status(500).json({ error: 'Update fail' });
                res.json({ success: true });
            });
        } else {
            res.status(404).json({ error: 'Presenter not found' });
        }
    });
});
// API: FS requests sort for a studio
app.post('/api/sort-studio', (req, res) => {
    const { shift, studio } = req.body;
    db.get("SELECT sort_studios FROM state WHERE shift_id = ?", [shift || 1], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'DB error' });
        let sorts = JSON.parse(row.sort_studios || '[]');
        if (!sorts.includes(studio)) {
            sorts.push(studio);
        }
        db.run("UPDATE state SET sort_studios = ? WHERE shift_id = ?", [JSON.stringify(sorts), shift || 1], () => {
            res.json({ success: true, sortStudios: sorts });
        });
    });
});

// API: FS marks sort done for a studio
app.post('/api/sort-done', (req, res) => {
    const { shift, studio } = req.body;
    db.get("SELECT sort_studios FROM state WHERE shift_id = ?", [shift || 1], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'DB error' });
        let sorts = JSON.parse(row.sort_studios || '[]');
        sorts = sorts.filter(s => s !== studio);
        db.run("UPDATE state SET sort_studios = ? WHERE shift_id = ?", [JSON.stringify(sorts), shift || 1], () => {
            res.json({ success: true, sortStudios: sorts });
        });
    });
});

// ─────────────────────────────────────────────
//  SHUFFLER SYSTEM
// ─────────────────────────────────────────────
db.serialize(() => {
    db.run("DROP TABLE IF EXISTS shuffler_state");
    db.run("CREATE TABLE shuffler_state (shift_id INTEGER PRIMARY KEY, phase INTEGER DEFAULT 0, shufflers TEXT DEFAULT '[]', current_interval INTEGER DEFAULT 0)");
    for (let s = 1; s <= 3; s++) {
        db.run("INSERT INTO shuffler_state (shift_id, phase, shufflers, current_interval) VALUES (?, 0, '[]', 0)", [s]);
    }
});

// API: Upload Excel for Shuffler (raw IDs)
app.post('/api/shf/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
        const workbook = xlsx.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        let ids = [];
        for (let row of data) {
            for (let cell of row) {
                const v = String(cell || '').trim();
                if (v && !v.toUpperCase().includes('ID')) ids.push(v);
            }
        }
        fs.unlinkSync(req.file.path);
        res.json({ success: true, ids });
    } catch (err) { res.status(500).json({ error: 'Parse fail' }); }
});

// API: Get shuffler state
app.get('/api/shf/state', (req, res) => {
    const shift = req.query.shift || 1;
    db.get("SELECT phase, shufflers, current_interval FROM shuffler_state WHERE shift_id = ?", [shift], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'DB error' });
        res.json({
            shift,
            phase: row.phase,
            currentInterval: row.current_interval,
            shufflers: JSON.parse(row.shufflers)
        });
    });
});

// API: Save shuffler state
app.post('/api/shf/state', (req, res) => {
    const { phase, shufflers, shift, currentInterval } = req.body;
    const s = shift || 1;
    db.run("UPDATE shuffler_state SET phase = ?, shufflers = ?, current_interval = ? WHERE shift_id = ?",
        [phase, JSON.stringify(shufflers), currentInterval || 0, s], (err) => {
            if (err) return res.status(500).json({ error: 'Update fail' });
            res.json({ success: true });
        });
});

// API: Update shuffler status (arrived / active)
app.post('/api/shf/update-status', (req, res) => {
    const { shift, id, status } = req.body;
    db.get("SELECT shufflers FROM shuffler_state WHERE shift_id = ?", [shift || 1], (err, row) => {
        if (err || !row) return res.status(500).json({ error: 'DB error' });
        let shufflers = JSON.parse(row.shufflers);
        let p = shufflers.find(x => x.id === id);
        if (p) {
            p.status = status;
            db.run("UPDATE shuffler_state SET shufflers = ? WHERE shift_id = ?", [JSON.stringify(shufflers), shift || 1], (ue) => {
                if (ue) return res.status(500).json({ error: 'Update fail' });
                res.json({ success: true });
            });
        } else {
            res.status(404).json({ error: 'Shuffler not found' });
        }
    });
});

// API: Reset shuffler shift
app.post('/api/shf/reset', (req, res) => {
    const shift = req.body.shift || 1;
    db.run("UPDATE shuffler_state SET phase = 0, shufflers = '[]', current_interval = 0 WHERE shift_id = ?", [shift], (err) => {
        if (err) return res.status(500).json({ error: 'Reset fail' });
        res.json({ success: true });
    });
});

// Fallback for SPA or separate html
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('/shuffler-admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'shuffler-admin.html'));
});
app.get('/shffs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'shffs.html'));
});
app.get('/shuffler-dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'shuffler-dashboard.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`WFM Backend running on port ${PORT}`);
});
