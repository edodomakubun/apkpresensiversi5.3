// --- KONFIGURASI APLIKASI ---
const CONFIG = {
    // Pastikan URL ini sesuai dengan Deployment Terbaru Code.gs Anda
    API_URL: 'https://script.google.com/macros/s/AKfycbwY1Fx6N8JKF6UBYwBji1MfKDNGyFFGqAdWbP9DDtZnukS5jSDTBcCc_A69ipLDgTx0/exec',
};

// --- KONFIGURASI LOKASI (UNTUK VISUAL DI HP) ---
const VISUAL_CONFIG = { LAT: -7.14872, LNG: 131.70819, RADIUS: 20 };

// --- STATE & UI MANAGEMENT ---
const appState = { currentUser: null, deviceId: null, isLeaveActive: false };
const ui = {};
let html5QrCode;
let autoSyncInterval = null;
let locationWatchId = null;
let dashboardInterval = null;
let rejectionTimer = null;

// --- INITIALIZATION ---
function initializeApp() {
    initializeUIReferences();
    setAppHeight();
    setupEventListeners();
    
    // Hapus Splash Screen setelah 3.599 detik
    setTimeout(() => {
        const splash = document.getElementById('customSplashScreen');
        if (splash) {
            splash.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => { splash.remove(); }, 700);
        }
    }, 3599); 

    document.addEventListener("deviceready", function() {
        if (window.device && window.device.uuid) appState.deviceId = window.device.uuid;
        else appState.deviceId = "BROWSER_TEST_" + Math.floor(Math.random() * 10000);
        
        if (navigator.splashscreen) navigator.splashscreen.hide();
        checkUserSession();
    }, false);
}

function initializeUIReferences() {
    const ids = [ 
        'loginPage', 'mainApp', 'loginForm', 'loginId', 'loginPin', 'loginBtn', 
        'loginSpinner', 'loginError', 'loginErrorText', 'loginSuccessView', 'loggedInUserName', 
        'loadingDataView', 'loadingStatusText', 'smartDashboard', 
        'historyContent', 'historyLoading', 'historyError', 
        'welcomeGreeting', 'welcomeUserName', 
        'scanModal', 'scanResult', 'closeScanModalBtn', 
        'myDataModal', 'myDataContent', 'myDataLoading', 'myDataError', 'closeMyDataModalBtn', 
        'myDataBtn', 'logoutBtn', 'syncBtn', 'syncIcon', 'syncSpinner', 'toast', 'toastMessage', 
        'profileName', 'profileEmail', 'profileInitials', 'profileImage', 'togglePinBtn', 'eyeIcon', 'eyeSlashIcon',
        'helpBtn', 'helpModal', 'closeHelpModalBtn', 'contactWhatsAppBtn','bacapanduanbtn',
        'izinBtn', 'izinModal', 'closeIzinModalBtn', 'izinForm', 'izinType', 'izinReason', 'submitIzinBtn',
        'statsMonthName', 'statHadir', 'statTelat', 'statIzin',
        'dailyList', 'submissionSection', 'submissionList', 'testNotifBtn'
    ];
    ids.forEach(id => ui[id] = document.getElementById(id));
}

function setupEventListeners() {
    ui.loginForm?.addEventListener('submit', handleLogin);
    ui.logoutBtn?.addEventListener('click', () => {
        if (confirm("KONFIRMASI KELUAR\n\nApakah Anda yakin ingin keluar akun?")) handleLogout();
    });
    ui.syncBtn?.addEventListener('click', handleSync);
    ui.closeScanModalBtn?.addEventListener('click', stopScanner);
    
    ui.togglePinBtn?.addEventListener('click', () => {
        const type = ui.loginPin.type === 'password' ? 'text' : 'password';
        ui.loginPin.type = type;
        ui.eyeIcon.classList.toggle('hidden');
        ui.eyeSlashIcon.classList.toggle('hidden');
    });

    ui.myDataBtn?.addEventListener('click', showMyDataModal);
    ui.closeMyDataModalBtn?.addEventListener('click', () => hideModal('myDataModal'));
    ui.helpBtn?.addEventListener('click', () => showModal('helpModal'));
    ui.closeHelpModalBtn?.addEventListener('click', () => hideModal('helpModal'));
    ui.contactWhatsAppBtn?.addEventListener('click', () => window.open(`https://wa.me/6282238128216`, '_blank'));
    ui.bacapanduanbtn?.addEventListener('click', () => window.open(`https://www.sdinpreslelingluan.com/p/panduan-penggunaan-presensisaya.html`,'_blank'));

    ui.izinBtn?.addEventListener('click', () => {
        if (appState.isLeaveActive) {
            alert("AKSES DITUTUP\n\nAnda sedang dalam masa izin. Menu ini nonaktif.");
            return;
        }
        showModal('izinModal');
    });
    
    ui.closeIzinModalBtn?.addEventListener('click', () => hideModal('izinModal'));
    ui.izinForm?.addEventListener('submit', handleIzinSubmit);

    // Listener Tab (Klik)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Listener Swipe
    setupSwipeNavigation();
}

// --- FUNGSI GANTI TAB (DENGAN LIVE UPDATE) ---
function switchTab(tab) {
    // 1. Sembunyikan semua konten tab & Hapus animasi lama
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('tab-animate');
    });

    // 2. Tampilkan tab target
    const target = document.getElementById(tab);
    if (target) {
        target.classList.remove('hidden');
        requestAnimationFrame(() => {
            target.classList.add('tab-animate');
        });
    }

    // 3. Update status tombol navigasi
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active', 'text-blue-600'));
    const activeBtn = document.querySelector(`[data-tab="${tab}"]`);
    if(activeBtn) activeBtn.classList.add('active', 'text-blue-600');
    
    // 4. LOGIKA KHUSUS TIAP TAB
    if(tab === 'homeTab') {
        updateSmartDashboard(); // Tampilkan data cache dulu biar cepat
        startLiveDashboard();   // <--- NYALAKAN AUTO-REFRESH
    } else {
        stopLiveDashboard();    // <--- MATIKAN KALAU PINDAH TAB (Hemat Baterai & Kuota)
    }

    if(tab === 'historyTab') {
        loadAttendanceHistory(true); 
    }
}

// --- FITUR NAVIGASI SWIPE ---
function setupSwipeNavigation() {
    let touchStartX = 0; let touchStartY = 0; let touchEndX = 0; let touchEndY = 0;
    const tabs = ['homeTab', 'historyTab', 'profileTab'];
    const touchArea = document.getElementById('mainApp');
    
    if (!touchArea) return;

    touchArea.addEventListener('touchstart', function(e) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
    }, {passive: true});

    touchArea.addEventListener('touchend', function(e) {
        touchEndX = e.changedTouches[0].screenX;
        touchEndY = e.changedTouches[0].screenY;
        handleGesture();
    }, {passive: true});

    function handleGesture() {
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
            const currentTabBtn = document.querySelector('.tab-btn.active');
            if(!currentTabBtn) return;
            const currentTabId = currentTabBtn.dataset.tab;
            const currentIndex = tabs.indexOf(currentTabId);
            if (diffX < 0) { if (currentIndex < tabs.length - 1) switchTab(tabs[currentIndex + 1]); } 
            else { if (currentIndex > 0) switchTab(tabs[currentIndex - 1]); }
        }
    }
}

// --- LOGIKA DASHBOARD (PERBAIKAN LOGIKA TIMER) ---
async function updateSmartDashboard() {
    if (!appState.currentUser) return;
    if (locationWatchId) { navigator.geolocation.clearWatch(locationWatchId); locationWatchId = null; }

    const firstName = appState.currentUser.nama.split(' ')[0] || 'Guru';
    ui.welcomeGreeting.innerHTML = `<span class="text-slate-500 font-medium text-sm">Halo, Guru Hebat!</span>`;
    ui.welcomeUserName.innerHTML = `<span class="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">${firstName} 👋</span>`;
    
    const dateOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const dateStr = new Date().toLocaleDateString('id-ID', dateOptions);

    const fullHistory = await AppStorage.loadCache('history') || [];
    const todayISOLocal = new Date().toLocaleDateString('en-CA'); 
    
    const todaysRecords = fullHistory.filter(r => {
        const recordDate = r.isoTimestamp.substring(0, 10);
        const isActiveLeave = r.keterangan.includes('DISETUJUI') && r.keterangan.includes('|');
        return recordDate === todayISOLocal || isActiveLeave;
    });

    const hasClockedIn = todaysRecords.some(r => r.keterangan.includes('Masuk') || r.keterangan.includes('Terlambat'));
    const hasClockedOut = todaysRecords.some(r => r.keterangan.includes('Pulang'));

    const pengajuanRecord = todaysRecords.find(r => {
        const k = r.keterangan;
        if (!k.includes('PENGAJUAN')) return false; 
        if (k.includes('DISETUJUI')) { return k.includes('|'); } 
        return true; 
    });

    let dashboardHTML = `<div class="mb-4 bg-white/50 backdrop-blur-sm py-2 px-4 rounded-full border border-slate-100 inline-block shadow-sm"><p class="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2"><svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>${dateStr}</p></div>`;

    dashboardHTML += `<div id="locationWidget" class="w-full max-w-sm bg-white border border-slate-100 rounded-2xl p-3 mb-4 shadow-sm flex items-center justify-between"><div class="flex items-center gap-3"><div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center animate-pulse text-slate-400"><svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg></div><div><p class="text-xs font-bold text-slate-400 uppercase tracking-wide">Status Lokasi</p><p class="text-sm font-bold text-slate-600" id="locStatusText">Mencari Sinyal...</p></div></div><div class="text-right"><p class="text-xs text-slate-400">Jarak</p><p class="text-lg font-bold text-slate-800" id="locDistanceText">-- m</p></div></div>`;

    appState.isLeaveActive = false;
    updateIzinButtonState(false); 

    // --- PERBAIKAN: Jangan reset timer di sini, biarkan logika di bawah yang mengatur ---

    if (pengajuanRecord) {
        const rawText = pengajuanRecord.keterangan; 
        let status = "MENUNGGU";
        if (rawText.includes('[DISETUJUI]')) status = "DISETUJUI";
        else if (rawText.includes('[DITOLAK]')) status = "DITOLAK";
        
        let tipe = "IZIN";
        if (rawText.includes('SAKIT')) tipe = "SAKIT";
        else if (rawText.includes('CUTI')) tipe = "CUTI";

        if (status === "MENUNGGU") {
            dashboardHTML += `<div class="w-full max-w-sm p-6 bg-yellow-50 border border-yellow-200 rounded-3xl text-center shadow-sm animate-fadeInUp"><div class="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse"><svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><h2 class="text-xl font-bold text-yellow-800">Menunggu Persetujuan</h2><p class="text-yellow-700 text-sm mt-2">Pengajuan <b>${tipe}</b> sedang diperiksa.</p><div class="mt-4 text-xs font-mono text-yellow-600 bg-yellow-100 py-1 px-3 rounded-full inline-block">Status: PENDING</div></div>`;
            appState.isLeaveActive = true; updateIzinButtonState(true);

        } else if (status === "DISETUJUI") {
            let tglBerakhir = "Hari Ini"; if (rawText.includes('|')) tglBerakhir = rawText.split('|')[1].trim();
            dashboardHTML += `<div class="w-full max-w-sm p-6 bg-green-50 border border-green-200 rounded-3xl text-center shadow-sm animate-fadeInUp"><div class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4"><svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg></div><h2 class="text-xl font-bold text-green-800">Izin Disetujui</h2><p class="text-green-700 text-sm mt-2">Anda dalam masa <b>${tipe}</b>.</p><div class="mt-4 bg-white/60 p-3 rounded-xl border border-green-100"><p class="text-xs text-green-600 uppercase tracking-wider font-bold">Berakhir Pada</p><p class="text-lg font-bold text-green-800 mt-1">${tglBerakhir}</p></div></div>`;
            appState.isLeaveActive = true; updateIzinButtonState(true);

        } else if (status === "DITOLAK") {
            // --- LOGIKA FIX: AUTO DISMISS ---
            const rejectionKey = 'dismissed_' + pengajuanRecord.isoTimestamp;
            const isDismissed = localStorage.getItem(rejectionKey);

            if (!isDismissed) {
                // 1. MATIKAN AUTO-REFRESH agar tidak me-reset Timer & Animasi
                stopLiveDashboard(); 

                // 2. Tampilkan Card Merah
                dashboardHTML += `<div class="w-full max-w-sm p-4 bg-red-50 border border-red-200 rounded-2xl text-center mb-6 flex flex-col items-center gap-2 animate-fadeInUp"><div class="flex items-center gap-3"><div class="flex-shrink-0 w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg></div><div class="text-left"><h3 class="font-bold text-red-800 text-sm">Pengajuan Ditolak</h3><p class="text-red-700 text-xs">Silakan absen seperti biasa.</p></div></div><div class="w-full bg-red-200 h-1 mt-2 rounded-full overflow-hidden"><div class="bg-red-500 h-full animate-[progress-loading_30s_linear_forwards]" style="width: 100%"></div></div><p class="text-[10px] text-red-400 mt-1">Halaman akan berpindah otomatis dalam 30 detik</p></div>`;
                
                dashboardHTML += renderJadwalCard(); 
                dashboardHTML += renderScanButton(hasClockedIn, hasClockedOut);

                // 3. Jalankan Timer HANYA jika belum jalan
                if (!rejectionTimer) {
                    rejectionTimer = setTimeout(() => {
                        // Tandai sudah dilihat
                        localStorage.setItem(rejectionKey, 'true');
                        rejectionTimer = null;
                        
                        // Pindah ke Riwayat
                        switchTab('historyTab');
                        const submissionSec = document.getElementById('submissionSection');
                        if(submissionSec) {
                            submissionSec.classList.remove('hidden');
                            submissionSec.scrollIntoView({behavior: 'smooth'});
                        }
                        
                        // Penting: Jangan lupa nyalakan kembali logic dashboard untuk nanti
                        // (Fungsi switchTab akan handle stopLiveDashboard, tapi kita perlu reset state)
                    }, 30000); // 30 Detik
                }

            } else {
                // Jika SUDAH dismissed: Tampilkan normal & Pastikan Refresh Nyala
                if (!dashboardInterval) startLiveDashboard(); // Nyalakan refresh lagi
                
                dashboardHTML += renderJadwalCard(); 
                dashboardHTML += renderScanButton(hasClockedIn, hasClockedOut);
            }
        }
    } else {
        // Normal State
        if (rejectionTimer) { clearTimeout(rejectionTimer); rejectionTimer = null; } // Safety cleanup
        if (!dashboardInterval) startLiveDashboard(); // Safety restart refresh

        dashboardHTML += renderJadwalCard(); 
        dashboardHTML += renderScanButton(hasClockedIn, hasClockedOut);
    }
    
    ui.smartDashboard.innerHTML = dashboardHTML;
    
    if (!appState.isLeaveActive) { startLocationWatcher(); } 
    else { const widget = document.getElementById('locationWidget'); if (widget) widget.style.display = 'none'; }

    const btn = document.getElementById('smartActionBtn');
    if(btn && !btn.querySelector('button')?.hasAttribute('disabled')) { btn.addEventListener('click', startScanner); }

    checkAdminPrivileges();
}

// --- LOCATION WATCHER (TUNING AKURASI TINGGI) ---
function startLocationWatcher() {
    if (!("geolocation" in navigator)) return;
    
    const statusText = document.getElementById('locStatusText');
    const distText = document.getElementById('locDistanceText');
    const widgetIcon = document.querySelector('#locationWidget div div'); 
    
    if (!statusText) return;

    // Hentikan watcher lama jika ada (biar tidak bentrok/double)
    if (locationWatchId) navigator.geolocation.clearWatch(locationWatchId);

    locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            // Ambil akurasi (dalam meter) dari sinyal GPS
            const accuracy = position.coords.accuracy;
            
            // Hitung jarak ke sekolah
            const dist = getDistanceFromLatLonInMeters(
                position.coords.latitude, 
                position.coords.longitude, 
                VISUAL_CONFIG.LAT, 
                VISUAL_CONFIG.LNG
            );
            
            const distRounded = Math.ceil(dist);
            distText.textContent = `${distRounded} m`;

            // Logika Status
            if (distRounded <= VISUAL_CONFIG.RADIUS) {
                // MASUK AREA (HIJAU)
                statusText.textContent = "Di Dalam Area"; 
                statusText.className = "text-sm font-bold text-green-600";
                distText.className = "text-lg font-bold text-green-600"; 
                widgetIcon.className = "w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600";
            } else {
                // DILUAR AREA (MERAH)
                statusText.textContent = "Di Luar Area"; 
                statusText.className = "text-sm font-bold text-red-600";
                distText.className = "text-lg font-bold text-red-600"; 
                widgetIcon.className = "w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 animate-pulse";
            }
            
            // (Opsional) Tampilkan peringatan jika akurasi GPS buruk (> 50 meter)
            if (accuracy > 50) {
                statusText.textContent += " (Sinyal Lemah)";
                statusText.classList.add('text-orange-500');
            }
        },
        (error) => { 
            console.warn("GPS Error:", error);
            statusText.textContent = "Cari Sinyal..."; 
            statusText.className = "text-sm font-bold text-orange-500"; 
            distText.textContent = "--"; 
        },
        { 
            enableHighAccuracy: true, // Wajib ON untuk radius kecil
            maximumAge: 0,            // JANGAN pakai cache (Wajib data baru)
            timeout: 20000            // Beri waktu 20 detik sebelum menyerah (Biar kuat indoor)
        }
    );
}

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    var R = 6371; var dLat = deg2rad(lat2 - lat1); var dLon = deg2rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return (R * c) * 1000;
}
function deg2rad(deg) { return deg * (Math.PI / 180); }

// --- HELPERS ---
function updateIzinButtonState(isLocked) {
    if (!ui.izinBtn) return;
    if (isLocked) {
        ui.izinBtn.classList.add('opacity-50', 'grayscale', 'cursor-not-allowed'); ui.izinBtn.classList.remove('hover:bg-slate-50', 'active:scale-95');
        const statusText = ui.izinBtn.querySelector('span'); if(statusText) statusText.innerHTML = "Pengajuan Izin/Sakit <span class='text-[10px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded ml-2'>AKTIF</span>";
    } else {
        ui.izinBtn.classList.remove('opacity-50', 'grayscale', 'cursor-not-allowed'); ui.izinBtn.classList.add('hover:bg-slate-50', 'active:scale-95');
        const statusText = ui.izinBtn.querySelector('span'); if(statusText) statusText.textContent = "Pengajuan Izin/Sakit";
    }
}

function renderJadwalCard() {
    return `<div class="w-full max-w-sm bg-white border border-blue-50 rounded-2xl p-4 mb-6 shadow-sm relative overflow-hidden"><div class="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-4 -mt-4 z-0"></div><h3 class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 relative z-10 flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>Jadwal Absensi</h3><div class="flex justify-between items-center relative z-10"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg></div><div><p class="text-xs text-slate-400 font-medium">Jam Masuk</p><p class="text-sm font-bold text-slate-700">06:30 - 08:00</p></div></div><div class="h-8 w-px bg-slate-100"></div><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center"><svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg></div><div><p class="text-xs text-slate-400 font-medium">Jam Pulang</p><p class="text-sm font-bold text-slate-700">11:00 - 14:40</p></div></div></div></div>`;
}

function renderScanButton(hasClockedIn, hasClockedOut) {
    if (!hasClockedIn) {
        return `<div class="w-full max-w-sm relative group cursor-pointer active:scale-95 transition-transform duration-200" id="smartActionBtn"><div class="absolute -inset-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-3xl blur opacity-30 group-hover:opacity-60 transition duration-500"></div><button class="relative w-full bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white text-center shadow-xl flex flex-col items-center justify-center gap-3 min-h-[220px] overflow-hidden"><div class="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div><div class="bg-white/20 p-4 rounded-full backdrop-blur-md shadow-inner ring-1 ring-white/30"><svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg></div><div class="z-10"><h2 class="text-2xl font-bold tracking-tight">Absen Masuk</h2><p class="text-blue-100 text-xs mt-1 font-medium bg-blue-800/30 px-3 py-1 rounded-full border border-blue-500/30">Ketuk untuk Scan QR</p></div></button></div>`;
    } else if (hasClockedIn && !hasClockedOut) {
        const currentHour = new Date().getHours(); const isPulangAllowed = currentHour >= 11;
        const bgGradient = isPulangAllowed ? 'from-orange-500 to-red-600 shadow-orange-500/30 cursor-pointer' : 'from-slate-400 to-slate-500 cursor-not-allowed grayscale';
        const disabledAttr = isPulangAllowed ? '' : 'disabled'; const opacityClass = isPulangAllowed ? 'opacity-30 group-hover:opacity-60' : 'opacity-0';
        return `<div class="w-full max-w-sm relative group active:scale-95 transition-transform duration-200" id="smartActionBtn"><div class="absolute -inset-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-3xl blur ${opacityClass} transition duration-500"></div><button ${disabledAttr} class="relative w-full bg-gradient-to-br ${bgGradient} rounded-2xl p-6 text-white text-center shadow-xl flex flex-col items-center justify-center gap-3 min-h-[200px]"><div class="bg-white/20 p-3 rounded-full backdrop-blur-md ring-1 ring-white/30"><svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></div><div class="z-10"><h2 class="text-xl font-bold">Absen Pulang</h2><p class="text-white/90 text-xs mt-1 font-medium">${isPulangAllowed ? 'Ketuk untuk Scan Pulang' : 'Dibuka pukul 11:00 WIT'}</p></div></button></div>`;
    } else {
        return `<div class="w-full max-w-sm h-[280px] bg-gradient-to-br from-teal-400 to-emerald-500 rounded-3xl p-6 text-white flex flex-col items-center justify-center text-center shadow-xl shadow-teal-500/20 relative overflow-hidden"><div class="absolute top-0 left-0 w-full h-full opacity-10"><svg class="w-full h-full" fill="currentColor" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M0 100 C 20 0 50 0 100 100 Z"></path></svg></div><div class="bg-white/20 p-4 rounded-full backdrop-blur-md mb-4 animate-bounce shadow-lg"><svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg></div><h2 class="text-2xl font-bold relative z-10 mb-1">Sampai Jumpa!</h2><p class="text-teal-50 relative z-10 text-sm leading-relaxed max-w-[200px]">Absensi hari ini tuntas.</p><button onclick="triggerConfetti()" class="mt-6 px-5 py-2 bg-white/90 text-teal-700 rounded-full font-bold text-xs shadow-lg hover:bg-white transition active:scale-95">Anda Hebat 🎉</button></div>`;
    }
}

async function handleLogin(event) {
    event.preventDefault(); const idInput = ui.loginId.value.trim(); const pinInput = ui.loginPin.value.trim();
    if(!idInput || !pinInput) { showError("ID dan PIN wajib diisi!"); return; }
    ui.loginBtn.disabled = true; ui.loginSpinner.classList.remove('hidden'); ui.loginError.classList.add('hidden');
    try {
        const response = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'login', nama: idInput, pin: pinInput, deviceId: appState.deviceId }) });
        const result = await response.json();
        if (result.status === 'success') {
            ui.loginForm.classList.add('hidden'); ui.loggedInUserName.textContent = result.data.nama; ui.loginSuccessView.classList.remove('hidden');
            appState.currentUser = { nama: result.data.nama, id: idInput, profile: result.data.profile }; await AppStorage.saveUserSession(appState.currentUser);
            setTimeout(() => { ui.loginSuccessView.classList.add('hidden'); ui.loginPage.classList.add('hidden'); checkUserSession(); }, 1500);
        } else { throw new Error(result.message); }
    } catch (error) { ui.loginError.classList.remove('hidden'); ui.loginErrorText.textContent = error.message; ui.loginBtn.disabled = false; ui.loginSpinner.classList.add('hidden'); }
}

async function checkUserSession() {
    const userSession = await AppStorage.loadUserSession();
    if (userSession) {
        appState.currentUser = userSession; ui.loginPage.classList.add('hidden'); ui.loginSuccessView.classList.add('hidden'); ui.mainApp.classList.remove('hidden');
        switchTab('homeTab'); updateProfileData(); if (autoSyncInterval) clearInterval(autoSyncInterval); autoSyncInterval = setInterval(handleSync, 120000);
    } else { ui.mainApp.classList.add('hidden'); ui.loginPage.classList.remove('hidden'); ui.loginForm.classList.remove('hidden'); }
}

async function handleLogout() {
    if (autoSyncInterval) clearInterval(autoSyncInterval); await AppStorage.clearAllData(); appState.currentUser = null; window.location.reload(); 
}

function showMyDataModal() { showModal('myDataModal'); loadMyData(); }
async function loadMyData() {
    ui.myDataLoading.classList.remove('hidden'); ui.myDataContent.innerHTML = '';
    try {
        const profile = appState.currentUser.profile; if (!profile) throw new Error("Profil kosong.");
        let html = ''; for (const [key, value] of Object.entries(profile)) html += `<div class="flex justify-between py-3 border-b border-slate-100 last:border-b-0"><p class="text-slate-500 text-sm">${key}</p><p class="font-medium text-right text-sm text-slate-700">${value || '-'}</p></div>`;
        ui.myDataContent.innerHTML = html;
    } catch (e) { ui.myDataError.classList.remove('hidden'); } finally { ui.myDataLoading.classList.add('hidden'); }
}

// --- UPDATE FUNGSI PROFIL (MENDUKUNG FOTO) ---
function updateProfileData() {
    if(!appState.currentUser) return;

    // 1. Update Teks Dasar
    ui.profileName.textContent = appState.currentUser.nama;
    ui.profileEmail.textContent = appState.currentUser.profile['Email Belajar'] || appState.currentUser.profile['Email'] || '-';
    
    // 2. Siapkan Inisial (Cadangan)
    ui.profileInitials.textContent = appState.currentUser.nama.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase();
    ui.profileInitials.classList.remove('hidden'); // Reset: Tampilkan inisial dulu
    ui.profileImage.classList.add('hidden');       // Reset: Sembunyikan foto dulu

    // 3. Cek Apakah Ada Foto di Spreadsheet?
    // Pastikan nama kolom di spreadsheet adalah 'Foto URL' atau 'Foto'
    const photoUrl = appState.currentUser.profile['Foto URL'] || appState.currentUser.profile['Foto'];

    if (photoUrl && photoUrl.trim() !== "") {
        // Jika ada link foto:
        ui.profileImage.src = photoUrl;
        ui.profileImage.classList.remove('hidden'); // Munculkan foto
        ui.profileInitials.classList.add('hidden'); // Sembunyikan inisial
    }
}

// --- FITUR REAL-TIME DASHBOARD ---
function startLiveDashboard() {
    // Hentikan interval lama jika ada (biar tidak double)
    stopLiveDashboard();
    
    console.log("Memulai Live Dashboard...");
    
    // Jalankan pertama kali langsung
    refreshDataBackground();

    // Jalankan ulang setiap 15 detik (15000 ms)
    // Jangan terlalu cepat (misal 1 detik) nanti Google memblokir script Anda
    dashboardInterval = setInterval(refreshDataBackground, 15000);
}

function stopLiveDashboard() {
    if (dashboardInterval) {
        clearInterval(dashboardInterval);
        dashboardInterval = null;
        console.log("Live Dashboard Berhenti.");
    }
}

async function refreshDataBackground() {
    // Hanya jalan jika user sedang login
    if (!appState.currentUser) return;

    try {
        // Fetch data ke server (silent mode)
        const res = await fetch(`${CONFIG.API_URL}?nama=${encodeURIComponent(appState.currentUser.nama)}`);
        const data = await res.json();
        
        if(!data.error) {
            // Simpan ke cache agar fungsi lain bisa pakai
            await AppStorage.saveCache('history', data);
            
            // Update tampilan Dashboard
            // (Hanya jika kita sedang di tab Home, untuk hemat resource)
            const homeTab = document.getElementById('homeTab');
            if (homeTab && !homeTab.classList.contains('hidden')) {
                updateSmartDashboard();
                console.log("Dashboard diperbarui otomatis.");
            }
        }
    } catch (e) {
        console.warn("Gagal auto-refresh (Sinyal lemah?)", e);
    }
}

function startScanner() {
    var permissions = cordova.plugins.permissions;
    if (permissions) {
        var list = [permissions.CAMERA, permissions.ACCESS_FINE_LOCATION, permissions.ACCESS_COARSE_LOCATION];
        permissions.requestPermissions(list, (s) => { if(s.hasPermission) openCamera(); else openCamera(); }, () => alert("Izin Ditolak"));
    } else openCamera();
}

function openCamera() {
    showModal('scanModal'); setTimeout(() => {
        html5QrCode = new Html5Qrcode("reader"); html5QrCode.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, handleScanSuccess).catch(err => { ui.scanResult.textContent = "Kamera Error"; });
    }, 300);
}

function stopScanner() { if (html5QrCode) html5QrCode.stop().then(() => html5QrCode.clear()).catch(e => {}); hideModal('scanModal'); }

async function handleScanSuccess(decodedText) {
    stopScanner(); ui.smartDashboard.innerHTML = createLoadingCard("Memproses...", "Mengirim data...");
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'absen', namaGuru: appState.currentUser.nama, latitude: pos.coords.latitude, longitude: pos.coords.longitude }) });
                const result = await res.json();
                if(result.status === 'success') { if(typeof Tone !== 'undefined') playSuccessSound(); alert("BERHASIL!\n\n" + result.message); }
                else { if(typeof Tone !== 'undefined') playErrorSound(); alert("GAGAL!\n\n" + result.message); }
                await loadAttendanceHistory(true); updateSmartDashboard();
            } catch (e) { alert("Error: " + e.message); updateSmartDashboard(); }
        }, (err) => { alert("GPS Error!"); updateSmartDashboard(); }, { enableHighAccuracy: true, timeout: 15000 });
    } else { alert("No GPS"); updateSmartDashboard(); }
}

async function handleIzinSubmit(e) {
    e.preventDefault(); const tipe = ui.izinType.value; const alasan = ui.izinReason.value.trim();
    if (!alasan) { alert("Isi alasan!"); return; }
    hideModal('izinModal'); ui.smartDashboard.innerHTML = createLoadingCard("Mengirim...", "Mohon tunggu...");
    try {
        const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'izin', namaGuru: appState.currentUser.nama, tipe: tipe, alasan: alasan }) });
        const result = await res.json();
        if (result.status === 'success') { if(typeof Tone !== 'undefined') playSuccessSound(); alert("BERHASIL!\n\n" + result.message); ui.izinReason.value = ''; }
        else { if(typeof Tone !== 'undefined') playErrorSound(); alert("GAGAL!\n\n" + result.message); }
        await loadAttendanceHistory(true); updateSmartDashboard();
    } catch (e) { alert("Error: " + e.message); updateSmartDashboard(); }
}

async function loadAttendanceHistory(force = false) {
    ui.historyLoading.classList.remove('hidden'); ui.historyContent.classList.add('hidden');
    try {
        let data; const cached = await AppStorage.loadCache('history');
        if (cached && !force) data = cached;
        else {
            // --- PERBAIKAN DI SINI: MENAMBAHKAN ANTI-CACHE (&_t=...) ---
            // Kita tambahkan waktu detik ini agar HP tidak mengambil data lama
            const antiCache = new Date().getTime(); 
            const res = await fetch(`${CONFIG.API_URL}?nama=${encodeURIComponent(appState.currentUser.nama)}&_t=${antiCache}`);
            
            data = await res.json();
            if(!data.error) await AppStorage.saveCache('history', data);
        }
        renderHistoryList(data);

    } catch (e) { ui.historyLoading.classList.add('hidden'); ui.historyError.classList.remove('hidden'); }
}

function renderHistoryList(data) {
    ui.historyLoading.classList.add('hidden');
    ui.historyContent.classList.remove('hidden');
    
    // --- 1. LOGIKA STATISTIK (Tetap menghitung Total Sebulan) ---
    let uniqueDaysHadir = new Set();
    let countTelat = 0;
    let uniqueIzinEvents = new Set();
    
    const getDateStr = (iso) => iso.substring(0, 10);

    if (data && data.length > 0 && !data.error) {
        data.forEach(item => {
            const text = item.keterangan.toUpperCase();
            const dateOnly = getDateStr(item.isoTimestamp);

            if (text.includes('MASUK') || text.includes('PULANG') || text.includes('TERLAMBAT')) {
                uniqueDaysHadir.add(dateOnly);
            }
            if (text.includes('TERLAMBAT')) countTelat++;
            
            // Statistik menghitung semua pengajuan yang sah (tidak ditolak & bukan virtual)
            if (text.includes('PENGAJUAN') && !text.includes('DITOLAK') && !text.includes('|')) {
                uniqueIzinEvents.add(dateOnly); 
            }
        });
    }
    updateStatsUI(uniqueDaysHadir.size, countTelat, uniqueIzinEvents.size);

    // --- 2. PEMISAHAN LIST (REVISI KHUSUS: HANYA DISETUJUI) ---
    const todayStr = new Date().toLocaleDateString('en-CA'); 
    
    let dailyRecords = [];
    let submissionRecords = [];

    if (data && !data.error) {
        data.forEach(item => {
            const itemDate = getDateStr(item.isoTimestamp);
            const text = item.keterangan;
            
            // KATEGORI A: ABSENSI HARIAN (Hanya Hari Ini)
            if ((text.includes('Masuk') || text.includes('Pulang') || text.includes('Terlambat')) && itemDate === todayStr) {
                dailyRecords.push(item);
            }
            
            // KATEGORI B: RIWAYAT PENGAJUAN (Sesuai Aturan Anda)
            // Syarat:
            // 1. Harus PENGAJUAN
            // 2. Harus DISETUJUI (Menunggu/Ditolak TIDAK TAMPIL)
            // 3. Jangan ambil data virtual (yang ada tanda '|')
            // 4. Data Server sudah filter Bulan & Tahun berjalan, jadi aman.
            else if (text.includes('PENGAJUAN')) {
                if (text.includes('DISETUJUI') && !text.includes('|')) {
                    submissionRecords.push(item);
                }
            }
        });
    }

    // --- 3. RENDER TAMPILAN ---
    
    // Render Absensi Harian
    if (dailyRecords.length === 0) {
        ui.dailyList.innerHTML = `<div class="text-center py-6 opacity-50 bg-slate-50 rounded-xl border border-slate-100 border-dashed"><p class="text-xs">Belum ada absensi hari ini.</p></div>`;
    } else {
        ui.dailyList.innerHTML = dailyRecords.map((item, idx) => createHistoryItemHTML(item, idx)).join('');
    }

    // Render Riwayat Pengajuan (Hanya yang DISETUJUI)
    if (submissionRecords.length === 0) {
        ui.submissionSection.classList.add('hidden');
        ui.submissionList.innerHTML = '';
    } else {
        ui.submissionSection.classList.remove('hidden');
        ui.submissionList.innerHTML = submissionRecords.map((item, idx) => createHistoryItemHTML(item, idx)).join('');
    }
}

// Fungsi Helper untuk membuat HTML Item (UPDATED: FORMAT 3 BARIS & FULL DATE)
function createHistoryItemHTML(item, idx) {
    let color = 'bg-blue-100 text-blue-600';
    let icon = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    
    // --- 1. LOGIKA WARNA & IKON ---
    if(item.keterangan.includes('Pulang')) {
        color = 'bg-orange-100 text-orange-600';
        icon = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>';
    }
    // Logika Pengajuan
    if(item.keterangan.includes('PENGAJUAN')) {
        color = 'bg-purple-100 text-purple-600';
        icon = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>';
        
        if(item.keterangan.includes('DISETUJUI')) color = 'bg-green-100 text-green-600';
        if(item.keterangan.includes('DITOLAK')) color = 'bg-red-100 text-red-600';
    }

    // --- 2. FORMAT TANGGAL LENGKAP (DD/MM/YYYY HH:mm:ss) ---
    const d = new Date(item.isoTimestamp);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    const second = String(d.getSeconds()).padStart(2, '0');
    
    // Hasil: 19/01/2026 22:57:35
    const fullDateTime = `${day}/${month}/${year} ${hour}:${minute}:${second}`;
    const shortTime = `${hour}:${minute} WIT`;


    // --- 3. FORMAT TEXT (MEMISAHKAN JUDUL & STATUS) ---
    let mainTitle = item.keterangan;
    let statusLine = '';

    // Cek apakah ini Pengajuan yang punya status dalam kurung siku [...]
    // Contoh Input: "PENGAJUAN - Sakit [DISETUJUI]"
    if (mainTitle.includes('PENGAJUAN') && mainTitle.includes('[')) {
        const splitText = mainTitle.split(' [');
        mainTitle = splitText[0]; // Baris 1: PENGAJUAN - Sakit
        statusLine = '[' + splitText[1]; // Baris 2: [DISETUJUI]
    }

    // --- 4. RENDER HTML ---
    // Kita gunakan flex-col untuk menyusun 3 baris ke bawah
    
    let contentHTML = '';

    // Jika ada status (Berarti ini Pengajuan)
    if (statusLine) {
        contentHTML = `
            <div class="flex flex-col">
                <span class="font-bold text-slate-800 text-sm">${mainTitle}</span>
                <span class="text-xs font-semibold mt-0.5 opacity-90">${statusLine}</span>
                <span class="text-[10px] text-slate-400 mt-1 font-mono">${fullDateTime}</span>
            </div>
        `;
    } else {
        // Jika Absen Biasa (Masuk/Pulang) - Format 2 Baris standar
        contentHTML = `
            <div class="flex flex-col">
                <span class="font-bold text-slate-800 text-sm">${mainTitle}</span>
                <span class="text-xs text-slate-400 mt-1 font-mono">${shortTime}</span>
            </div>
        `;
    }

    return `
    <div class="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-start animate-fadeInUp" style="animation-delay:${idx*50}ms">
        <div class="flex-shrink-0 w-10 h-10 rounded-full ${color} flex items-center justify-center mr-4 mt-1">
            ${icon}
        </div>
        <div class="flex-grow">
            ${contentHTML}
        </div>
    </div>`;
}

function updateStatsUI(hadir, telat, izin) {
    const animateValue = (id, start, end, duration) => {
        const obj = document.getElementById(id); if(!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) window.requestAnimationFrame(step);
        }; window.requestAnimationFrame(step);
    };
    animateValue("statHadir", 0, hadir, 1000); animateValue("statTelat", 0, telat, 1000); animateValue("statIzin", 0, izin, 1000);
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    if(ui.statsMonthName) ui.statsMonthName.textContent = monthNames[new Date().getMonth()];
}

async function handleSync() {
    ui.syncBtn.disabled = true; ui.syncIcon.classList.add('hidden'); ui.syncSpinner.classList.remove('hidden');
    showToast("Menyinkronkan...");
    try { await loadAttendanceHistory(true); await updateSmartDashboard(); showToast("Tersinkron!"); } 
    catch (e) { showToast("Gagal Sync"); }
    finally { ui.syncBtn.disabled = false; ui.syncIcon.classList.remove('hidden'); ui.syncSpinner.classList.add('hidden'); }
}

function createLoadingCard(title, sub) { return `<div class="p-10 text-center"><div class="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div><h3 class="font-bold text-lg">${title}</h3><p class="text-sm text-slate-500">${sub}</p></div>`; }
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function hideModal(id) { document.getElementById(id).classList.add('hidden'); }
function showError(msg) { ui.loginError.classList.remove('hidden'); ui.loginErrorText.textContent = msg; ui.loginBtn.disabled = false; ui.loginSpinner.classList.add('hidden'); }
function showToast(msg) { ui.toastMessage.textContent = msg; ui.toast.classList.remove('opacity-0'); setTimeout(() => ui.toast.classList.add('opacity-0'), 3000); }
function setAppHeight() { document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`); }

function triggerConfetti() { const duration = 3000, end = Date.now() + duration; (function frame() { confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } }); confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } }); if (Date.now() < end) requestAnimationFrame(frame); }()); }
function playSuccessSound() { if(typeof Tone !== 'undefined') { const synth = new Tone.Synth().toDestination(); synth.triggerAttackRelease("C5", "8n"); } }
function playErrorSound() { if(typeof Tone !== 'undefined') { const synth = new Tone.Synth().toDestination(); synth.triggerAttackRelease("A3", "8n"); setTimeout(() => synth.triggerAttackRelease("G3", "8n"), 200); } }

// --- LOGIKA ADMIN / KEPALA SEKOLAH ---
// Daftar Nama yang diizinkan (Copy persis dari spreadsheet)
const ADMIN_LIST = ["Edward Domakubun", "Soferet Sefatja Domakubun.S.Pd"];
let selectedRequestIso = null;

// Panggil fungsi ini di dalam updateSmartDashboard()
// Caranya: Tambahkan baris "checkAdminPrivileges();" di bagian akhir updateSmartDashboard()
function checkAdminPrivileges() {
    if (!appState.currentUser) return;
    
    // Cek apakah nama user ada di daftar Admin
    if (ADMIN_LIST.includes(appState.currentUser.nama)) {
        renderAdminButton();
    }
}

// --- LOGIKA ADMIN UPDATE ---

// 1. UPDATE: Tombol Admin Pindah ke Profil
function renderAdminButton() {
    if (document.getElementById('adminBtnContainer')) return;

    // Target: Di bawah tombol Izin (izinBtn)
    // Kita cari elemen parent dari tombol izin agar posisinya rapi
    const izinBtn = document.getElementById('izinBtn');
    if (!izinBtn) return;
    
    // Kita buat container baru khusus Admin di bawah container menu utama
    const menuContainer = izinBtn.closest('.bg-white\\/80'); // Cari kotak putih pembungkus menu
    if (!menuContainer) return;

    const adminHtml = `
    <div id="adminBtnContainer" class="mt-6 animate-fadeInUp">
        <h3 class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-2">Area Kepala Sekolah</h3>
        <button onclick="openAdminPanel()" class="w-full bg-slate-800 text-white p-4 rounded-2xl shadow-xl shadow-slate-500/20 flex items-center justify-between group active:scale-95 transition-transform border border-slate-700">
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center text-yellow-400 shadow-inner">
                    <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div class="text-left">
                    <p class="text-xs text-slate-400 font-bold uppercase mb-0.5">Mode Admin</p>
                    <p class="text-sm font-bold text-white">Kelola Izin Guru</p>
                </div>
            </div>
            <div class="w-8 h-8 rounded-full bg-slate-700 text-slate-300 flex items-center justify-center group-hover:bg-yellow-500 group-hover:text-slate-900 transition-colors">
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </div>
        </button>
    </div>
    `;

    // Masukkan SETELAH kotak menu (insertAdjacentHTML 'afterend')
    menuContainer.insertAdjacentHTML('afterend', adminHtml);
}

// 2. UPDATE: Buka Panel & Load DUA Data
function openAdminPanel() {
    showModal('adminModal');
    loadPendingRequests(); // Load yang menunggu
    loadActiveLeaves();    // Load yang aktif (Fitur Baru)
}

// 3. FUNGSI LOAD PENDING (Masih sama, sesuaikan ID container)
async function loadPendingRequests() {
    const container = document.getElementById('adminPendingList');
    container.innerHTML = '<div class="text-center py-2"><div class="animate-spin w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full mx-auto"></div></div>';

    try {
        const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'get_pending' }) });
        const result = await res.json();
        
        if (result.data && result.data.length > 0) {
            container.innerHTML = result.data.map(item => `
                <div class="bg-yellow-50 p-3 rounded-xl border border-yellow-100 flex flex-col gap-2">
                    <div class="flex justify-between items-start">
                        <div>
                            <p class="font-bold text-slate-800 text-sm">${item.nama}</p>
                            <span class="bg-white text-yellow-700 text-[10px] font-bold px-2 py-0.5 rounded border border-yellow-200">${item.tipe}</span>
                        </div>
                        <button onclick="prepareApproval('${item.iso}', '${item.nama}')" class="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm hover:bg-blue-700">
                            Proses
                        </button>
                    </div>
                    <p class="text-xs text-slate-500 italic">"${item.alasan}"</p>
                </div>
            `).join('');
        } else {
            container.innerHTML = `<div class="text-center py-4 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">Tidak ada pengajuan baru.</div>`;
        }
    } catch (e) { container.innerHTML = '<p class="text-center text-red-500 text-xs">Gagal memuat.</p>'; }
}

// 4. FUNGSI BARU: LOAD ACTIVE LEAVES (SEDANG IZIN)
async function loadActiveLeaves() {
    const container = document.getElementById('adminActiveList');
    container.innerHTML = '<div class="text-center py-2"><div class="animate-spin w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full mx-auto"></div></div>';

    try {
        const res = await fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify({ action: 'get_active_leaves' }) });
        const result = await res.json();
        
        if (result.data && result.data.length > 0) {
            container.innerHTML = result.data.map(item => `
                <div class="bg-green-50 p-3 rounded-xl border border-green-100 flex flex-col gap-2">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="font-bold text-slate-800 text-sm">${item.nama}</p>
                            <p class="text-[10px] text-green-700 font-medium">Sampai: ${item.tglSelesai}</p>
                        </div>
                        <button onclick="finishLeaveNow('${item.iso}', '${item.nama}')" class="bg-white border border-green-200 text-green-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-100 flex items-center gap-1">
                            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                            Selesaikan
                        </button>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = `<div class="text-center py-4 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">Tidak ada guru yang sedang izin.</div>`;
        }
    } catch (e) { container.innerHTML = '<p class="text-center text-red-500 text-xs">Gagal memuat.</p>'; }
}

// 5. FUNGSI BARU: EKSEKUSI SELESAI (REVISI AUTO-REFRESH)
async function finishLeaveNow(iso, nama) {
    if(!confirm(`Konfirmasi:\n\nApakah Anda yakin ingin menyelesaikan status izin untuk ${nama} sekarang?\n\nGuru akan bisa absen kembali mulai hari ini.`)) return;

    showToast("Memproses...");
    
    try {
        const res = await fetch(CONFIG.API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                action: 'force_finish',
                targetIso: iso,
                adminName: appState.currentUser.nama
            }) 
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            showToast("Berhasil Diselesaikan!");
            
            // 1. Refresh List Admin agar item hilang dari daftar
            loadActiveLeaves(); 
            
            // 2. TAMBAHAN PENTING: Refresh Data Aplikasi Utama
            // Ini menjamin jika Anda mengedit diri sendiri, dashboard langsung berubah
            await loadAttendanceHistory(true); 
            updateSmartDashboard();
            
        } else {
            alert("Gagal: " + result.message);
        }
    } catch (e) {
        alert("Gagal koneksi server.");
    }
}

function prepareApproval(iso, nama) {
    selectedRequestIso = iso;
    document.getElementById('adminTargetName').textContent = nama;
    
    // Set default date ke hari ini
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('adminStartDate').value = today;
    document.getElementById('adminEndDate').value = today;
    
    showModal('adminActionModal');
}

async function submitApproval(decision) {
    const tglMulai = document.getElementById('adminStartDate').value;
    const tglSelesai = document.getElementById('adminEndDate').value;

    if (decision === 'DISETUJUI' && (!tglMulai || !tglSelesai)) {
        alert("Harap isi tanggal mulai dan selesai!");
        return;
    }

    // Tampilan Loading di tombol
    const loadingText = decision === 'DISETUJUI' ? 'Menyetujui...' : 'Menolak...';
    showToast(loadingText);
    hideModal('adminActionModal');
    hideModal('adminModal');

    try {
        const res = await fetch(CONFIG.API_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                action: 'approve_reject',
                targetIso: selectedRequestIso,
                decision: decision,
                tglMulai: tglMulai,
                tglSelesai: tglSelesai,
                adminName: appState.currentUser.nama
            }) 
        });
        const result = await res.json();
        
        if (result.status === 'success') {
            alert(result.message);
            // Refresh dashboard (karena mungkin admin meng-approve dirinya sendiri walau jarang terjadi)
            updateSmartDashboard();
        } else {
            alert("Gagal: " + result.message);
        }
    } catch (e) {
        alert("Terjadi kesalahan koneksi.");
    }
}

const AppStorage = {
    DB_NAME: 'presensisaya_53', 
    openDB: function() { return new Promise((resolve, reject) => { const req = indexedDB.open(this.DB_NAME, 1); req.onupgradeneeded = e => { const db = e.target.result; if(!db.objectStoreNames.contains('session')) db.createObjectStore('session', {keyPath: 'key'}); }; req.onsuccess = e => resolve(e.target.result); req.onerror = e => reject(e); }); },
    saveUserSession: async function(user) { const db = await this.openDB(); const tx = db.transaction('session', 'readwrite'); tx.objectStore('session').put({ key: 'user', user: user }); },
    loadUserSession: async function() { const db = await this.openDB(); return new Promise(resolve => { const req = db.transaction('session', 'readonly').objectStore('session').get('user'); req.onsuccess = () => resolve(req.result ? req.result.user : null); }); },
    saveCache: async function(key, data) { const db = await this.openDB(); const tx = db.transaction('session', 'readwrite'); tx.objectStore('session').put({ key: key, data: data }); },
    loadCache: async function(key) { const db = await this.openDB(); return new Promise(resolve => { const req = db.transaction('session', 'readonly').objectStore('session').get(key); req.onsuccess = () => resolve(req.result ? req.result.data : null); }); },
    clearAllData: async function() { const db = await this.openDB(); const tx = db.transaction('session', 'readwrite'); tx.objectStore('session').clear(); }
};

document.addEventListener('deviceready', initializeApp, false);