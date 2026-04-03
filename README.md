# 🔄 WFM Studio Rotation Pro (v4.0.0)

A high-performance, real-time Workforce Management (WFM) dashboard designed for studio rotations, presenter management, and shuffler logistics.

![WFM Dashboard](public/download.png)

## 🚀 Overview
WFM Studio Rotation Pro provides a "glassmorphism" styled interface to manage complex shift rotations across multiple studios and buildings. It automates the 30-minute work/break cycles for presenters and shufflers, ensuring fair distribution and real-time status tracking.

## ✨ Core Features

### 🎙️ Presenter Management
- **Shift Logic**: Supports 3 shifts with full roster import via Excel (.xlsx).
- **Status Tracking**: Live updates for `Pending`, `Arrived`, and `Ready` states.
- **Auto-Rotation**: Calculates 16 intervals (30 min each) based on "fairness" logic.
- **Swap Requests**: Direct communication between Floor Screens and Admin for emergency exchange requests.
- **Sort Status**: Global tracking of studios requiring "Sort" operations.

### 🔀 Shuffler System (Independent)
- **Dedicated Admin**: Separate violet-themed management panel (`/shuffler-admin`).
- **30/30 Rule**: Automatic 30-min working / 30-min break cycle.
- **SLOTS Engine**: Manages exactly 3 shufflers per studio simultaneously.
- **Floor Screens**: Dedicated `SHFFS` screen for shuffler check-ins and live tracking.

### 📊 Visualization & UI
- **Live Dashboards**: Real-time sync (4s intervals) across all devices.
- **Matrix Views**: Detailed interval grids for both Presenters and Shufflers.
- **Glassmorphism Design**: High-end aesthetics with premium color palettes.
- **Responsive**: Mobile-friendly Floor Screens (FS/SHFFS).

## 🛠️ Tech Stack
- **Backend**: Node.js, Express.js
- **Database**: SQLite3 (Persistent state for rosters and shifts)
- **Frontend**: Vanilla HTML5, JavaScript (ES6+), CSS3 (Tailwind + Custom Glass filters)
- **Data Handling**: `xlsx` (Excel processing), `multer` (File uploads)

## 📦 Installation & Setup

1. **Clone & Install**:
   ```bash
   npm install
   ```

2. **Initialize Data** (Optional mock):
   ```bash
   node scripts/generate-shuffler-mock.js
   ```

3. **Start Server**:
   ```bash
   npm start
   ```
   The app will run at `http://localhost:4000`

## 🖥️ Page Index

| Path | Description |
|------|-------------|
| `/` | **Main Dashboard**: Public live rotation view for Presenters. |
| `/admin` | **Main Admin**: Roster uploads, publishing, and sort management. |
| `/fs` | **Floor Screen**: Presenter check-in and ready toggle. |
| `/shuffler-dashboard` | **Shuffler Dashboard**: Public view for shuffler rotation. |
| `/shuffler-admin` | **Shuffler Admin**: Rotation manager for shufflers. |
| `/shffs` | **Shuffler FS**: Floor screen for shuffler "Buradayım" signals. |

## 🧪 Development
- **Mocks**: Use `scripts/generate-shuffler-mock.js` to populate the shuffler system with 102 staff members across 17 studios.
- **API**: Check `server.js` for endpoints like `/api/state`, `/api/shf/state`, and `/api/notify-swap`.

---
*Built with ❤️ by Antigravity AI for WFM optimization.*
